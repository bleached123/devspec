import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { writeStatus } from "../core/change.js";
import { LIFECYCLE_STAGES, type Stage } from "../core/coherence/types.js";
import { cmd, nextStep } from "../core/hints.js";

export const rewindCommand = new Command("rewind")
  .description(
    "Regress a change back to a stage, marking that stage and all subsequent stages as pending"
  )
  .argument("<slug>", "Change slug")
  .argument("<stage>", `Stage to rewind to (${LIFECYCLE_STAGES.join(", ")})`)
  .option("--because <reason>", "Reason logged to alignment.md")
  .action(
    async (
      slug: string,
      stage: string,
      options: { because?: string }
    ) => {
      if (!LIFECYCLE_STAGES.includes(stage as Stage)) {
        console.error(
          chalk.red(`Unknown stage "${stage}". Valid: ${LIFECYCLE_STAGES.join(", ")}`)
        );
        process.exitCode = 1;
        return;
      }
      const root = await requireWorkspaceRoot();
      const startIdx = LIFECYCLE_STAGES.indexOf(stage as Stage);
      const affected = LIFECYCLE_STAGES.slice(startIdx);

      await writeStatus(root, slug, (status) => {
        for (const s of affected) {
          status.stages[s] = "pending";
        }
      });

      const alignmentPath = devspecPath(root, "projects", slug, "alignment.md");
      if (await fs.pathExists(alignmentPath)) {
        const date = new Date().toISOString().slice(0, 10);
        const entry = options.because
          ? `- \`${date}\` — rewound to **${stage}**, because ${options.because} (regressed: ${affected.join(", ")})`
          : `- \`${date}\` — rewound to **${stage}** (regressed: ${affected.join(", ")})`;
        const existing = await fs.readFile(alignmentPath, "utf8");
        const updated = appendUnderDecisions(existing, entry);
        await fs.writeFile(alignmentPath, updated);
      }

      console.log(
        chalk.yellow(
          `${slug}: rewound to ${stage} — ${affected.length} stage(s) reset to pending`
        )
      );
      console.log(chalk.dim(`  regressed: ${affected.join(", ")}`));
      if (options.because) {
        console.log(chalk.dim(`  reason: ${options.because}`));
      }
      console.log(
        chalk.dim(`  logged to ${path.relative(root, alignmentPath)}`)
      );
      console.log("");
      nextStep(
        `fix the issue, then ${cmd(`devspec advance ${slug} ${stage}`)}`
      );
    }
  );

function appendUnderDecisions(existing: string, entry: string): string {
  const decisionHeadingRegex = /^(##\s+Decisions captured.*)$/im;
  const match = decisionHeadingRegex.exec(existing);
  if (!match) {
    const sep = existing.endsWith("\n") ? "" : "\n";
    return `${existing}${sep}\n## Decisions captured\n${entry}\n`;
  }
  const headingIdx = match.index + match[0].length;
  const after = existing.slice(headingIdx);
  const nextHeading = /^##\s+/m.exec(after);
  const insertAt = nextHeading ? headingIdx + nextHeading.index : existing.length;
  let before = existing.slice(0, insertAt);
  if (!before.endsWith("\n")) before += "\n";
  const tail = existing.slice(insertAt);
  return `${before}${entry}\n${tail}`;
}
