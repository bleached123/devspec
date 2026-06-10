import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";

export const logCommand = new Command("log")
  .description("Append a timestamped decision to alignment.md")
  .argument("<slug>", "Change slug")
  .argument("<decision>", "Decision text (one line)")
  .option("--because <reason>", "Reason for the decision")
  .option("--rule <name>", "Coherence rule that triggered the decision")
  .action(
    async (
      slug: string,
      decision: string,
      options: { because?: string; rule?: string }
    ) => {
      const root = await requireWorkspaceRoot();
      const alignmentPath = devspecPath(root, "projects", slug, "alignment.md");
      if (!(await fs.pathExists(alignmentPath))) {
        console.error(
          chalk.red(
            `alignment.md not found for change "${slug}". Was the change scaffolded with \`devspec plan\`?`
          )
        );
        process.exitCode = 1;
        return;
      }

      const date = new Date().toISOString().slice(0, 10);
      const parts = [`- \`${date}\` — ${decision}`];
      if (options.because) parts.push(`because ${options.because}`);
      if (options.rule) parts.push(`(rule: ${options.rule})`);
      const entry = parts.join(", ");

      const existing = await fs.readFile(alignmentPath, "utf8");
      const updated = appendUnderDecisions(existing, entry);
      await fs.writeFile(alignmentPath, updated);

      console.log(chalk.green(`Logged decision to ${path.relative(root, alignmentPath)}`));
      console.log(`  ${entry}`);
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
  const insertAt = nextHeading
    ? headingIdx + nextHeading.index
    : existing.length;

  let before = existing.slice(0, insertAt);
  if (!before.endsWith("\n")) before += "\n";
  const tail = existing.slice(insertAt);
  return `${before}${entry}\n${tail}`;
}
