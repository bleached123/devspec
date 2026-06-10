import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { loadChangeState } from "../core/change.js";
import { LIFECYCLE_STAGES } from "../core/coherence/types.js";
import { listDeltas } from "../core/capability.js";
import { syncChange } from "../core/sync.js";

export const archiveCommand = new Command("archive")
  .description("Move a completed change to .devspec/archive/")
  .argument("<slug>", "Change slug")
  .option("--force", "Archive even if stages are not all done", false)
  .option("--restore", "Move from archive back to projects", false)
  .option(
    "--no-sync",
    "Skip auto-sync of capability deltas (deltas are archived intact, no merge attempt)"
  )
  .action(
    async (
      slug: string,
      options: { force: boolean; restore: boolean; sync: boolean }
    ) => {
    const root = await requireWorkspaceRoot();
    const projectsDir = devspecPath(root, "projects", slug);
    const archiveDir = devspecPath(root, "archive", slug);

    if (options.restore) {
      if (!(await fs.pathExists(archiveDir))) {
        console.error(chalk.red(`No archived change "${slug}" at ${path.relative(root, archiveDir)}.`));
        process.exitCode = 1;
        return;
      }
      if (await fs.pathExists(projectsDir)) {
        console.error(chalk.red(`A change "${slug}" already exists in projects/. Resolve manually.`));
        process.exitCode = 1;
        return;
      }
      await fs.ensureDir(devspecPath(root, "projects"));
      await fs.move(archiveDir, projectsDir);
      console.log(chalk.green(`Restored "${slug}" → ${path.relative(root, projectsDir)}`));
      return;
    }

    if (!(await fs.pathExists(projectsDir))) {
      console.error(chalk.red(`No change "${slug}" in projects/.`));
      process.exitCode = 1;
      return;
    }

    if (!options.force) {
      const state = await loadChangeState(root, slug);
      const incomplete = LIFECYCLE_STAGES.filter((s) => state.status.stages[s] !== "done");
      if (incomplete.length > 0) {
        console.error(
          chalk.red(
            `"${slug}" has incomplete stages: ${incomplete.join(", ")}. Use --force to archive anyway.`
          )
        );
        process.exitCode = 1;
        return;
      }
    }

    if (await fs.pathExists(archiveDir)) {
      console.error(chalk.red(`Archive slot already taken: ${path.relative(root, archiveDir)}.`));
      process.exitCode = 1;
      return;
    }

    const deltas = await listDeltas(root, slug);
    const hasPending = deltas.some((d) => d.status === "pending");
    if (hasPending) {
      if (options.sync === false) {
        console.log(
          chalk.yellow(
            `  skip sync  ${deltas.filter((d) => d.status === "pending").length} pending delta(s) — archived without merge (--no-sync)`
          )
        );
      } else {
        const result = await syncChange(root, slug, { dryRun: false });
        for (const r of result.results) {
          if (r.status === "synced") {
            console.log(`  ${chalk.green("synced")}  ${r.capability}`);
          } else if (r.status === "error") {
            console.log(`  ${chalk.red("error")}   ${r.capability}`);
            for (const err of r.errors ?? []) {
              console.log(chalk.red(`     ${err.message}`));
            }
          }
        }
        if (!result.ok) {
          console.error(
            chalk.red(
              `Archive aborted: capability deltas failed to sync. Fix the deltas or use --no-sync.`
            )
          );
          process.exitCode = 1;
          return;
        }
      }
    }

    await fs.ensureDir(devspecPath(root, "archive"));
    await fs.move(projectsDir, archiveDir);
    console.log(chalk.green(`Archived "${slug}" → ${path.relative(root, archiveDir)}`));
    console.log(chalk.dim("Restore with: ") + chalk.cyan(`devspec archive ${slug} --restore`));
    }
  );
