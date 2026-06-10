import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { devspecPath } from "../core/workspace.js";
import {
  fragmentExists,
  fragmentPath,
  listFragments,
  packsRoot,
  type Axis,
} from "../core/templates.js";
import { generateClaudeMd } from "./claude.js";
import { syncClaudeAssets } from "../core/claude-assets.js";

interface InitOptions {
  backend: string;
  frontend?: string;
  architecture: string;
  methodology: string;
  infrastructure?: string;
  pipeline?: string;
  force: boolean;
}

interface AxisChoice {
  axis: Axis;
  name: string;
  required: boolean;
}

export const initCommand = new Command("init")
  .description("Initialise DevSpec in the current repository")
  .requiredOption("--backend <name>", "Backend language/runtime (e.g. dotnet, node-typescript, rust, python, go)")
  .requiredOption("--architecture <name>", "Architecture pattern (e.g. clean-architecture, layered, vertical-slice)")
  .requiredOption("--methodology <name>", "Methodology (e.g. ddd, tdd, bdd, lightweight)")
  .option(
    "--frontend <name>",
    "Frontend framework (svelte, blazor, react, vue) — opt-in"
  )
  .option("--infrastructure <name>", "Infrastructure pattern (kubernetes, terraform) — opt-in")
  .option("--pipeline <name>", "CI/CD pipeline (e.g. github) — opt-in; enforces security/lint/quality/test gates")
  .option("--force", "Overwrite an existing .devspec directory", false)
  .action(async (options: InitOptions) => {
    const root = process.cwd();
    const dsDir = devspecPath(root);

    if ((await fs.pathExists(dsDir)) && !options.force) {
      console.error(
        chalk.red(`.devspec already exists at ${dsDir}. Use --force to overwrite.`)
      );
      process.exitCode = 1;
      return;
    }

    const choices: AxisChoice[] = [
      { axis: "backend", name: options.backend, required: true },
      { axis: "architecture", name: options.architecture, required: true },
      { axis: "methodology", name: options.methodology, required: true },
    ];
    if (options.frontend) {
      choices.push({ axis: "frontend", name: options.frontend, required: false });
    }
    if (options.infrastructure) {
      choices.push({ axis: "infrastructure", name: options.infrastructure, required: false });
    }
    if (options.pipeline) {
      choices.push({ axis: "pipeline", name: options.pipeline, required: false });
    }

    for (const choice of choices) {
      if (!(await fragmentExists(choice.axis, choice.name))) {
        const available = await listFragments(choice.axis);
        console.error(
          chalk.red(`Unknown ${choice.axis} "${choice.name}". Available: ${available.join(", ") || "(none)"}`)
        );
        process.exitCode = 1;
        return;
      }
    }

    await fs.ensureDir(devspecPath(root, "company"));
    await fs.ensureDir(devspecPath(root, "projects"));
    await fs.ensureDir(devspecPath(root, "standards"));

    const yamlLines = [
      "version: 1",
      `backend: ${options.backend}`,
      `architecture: ${options.architecture}`,
      `methodology: ${options.methodology}`,
    ];
    if (options.frontend) yamlLines.push(`frontend: ${options.frontend}`);
    if (options.infrastructure) yamlLines.push(`infrastructure: ${options.infrastructure}`);
    if (options.pipeline) yamlLines.push(`pipeline: ${options.pipeline}`);
    yamlLines.push("");
    await fs.writeFile(devspecPath(root, "devspec.yaml"), yamlLines.join("\n"));

    // Merge tech-stack.yaml from each fragment (each owns a non-overlapping top-level key).
    const mergedStack: Record<string, unknown> = {};
    for (const choice of choices) {
      const fragStack = fragmentPath(choice.axis, choice.name, "tech-stack.yaml");
      if (await fs.pathExists(fragStack)) {
        const parsed = YAML.parse(await fs.readFile(fragStack, "utf8")) ?? {};
        Object.assign(mergedStack, parsed);
      }
    }
    mergedStack.editor = { primary: "vscode" };
    await fs.writeFile(
      devspecPath(root, "company", "tech-stack.yaml"),
      YAML.stringify(mergedStack)
    );

    // Merge dev-environment.yaml: backend is the base, other fragments append
    // extensions and merge settings shallowly. Tasks are concatenated; devcontainer
    // features are merged.
    const mergedEnv = await mergeDevEnvironment(choices);
    if (mergedEnv) {
      // Resolve ${path} placeholders in string values against the merged tech-stack.
      // This is how versions chosen at init time flow into devcontainer image tags
      // (e.g. `mcr.microsoft.com/devcontainers/python:${backend.devcontainer_tag}`).
      const resolvedEnv = substituteVariables(mergedEnv, mergedStack) as Record<string, unknown>;
      await fs.writeFile(
        devspecPath(root, "company", "dev-environment.yaml"),
        YAML.stringify(resolvedEnv)
      );
    }

    // Concatenate standards.md: common principles first, then per-fragment.
    const standardsParts: string[] = [`# Engineering Standards\n`];
    const commonStandards = path.join(packsRoot(), "common", "standards.md");
    if (await fs.pathExists(commonStandards)) {
      const body = await fs.readFile(commonStandards, "utf8");
      standardsParts.push(`<!-- from common (KISS/DRY/YAGNI + security) -->\n${body.trim()}\n`);
    }
    for (const choice of choices) {
      const fragStandards = fragmentPath(choice.axis, choice.name, "standards.md");
      if (await fs.pathExists(fragStandards)) {
        const body = await fs.readFile(fragStandards, "utf8");
        standardsParts.push(`<!-- from ${choice.axis}/${choice.name} -->\n${body.trim()}\n`);
      }
    }
    await fs.writeFile(
      devspecPath(root, "standards", "standards.md"),
      standardsParts.join("\n")
    );

    // Auto-generate CLAUDE.md so AI agents (and the Ralph loop) have the
    // workspace's standards + project shape preloaded immediately. Without
    // this, subagents are told "standards are in your CLAUDE.md context"
    // but the file doesn't exist — silent drift.
    await generateClaudeMd(root);

    // Copy DevSpec slash commands + skills into <workspace>/.claude/ so the
    // /devspec:iterate, /devspec:review, etc. commands are usable from Claude
    // Code inside the user's project. Skip-existing keeps user mods safe.
    const claudeSync = await syncClaudeAssets(root, { overwrite: false });
    const claudeAssetsSummary =
      `${claudeSync.commandsWritten.length} slash command(s), ${claudeSync.skillsWritten.length} skill(s)`;
    if (claudeSync.sourceMissing.length > 0) {
      console.warn(
        chalk.yellow(
          `  warn: missing in package: ${claudeSync.sourceMissing.join(", ")}`
        )
      );
    }

    console.log(chalk.green("✓ DevSpec initialised"));
    console.log("");
    console.log(`  backend         ${chalk.cyan(options.backend)}`);
    if (options.frontend) {
      console.log(`  frontend        ${chalk.cyan(options.frontend)}`);
    }
    console.log(`  architecture    ${chalk.cyan(options.architecture)}`);
    console.log(`  methodology     ${chalk.cyan(options.methodology)}`);
    if (options.infrastructure) {
      console.log(`  infrastructure  ${chalk.cyan(options.infrastructure)}`);
    }
    if (options.pipeline) {
      console.log(`  pipeline        ${chalk.cyan(options.pipeline)}`);
    }
    console.log(`  location        ${chalk.dim(path.relative(root, dsDir) || dsDir)}`);
    console.log("");
    console.log(chalk.bold("How DevSpec works"));
    console.log("");
    console.log(`  Each ${chalk.cyan("change")} walks through 6 lifecycle stages:`);
    console.log(chalk.dim("    discovery → proposal → design → contract → alignment → tasks"));
    console.log("");
    console.log(`  The ${chalk.cyan("workspace")} progresses through 7 phases as you build:`);
    console.log(chalk.dim("    sketch → design → contract → build → ready → uat → production"));
    console.log("");
    console.log(`  You are here: ${chalk.green("●")} ${chalk.bold("sketch")} ${chalk.dim("(workspace exists, no changes yet)")}`);
    console.log("");
    console.log(chalk.dim("  CLAUDE.md generated (preloads standards for AI agents)"));
    console.log(
      chalk.dim(`  .claude/ populated (${claudeAssetsSummary}) — /devspec:iterate, /devspec:review etc. available in Claude Code`)
    );
    console.log("");
    console.log(chalk.bold("✨ Fastest path to a working change (recommended)"));
    console.log("");
    console.log(`  Open Claude Code (or your AI assistant) here and run:`);
    console.log("");
    console.log(`    ${chalk.cyan("/devspec:onboard")}`);
    console.log("");
    console.log(
      chalk.dim(
        "  It interviews you, runs `devspec env generate` for you, scaffolds your first"
      )
    );
    console.log(
      chalk.dim(
        "  change with `devspec plan`, then grills you through filling in the lifecycle"
      )
    );
    console.log(
      chalk.dim(
        "  docs (discovery → proposal → design → contract). End result: a fully planned"
      )
    );
    console.log(
      chalk.dim(
        "  walking-skeleton change ready for `/devspec:iterate` to start implementing."
      )
    );
    console.log("");
    console.log(chalk.dim("Or do it manually:"));
    console.log(
      chalk.dim(
        `  1. ${chalk.cyan("devspec env generate")}              write .vscode/, devcontainer, Dockerfile + docker-compose.yml`
      )
    );
    console.log(
      chalk.dim(
        `  2. ${chalk.cyan('devspec plan "<title>"')}            scaffold lifecycle docs for your first change`
      )
    );
    console.log(
      chalk.dim(
        `  3. ${chalk.cyan("devspec phase")}                      see where you are and what's needed next`
      )
    );
    console.log("");
    console.log(
      chalk.dim("More: ") +
        chalk.cyan("devspec guide") +
        chalk.dim("  ·  ") +
        chalk.cyan("devspec status") +
        chalk.dim("  ·  ") +
        chalk.cyan("devspec doctor")
    );
  });

