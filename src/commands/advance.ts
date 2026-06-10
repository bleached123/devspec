import { Command } from "commander";
import chalk from "chalk";
import { requireWorkspaceRoot } from "../core/workspace.js";
import { writeStatus } from "../core/change.js";
import { LIFECYCLE_STAGES, type Stage, type StageStatus } from "../core/coherence/types.js";
import { cmd, nextStep } from "../core/hints.js";

const STAGE_HINTS: Record<Stage, (slug: string) => string> = {
  discovery: (slug) => `fill in proposal.md, then ${cmd(`devspec advance ${slug} proposal`)}`,
  proposal: (slug) => `fill in design.md, then ${cmd(`devspec advance ${slug} design`)}`,
  design: (slug) => `fill in contract.md (TS pseudocode + tests), then ${cmd(`devspec advance ${slug} contract`)}`,
  contract: (slug) => `${cmd(`devspec scaffold ${slug}`)} to emit failing tests in your backend`,
  alignment: (slug) => `start work on tasks — ${cmd(`devspec next ${slug}`)}`,
  tasks: (slug) => `change complete — ${cmd(`devspec archive ${slug}`)} or move on to another change`,
};

const VALID_STATUSES: StageStatus[] = ["pending", "in_progress", "done"];

export const advanceCommand = new Command("advance")
  .description("Set a stage's status in status.yaml")
  .argument("<slug>", "Change slug")
  .argument("<stage>", `One of: ${LIFECYCLE_STAGES.join(", ")}`)
  .option("--to <status>", `Target status (${VALID_STATUSES.join(", ")})`, "done")
  .action(
    async (slug: string, stage: string, options: { to: string }) => {
      if (!LIFECYCLE_STAGES.includes(stage as Stage)) {
        console.error(
          chalk.red(`Unknown stage "${stage}". Valid: ${LIFECYCLE_STAGES.join(", ")}`)
        );
        process.exitCode = 1;
        return;
      }
      if (!VALID_STATUSES.includes(options.to as StageStatus)) {
        console.error(
          chalk.red(`Unknown status "${options.to}". Valid: ${VALID_STATUSES.join(", ")}`)
        );
        process.exitCode = 1;
        return;
      }
      const root = await requireWorkspaceRoot();
      await writeStatus(root, slug, (status) => {
        status.stages[stage as Stage] = options.to as StageStatus;
      });
      console.log(chalk.green(`${slug}: ${stage} → ${options.to}`));
      if (options.to === "done") {
        nextStep(STAGE_HINTS[stage as Stage](slug));
      }
    }
  );
