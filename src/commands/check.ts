import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { readDevspecConfig } from "../core/config.js";
import { cmd, nextStep } from "../core/hints.js";

type CheckResult = {
  id: string;
  ok: boolean;
  message: string;
};

const BACKEND_EXTENSIONS: Record<string, string[]> = {
  dotnet: [".cs"],
  "node-typescript": [".ts", ".tsx"],
  rust: [".rs"],
  python: [".py"],
  go: [".go"],
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "bin",
  "obj",
  "dist",
  "build",
  ".next",
  ".devspec",
  "target",
]);

export const checkCommand = new Command("check")
  .description("Run DevSpec workspace checks")
  .option("--json", "Output results as JSON (for CI and tooling)", false)
  .action(async (options: { json: boolean }) => {
    const root = await requireWorkspaceRoot();
    const config = await readDevspecConfig(root);
    const results: CheckResult[] = [];

    results.push({
      id: "workspace",
      ok: true,
      message: `at ${path.relative(process.cwd(), root) || "."} — backend=${config.backend}, architecture=${config.architecture}, methodology=${config.methodology}`,
    });

    results.push({
      id: "company.tech-stack",
      ok: await fs.pathExists(devspecPath(root, "company", "tech-stack.yaml")),
      message: "company/tech-stack.yaml is present",
    });

    results.push({
      id: "standards",
      ok: await fs.pathExists(devspecPath(root, "standards", "standards.md")),
      message: "standards/standards.md is present",
    });

    results.push({
      id: "env.vscode",
      ok: await fs.pathExists(path.join(root, ".vscode", "settings.json")),
      message: ".vscode/settings.json is present (run `devspec env generate`)",
    });

    const projectsRoot = devspecPath(root, "projects");
    if (await fs.pathExists(projectsRoot)) {
      const slugs = await fs.readdir(projectsRoot);
      for (const slug of slugs) {
        const statusFile = path.join(projectsRoot, slug, "status.yaml");
        if (!(await fs.pathExists(statusFile))) continue;
        const status = YAML.parse(await fs.readFile(statusFile, "utf8")) ?? {};
        const stages = status.stages ?? {};
        const incomplete = Object.entries(stages)
          .filter(([, v]) => v !== "done")
          .map(([k]) => k);
        results.push({
          id: `project.${slug}`,
          ok: incomplete.length === 0,
          message:
            incomplete.length === 0
              ? `change "${slug}" — all stages done`
              : `change "${slug}" — pending: ${incomplete.join(", ")}`,
        });
      }
    }

    const archResult = await runArchitectureCheck(root, config);
    if (archResult) results.push(archResult);

    const failed = results.filter((r) => !r.ok).length;

    if (options.json) {
      console.log(
        JSON.stringify(
          { ok: failed === 0, total: results.length, failed, results },
          null,
          2
        )
      );
      if (failed > 0) process.exitCode = 1;
      return;
    }

    for (const r of results) {
      const tag = r.ok ? chalk.green("PASS") : chalk.red("FAIL");
      console.log(`  ${tag}  ${r.id} — ${r.message}`);
    }

    console.log("");
    if (failed === 0) {
      console.log(chalk.green(`All ${results.length} checks passed.`));
      nextStep(`${cmd("devspec status")} for change-level progress`);
    } else {
      console.log(chalk.red(`${failed} of ${results.length} checks failed.`));
      nextStep(`fix the failures and re-run, or ${cmd("devspec doctor")} for setup help`);
      process.exitCode = 1;
    }
  });

async function runArchitectureCheck(
  root: string,
  config: { backend: string; architecture: string }
): Promise<CheckResult | null> {
  const extensions = BACKEND_EXTENSIONS[config.backend];
  if (!extensions) {
    return {
      id: `guardrail.${config.architecture}`,
      ok: true,
      message: `no guardrail rules implemented for backend "${config.backend}" yet`,
    };
  }

  if (config.architecture === "clean-architecture") {
    const violations = await findImportsFromForbiddenLayers(
      root,
      extensions,
      "Domain",
      /\b(Infrastructure|Web|Api|Presentation)\b/i
    );
    return makeViolationResult("guardrail.clean-architecture", violations, "Clean Architecture");
  }

  if (config.architecture === "layered") {
    const violations = await findImportsFromForbiddenLayers(
      root,
      extensions,
      "Business",
      /\b(Presentation|Web|Ui|Api)\b/i
    );
    return makeViolationResult("guardrail.layered", violations, "Layered architecture");
  }

  return {
    id: `guardrail.${config.architecture}`,
    ok: true,
    message: `no guardrail rules implemented for architecture "${config.architecture}" yet`,
  };
}

function makeViolationResult(
  id: string,
  violations: string[],
  label: string
): CheckResult {
  if (violations.length === 0) {
    return { id, ok: true, message: `${label} layer dependencies look clean` };
  }
  const preview = violations.slice(0, 5).join("\n    ");
  const tail = violations.length > 5 ? `\n    (+${violations.length - 5} more)` : "";
  return {
    id,
    ok: false,
    message: `${label} layer violations:\n    ${preview}${tail}`,
  };
}

async function findImportsFromForbiddenLayers(
  root: string,
  extensions: string[],
  fromLayer: string,
  forbidden: RegExp
): Promise<string[]> {
  const violations: string[] = [];
  const fromLayerLower = fromLayer.toLowerCase();
  await walk(root, async (file) => {
    if (!extensions.some((ext) => file.endsWith(ext))) return;
    const segments = file.split(path.sep).map((s) => s.toLowerCase());
    if (!segments.includes(fromLayerLower)) return;
    const text = await fs.readFile(file, "utf8");
    const importRegex = /\b(?:using|import|from|use)\s+([^;'"\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(text)) !== null) {
      if (forbidden.test(match[1])) {
        violations.push(`${path.relative(root, file)} → ${match[1]}`);
      }
    }
  });
  return violations;
}

async function walk(
  dir: string,
  visit: (file: string) => Promise<void>
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, visit);
    } else if (entry.isFile()) {
      await visit(full);
    }
  }
}
