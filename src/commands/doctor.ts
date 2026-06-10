import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { findWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { readDevspecConfig } from "../core/config.js";
import { fragmentExists } from "../core/templates.js";

const execFileAsync = promisify(execFile);

interface DoctorCheck {
  id: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

const BACKEND_TOOLS: Record<string, { cmd: string; args: string[]; installUrl: string }> = {
  dotnet: {
    cmd: "dotnet",
    args: ["--version"],
    installUrl: "https://dotnet.microsoft.com/download",
  },
  "node-typescript": {
    cmd: "node",
    args: ["--version"],
    installUrl: "https://nodejs.org",
  },
  rust: {
    cmd: "cargo",
    args: ["--version"],
    installUrl: "https://rustup.rs",
  },
};

export const doctorCommand = new Command("doctor")
  .description("Diagnose common DevSpec setup problems")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (options: { json: boolean }) => {
    const checks: DoctorCheck[] = [];

    const root = await findWorkspaceRoot();
    checks.push({
      id: "workspace",
      ok: root !== null,
      detail: root
        ? `workspace at ${root}`
        : `no .devspec/ found walking up from ${process.cwd()}`,
      fix: root
        ? undefined
        : "Run `devspec init --backend <name> --architecture <name> --methodology <name>` in your repo root",
    });

    if (!root) {
      report(checks, options.json);
      return;
    }

    let config;
    try {
      config = await readDevspecConfig(root);
      checks.push({
        id: "config",
        ok: true,
        detail: `devspec.yaml: backend=${config.backend}, architecture=${config.architecture}, methodology=${config.methodology}`,
      });
    } catch (err) {
      checks.push({
        id: "config",
        ok: false,
        detail: `devspec.yaml could not be parsed: ${(err as Error).message}`,
        fix: "Edit .devspec/devspec.yaml to restore valid YAML, or rerun `devspec init --force`",
      });
      report(checks, options.json);
      return;
    }

    const axisChoices: Array<[Parameters<typeof fragmentExists>[0], string]> = [
      ["backend", config.backend],
      ["architecture", config.architecture],
      ["methodology", config.methodology],
    ];
    if (config.frontend) axisChoices.push(["frontend", config.frontend]);
    if (config.infrastructure) axisChoices.push(["infrastructure", config.infrastructure]);
    if (config.pipeline) axisChoices.push(["pipeline", config.pipeline]);

    for (const [axis, name] of axisChoices) {
      const exists = await fragmentExists(axis, name);
      checks.push({
        id: `pack.${axis}`,
        ok: exists,
        detail: exists
          ? `${axis}/${name} fragment installed`
          : `${axis}/${name} fragment is missing`,
        fix: exists
          ? undefined
          : `Reinstall devspec or rerun \`devspec init\` with a valid ${axis} name`,
      });
    }

    const toolInfo = BACKEND_TOOLS[config.backend];
    if (toolInfo) {
      const toolCheck = await runTool(toolInfo.cmd, toolInfo.args);
      checks.push({
        id: `tool.${toolInfo.cmd}`,
        ok: toolCheck.ok,
        detail: toolCheck.ok
          ? `${toolInfo.cmd} ${toolCheck.output}`
          : `${toolInfo.cmd} not found on PATH`,
        fix: toolCheck.ok
          ? undefined
          : `Install ${toolInfo.cmd}: ${toolInfo.installUrl}`,
      });
    }

    const standardsPath = devspecPath(root, "standards", "standards.md");
    const standardsOk = await fs.pathExists(standardsPath);
    checks.push({
      id: "standards",
      ok: standardsOk,
      detail: standardsOk
        ? `standards/standards.md is present`
        : `standards/standards.md is missing`,
      fix: standardsOk ? undefined : `Rerun \`devspec init --force\` to regenerate`,
    });

    const projectsRoot = devspecPath(root, "projects");
    if (await fs.pathExists(projectsRoot)) {
      const slugs = (await fs.readdir(projectsRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      const malformed: string[] = [];
      for (const slug of slugs) {
        const statusFile = path.join(projectsRoot, slug, "status.yaml");
        if (!(await fs.pathExists(statusFile))) {
          malformed.push(`${slug} (missing status.yaml)`);
          continue;
        }
        try {
          YAML.parse(await fs.readFile(statusFile, "utf8"));
        } catch (err) {
          malformed.push(`${slug} (${(err as Error).message})`);
        }
      }
      checks.push({
        id: "projects",
        ok: malformed.length === 0,
        detail:
          malformed.length === 0
            ? `${slugs.length} change(s), all status.yaml files parse`
            : `${malformed.length} change(s) have malformed status.yaml`,
        fix:
          malformed.length === 0
            ? undefined
            : `Inspect: ${malformed.slice(0, 3).join("; ")}${malformed.length > 3 ? `, +${malformed.length - 3} more` : ""}`,
      });
    }

    const vscodePath = path.join(root, ".vscode", "settings.json");
    const vscodeOk = await fs.pathExists(vscodePath);
    checks.push({
      id: "env.vscode",
      ok: vscodeOk,
      detail: vscodeOk
        ? `.vscode/settings.json is present`
        : `.vscode/settings.json not generated`,
      fix: vscodeOk ? undefined : `Run \`devspec env generate\` to emit editor settings`,
    });

    report(checks, options.json);
  });

async function runTool(cmd: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 5000 });
    return { ok: true, output: stdout.trim().split(/\r?\n/)[0] };
  } catch (err) {
    return { ok: false, output: (err as Error).message };
  }
}

function report(checks: DoctorCheck[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(checks, null, 2));
    process.exitCode = checks.some((c) => !c.ok) ? 1 : 0;
    return;
  }
  console.log(chalk.bold("DevSpec doctor"));
  for (const c of checks) {
    const tag = c.ok ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${tag}  ${c.id} — ${c.detail}`);
    if (!c.ok && c.fix) {
      console.log(chalk.dim(`       fix: ${c.fix}`));
    }
  }
  console.log("");
  const failed = checks.filter((c) => !c.ok).length;
  if (failed === 0) {
    console.log(chalk.green(`All ${checks.length} checks passed.`));
  } else {
    console.log(chalk.red(`${failed} of ${checks.length} checks failed.`));
    process.exitCode = 1;
  }
}
