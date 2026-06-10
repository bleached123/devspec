import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import {
  capabilitySpecPath,
  deltaSpecPath,
  deltasDir,
  isValidCapabilityName,
  listCapabilities,
  listDeltas,
} from "../core/capability.js";
import { syncChange, type SyncCapabilityResult } from "../core/sync.js";
import { cmd, nextStep } from "../core/hints.js";

export const specsCommand = new Command("specs").description(
  "Manage capability specs and per-change deltas"
);

specsCommand
  .command("init")
  .description("Scaffold a new capability spec at .devspec/specs/<capability>/spec.md")
  .argument("<capability>", "Capability name (lowercase kebab-case)")
  .action(async (capability: string) => {
    if (!isValidCapabilityName(capability)) {
      console.error(
        chalk.red(
          `Invalid capability name "${capability}". Use lowercase kebab-case (e.g. user-auth, data-export).`
        )
      );
      process.exitCode = 1;
      return;
    }
    const root = await requireWorkspaceRoot();
    const target = capabilitySpecPath(root, capability);
    if (await fs.pathExists(target)) {
      console.log(chalk.dim(`  keep   ${path.relative(root, target)}  (already exists)`));
      return;
    }
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, starterCapabilitySpec(capability));
    console.log(chalk.green(`  write  ${path.relative(root, target)}`));
    nextStep(
      `add requirements to ${path.relative(root, target)}, then ${cmd(
        `devspec specs delta <slug> ${capability}`
      )} from inside a change`
    );
  });

specsCommand
  .command("list")
  .description("List capabilities with sync status across all active changes")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (options: { json: boolean }) => {
    const root = await requireWorkspaceRoot();
    const caps = await listCapabilities(root);
    const dirtyByCapability = await collectDirtyByCapability(root);

    if (options.json) {
      const report = caps.map((c) => ({
        capability: c,
        status: dirtyByCapability.has(c) ? "dirty" : "clean",
        changes: dirtyByCapability.get(c) ?? [],
      }));
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (caps.length === 0) {
      console.log(chalk.dim("No capabilities defined yet."));
      nextStep(`run ${cmd("devspec specs init <capability>")} to create the first one`);
      return;
    }

    for (const c of caps) {
      const dirty = dirtyByCapability.get(c);
      if (dirty && dirty.length > 0) {
        console.log(
          `  ${chalk.yellow("dirty")}  ${c}  ${chalk.dim(`(pending in: ${dirty.join(", ")})`)}`
        );
      } else {
        console.log(`  ${chalk.green("clean")}  ${c}`);
      }
    }
  });

specsCommand
  .command("status")
  .description("Report pending deltas for a change (or all changes if omitted)")
  .argument("[slug]", "Change slug; omit for all active changes")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (slug: string | undefined, options: { json: boolean }) => {
    const root = await requireWorkspaceRoot();
    const slugs = slug ? [slug] : await listActiveSlugs(root);
    const report: { slug: string; pending: string[]; synced: string[] }[] = [];

    for (const s of slugs) {
      const deltas = await listDeltas(root, s);
      report.push({
        slug: s,
        pending: deltas.filter((d) => d.status === "pending").map((d) => d.capability),
        synced: deltas.filter((d) => d.status === "synced").map((d) => d.capability),
      });
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (report.length === 0) {
      console.log(chalk.dim("No active changes."));
      return;
    }

    for (const entry of report) {
      if (entry.pending.length === 0 && entry.synced.length === 0) {
        console.log(`  ${chalk.dim(entry.slug)}  no deltas`);
        continue;
      }
      const pendingLabel =
        entry.pending.length > 0
          ? chalk.yellow(`pending: ${entry.pending.join(", ")}`)
          : chalk.green("clean");
      const syncedLabel =
        entry.synced.length > 0
          ? chalk.dim(`  (synced: ${entry.synced.join(", ")})`)
          : "";
      console.log(`  ${entry.slug.padEnd(28)} ${pendingLabel}${syncedLabel}`);
    }
  });