async function mergeDevEnvironment(
  choices: AxisChoice[]
): Promise<Record<string, unknown> | null> {
  let base: Record<string, unknown> | null = null;
  const allExtensions: string[] = [];
  const allTasks: unknown[] = [];
  const settings: Record<string, unknown> = {};
  const devcontainerFeatures: Record<string, unknown> = {};

  for (const choice of choices) {
    const fragEnv = fragmentPath(choice.axis, choice.name, "dev-environment.yaml");
    if (!(await fs.pathExists(fragEnv))) continue;
    const parsed = YAML.parse(await fs.readFile(fragEnv, "utf8")) ?? {};
    if (choice.axis === "backend") base = parsed;

    const vscode = (parsed.vscode ?? {}) as Record<string, unknown>;
    if (Array.isArray(vscode.extensions)) {
      for (const ext of vscode.extensions as string[]) {
        if (!allExtensions.includes(ext)) allExtensions.push(ext);
      }
    }
    if (Array.isArray(vscode.tasks)) {
      allTasks.push(...(vscode.tasks as unknown[]));
    }
    if (vscode.settings && typeof vscode.settings === "object") {
      Object.assign(settings, vscode.settings);
    }

    const devcontainer = (parsed.devcontainer ?? {}) as Record<string, unknown>;
    if (devcontainer.features && typeof devcontainer.features === "object") {
      Object.assign(devcontainerFeatures, devcontainer.features);
    }
  }

  if (!base) return null;

  const result: Record<string, unknown> = { ...base };
  const baseVscode = (base.vscode ?? {}) as Record<string, unknown>;
  result.vscode = {
    ...baseVscode,
    settings,
    extensions: allExtensions,
    tasks: allTasks.length > 0 ? allTasks : baseVscode.tasks,
  };
  if (base.devcontainer) {
    const baseDc = base.devcontainer as Record<string, unknown>;
    result.devcontainer = {
      ...baseDc,
      features: { ...((baseDc.features as Record<string, unknown>) ?? {}), ...devcontainerFeatures },
    };
  }
  return result;
}

// Recursively walks a structure, replacing ${path.to.key} placeholders in string
// values with the resolved value from the provided variables object. Unresolved
// placeholders are left intact so the user can see what the fragment expected.
function substituteVariables(
  value: unknown,
  vars: Record<string, unknown>
): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, (full, expr) => {
      const path = String(expr).trim();
      const resolved = resolveDotPath(vars, path);
      return resolved === undefined ? full : String(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteVariables(v, vars));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = substituteVariables(v, vars);
    }
    return out;
  }
  return value;
}

function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
