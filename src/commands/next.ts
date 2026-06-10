import { Command } from "commander";
import chalk from "chalk";
import { requireWorkspaceRoot } from "../core/workspace.js";
import { loadChangeState } from "../core/change.js";
import { cmd, nextStep } from "../core/hints.js";

export const nextCommand = new Command("next")
  .description("Print the next actionable task in a change")
  .argument("<slug>", "Change slug")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (slug: string, options: { json: boolean }) => {
    const root = await requireWorkspaceRoot();
    const state = await loadChangeState(root, slug);
    const next = state.tasks.find((t) => !t.checked);

    if (!next) {
      if (options.json) {
        console.log(JSON.stringify({ slug, task: null, done: true }, null, 2));
      } else {
        console.log(chalk.green(`No pending tasks for "${slug}". All done.`));
        nextStep(`${cmd(`devspec advance ${slug} tasks`)} to mark the tasks stage done`);
      }
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          { slug, task: next, done: false, totalTasks: state.tasks.length },
          null,
          2
        )
      );
    } else {
      console.log(chalk.cyan(`Next task for "${slug}":`));
      if (next.section) console.log(`  section: ${next.section}`);
      console.log(`  line:    tasks.md:${next.line}`);
      console.log(`  text:    ${next.text}`);
      console.log("");
      nextStep(
        `implement, then ${cmd(`devspec complete ${slug} "<task text>"`)}`
      );
    }
  });