specsCommand
  .command("delta")
  .description("Scaffold a delta file for a capability inside a change")
  .argument("<slug>", "Change slug")
  .argument("<capability>", "Capability name")
  .action(async (slug: string, capability: string) => {
    if (!isValidCapabilityName(capability)) {
      console.error(
        chalk.red(
          `Invalid capability name "${capability}". Use lowercase kebab-case.`
        )
      );
      process.exitCode = 1;
      return;
    }
    const root = await requireWorkspaceRoot();
    const projectDir = devspecPath(root, "projects", slug);
    if (!(await fs.pathExists(projectDir))) {
      console.error(chalk.red(`No change "${slug}" in projects/. Run \`devspec plan\` first.`));
      process.exitCode = 1;
      return;
    }
    const mainSpec = capabilitySpecPath(root, capability);
    if (!(await fs.pathExists(mainSpec))) {
      console.error(
        chalk.red(
          `Capability "${capability}" not initialised. Run ${cmd(
            `devspec specs init ${capability}`
          )} first.`
        )
      );
      process.exitCode = 1;
      return;
    }
    const target = deltaSpecPath(root, slug, capability);
    if (await fs.pathExists(target)) {
      console.log(chalk.dim(`  keep   ${path.relative(root, target)}  (already exists)`));
      return;
    }
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, starterDeltaSpec(capability));
    console.log(chalk.green(`  write  ${path.relative(root, target)}`));
    nextStep(
      `fill in ADDED/MODIFIED/REMOVED blocks, then ${cmd(
        `devspec specs sync ${slug} --dry-run`
      )} to preview`
    );
  });

specsCommand
  .command("sync")
  .description("Merge a change's unsynced deltas into the main capability specs")
  .argument("<slug>", "Change slug")
  .option("--dry-run", "Preview the merge without writing", false)
  .option("--capability <name>", "Sync a single capability only")
  .option("--json", "Emit machine-readable JSON", false)
  .action(
    async (
      slug: string,
      options: { dryRun: boolean; capability?: string; json: boolean }
    ) => {
      const root = await requireWorkspaceRoot();
      const result = await syncChange(root, slug, {
        dryRun: options.dryRun,
        capability: options.capability,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
        return;
      }

      if (result.results.length === 0) {
        console.log(chalk.dim(`No pending deltas for "${slug}".`));
        return;
      }

      for (const r of result.results) {
        printCapabilityResult(r, options.dryRun);
      }

      if (!result.ok) {
        console.log("");
        console.error(chalk.red(`Sync failed — see errors above.`));
        process.exitCode = 1;
        return;
      }

      if (options.dryRun) {
        nextStep(`re-run without ${cmd("--dry-run")} to apply`);
      } else {
        nextStep(`continue iterating, or ${cmd(`devspec archive ${slug}`)} when the change is done`);
      }
    }
  );

function printCapabilityResult(result: SyncCapabilityResult, dryRun: boolean): void {
  if (result.status === "synced") {
    console.log(`  ${chalk.green("synced")}  ${result.capability}`);
  } else if (result.status === "validated") {
    console.log(`  ${chalk.cyan("preview")}  ${result.capability}`);
    if (dryRun && result.preview) {
      console.log(chalk.dim("─".repeat(60)));
      console.log(result.preview);
      console.log(chalk.dim("─".repeat(60)));
    }
  } else if (result.status === "error") {
    console.log(`  ${chalk.red("error")}   ${result.capability}`);
    for (const err of result.errors ?? []) {
      console.log(chalk.red(`     ${err.message}`));
    }
  }
}

async function collectDirtyByCapability(root: string): Promise<Map<string, string[]>> {
  const dirty = new Map<string, string[]>();
  const slugs = await listActiveSlugs(root);
  for (const slug of slugs) {
    const deltas = await listDeltas(root, slug);
    for (const d of deltas) {
      if (d.status !== "pending") continue;
      const arr = dirty.get(d.capability) ?? [];
      if (!arr.includes(slug)) arr.push(slug);
      dirty.set(d.capability, arr);
    }
  }
  return dirty;
}

async function listActiveSlugs(root: string): Promise<string[]> {
  const dir = devspecPath(root, "projects");
  if (!(await fs.pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function starterCapabilitySpec(capability: string): string {
  return `# ${capability}

<!-- Describe what this capability covers, in plain English. One paragraph. -->

## Requirements

<!--
Add requirements here using:

### Requirement: <name>
<one-paragraph description using SHALL/MUST>

#### Scenario: <scenario name>
- **WHEN** <condition>
- **THEN** <expected outcome>

Each requirement should have at least one scenario.
-->
`;
}

function starterDeltaSpec(capability: string): string {
  return `<!--
  Delta for capability: ${capability}

  Use:
    ## ADDED Requirements      — append new requirements to the main spec
    ## MODIFIED Requirements   — replace the body of an existing requirement
                                 (heading must match the main spec exactly)
    ## REMOVED Requirements    — delete an existing requirement
                                 (heading must match the main spec exactly;
                                  body is optional rationale, discarded on sync)

  See .devspec/specs/${capability}/spec.md for current requirements.
-->

## ADDED Requirements

<!-- ### Requirement: <name>
     <body using SHALL/MUST>
     #### Scenario: <name>
     - **WHEN** ...
     - **THEN** ...
-->

## MODIFIED Requirements

<!-- ### Requirement: <existing name — exact match>
     <new body>
-->

## REMOVED Requirements

<!-- ### Requirement: <existing name — exact match>
     <optional rationale>
-->
`;
}
