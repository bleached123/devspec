import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { cmd, nextStep } from "../core/hints.js";

export const completeCommand = new Command("complete")
  .description("Mark a task as complete in tasks.md")
  .argument("<slug>", "Change slug")
  .argument("<match>", "Task text (or unique substring) to mark complete")
  .option("--line <n>", "Match by line number instead of text", (v) => parseInt(v, 10))
  .action(
    async (slug: string, match: string, options: { line?: number }) => {
      const root = await requireWorkspaceRoot();
      const tasksPath = devspecPath(root, "projects", slug, "tasks.md");
      if (!(await fs.pathExists(tasksPath))) {
        console.error(chalk.red(`tasks.md not found for change "${slug}".`));
        process.exitCode = 1;
        return;
      }

      const raw = await fs.readFile(tasksPath, "utf8");
      const lines = raw.split(/\r?\n/);
      const taskRegex = /^(\s*[-*]\s*)\[( |x|X)\](\s+.+?)\s*$/;

      let matchedIdx = -1;

      if (options.line) {
        const idx = options.line - 1;
        if (idx >= 0 && idx < lines.length && taskRegex.test(lines[idx])) {
          matchedIdx = idx;
        }
      } else {
        const needle = match.toLowerCase().trim();
        const candidates: number[] = [];
        lines.forEach((line, idx) => {
          const m = taskRegex.exec(line);
          if (!m) return;
          if (m[2].toLowerCase() === "x") return;
          if (m[3].toLowerCase().includes(needle)) candidates.push(idx);
        });
        if (candidates.length === 0) {
          console.error(
            chalk.red(`No unchecked task matching "${match}" in ${path.relative(root, tasksPath)}.`)
          );
          process.exitCode = 1;
          return;
        }
        if (candidates.length > 1) {
          console.error(
            chalk.red(
              `Ambiguous match: "${match}" matches ${candidates.length} tasks. Use --line <n> or a more specific substring.`
            )
          );
          for (const idx of candidates) {
            console.error(`  tasks.md:${idx + 1}  ${lines[idx].trim()}`);
          }
          process.exitCode = 1;
          return;
        }
        matchedIdx = candidates[0];
      }

      if (matchedIdx < 0) {
        console.error(chalk.red("No matching task found."));
        process.exitCode = 1;
        return;
      }

      const before = lines[matchedIdx];
      lines[matchedIdx] = before.replace(taskRegex, "$1[x]$3");
      await fs.writeFile(tasksPath, lines.join("\n"));
      console.log(chalk.green(`Marked done: tasks.md:${matchedIdx + 1}`));
      console.log(`  ${lines[matchedIdx].trim()}`);

      const stillPending = lines.some(
        (l) => /^\s*[-*]\s*\[ \]/.test(l)
      );
      console.log("");
      if (stillPending) {
        nextStep(cmd(`devspec next ${slug}`));
      } else {
        nextStep(
          `all tasks done — ${cmd(`devspec advance ${slug} tasks`)} to mark the stage`
        );
      }
    }
  );
