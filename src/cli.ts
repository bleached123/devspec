#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { findWorkspaceRoot } from "./core/workspace.js";
import { loadWorkspaceState } from "./core/phase.js";
import { initCommand } from "./commands/init.js";
import { planCommand } from "./commands/plan.js";
import { envCommand } from "./commands/env.js";
import { checkCommand } from "./commands/check.js";
import { coherenceCommand } from "./commands/coherence.js";
import { nextCommand } from "./commands/next.js";
import { completeCommand } from "./commands/complete.js";
import { advanceCommand } from "./commands/advance.js";
import { logCommand } from "./commands/log.js";
import { scaffoldCommand } from "./commands/scaffold.js";
import { statusCommand } from "./commands/status.js";
import { doctorCommand } from "./commands/doctor.js";
import { phaseCommand } from "./commands/phase.js";
import { uatCommand } from "./commands/uat.js";
import { rewindCommand } from "./commands/rewind.js";
import { guideCommand } from "./commands/guide.js";
import { archiveCommand } from "./commands/archive.js";
import { syncContractCommand } from "./commands/sync-contract.js";
import { claudeCommand } from "./commands/claude.js";
import { runCommand } from "./commands/run.js";
import { worktreeCommand } from "./commands/worktree.js";
import { ciCommand } from "./commands/ci.js";
import { mapCommand } from "./commands/map.js";
import { releaseCommand } from "./commands/release.js";
import { specsCommand } from "./commands/specs.js";

const program = new Command();

program
  .name("devspec")
  .description(
    "Spec-driven engineering standards and guardrails.\n" +
      "Run `devspec guide` for the mental model, or `devspec init` to start a workspace."
  )
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(planCommand);
program.addCommand(envCommand);
program.addCommand(checkCommand);
program.addCommand(coherenceCommand);
program.addCommand(nextCommand);
program.addCommand(completeCommand);
program.addCommand(advanceCommand);
program.addCommand(logCommand);
program.addCommand(scaffoldCommand);
program.addCommand(statusCommand);
program.addCommand(doctorCommand);
program.addCommand(phaseCommand);
program.addCommand(uatCommand);
program.addCommand(rewindCommand);
program.addCommand(guideCommand);
program.addCommand(archiveCommand);
program.addCommand(syncContractCommand);
program.addCommand(claudeCommand);
program.addCommand(runCommand);
program.addCommand(worktreeCommand);
program.addCommand(ciCommand);
program.addCommand(mapCommand);
program.addCommand(releaseCommand);
program.addCommand(specsCommand);

program.action(async () => {
  await defaultAction();
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});

async function defaultAction(): Promise<void> {
  const root = await findWorkspaceRoot();

  if (!root) {
    console.log(chalk.bold("DevSpec"));
    console.log(chalk.dim("Spec-driven engineering standards and guardrails."));
    console.log("");
    console.log(chalk.yellow("No DevSpec workspace here yet."));
    console.log("");
    console.log("To start:");
    console.log(
      "  " +
        chalk.cyan(
          "devspec init --backend <rust|dotnet|node-typescript|python> --architecture <clean-architecture|layered|vertical-slice> --methodology <ddd|tdd|bdd|lightweight>"
        )
    );
    console.log("  " + chalk.dim("optionally add --frontend <svelte|blazor> --infrastructure <kubernetes|terraform>"));
    console.log("");
    console.log("To understand the model:");
    console.log("  " + chalk.cyan("devspec guide"));
    console.log("");
    console.log("To diagnose problems:");
    console.log("  " + chalk.cyan("devspec doctor"));
    return;
  }

  const workspace = await loadWorkspaceState(root);
  const nextGate = workspace.gates.find((g) => !g.satisfied);
  console.log(
    `${chalk.bold("Workspace:")} ${chalk.cyan(workspace.effectivePhase)}` +
      (workspace.strict ? "  " + chalk.magenta("[strict]") : "") +
      (workspace.declaredPhase
        ? chalk.dim(`  declared, detected=${workspace.detectedPhase}`)
        : "")
  );
  if (nextGate) {
    console.log(
      chalk.dim(`  next phase: ${nextGate.phase} — ${nextGate.missing[0] ?? ""}`)
    );
  }
  console.log("");

  const active = workspace.changes.filter((c) => !c.status.archived);
  if (active.length === 0) {
    console.log(chalk.dim("No changes yet."));
    console.log("Try: " + chalk.cyan('devspec plan "Your first change"'));
    return;
  }

  const inProgress = active.find((c) =>
    Object.values(c.status.stages).some((s) => s !== "done")
  );

  console.log(`${active.length} active change(s):`);
  for (const c of active.slice(0, 5)) {
    const doneCount = Object.values(c.status.stages).filter((s) => s === "done").length;
    const total = Object.values(c.status.stages).length;
    const blocking = workspace.changeBlocking.get(c.slug) ?? 0;
    const warning = workspace.changeWarning.get(c.slug) ?? 0;
    const driftLabel =
      blocking > 0
        ? chalk.red(`${blocking} block`)
        : warning > 0
          ? chalk.yellow(`${warning} warn`)
          : chalk.green("clean");
    console.log(
      `  ${c.slug.padEnd(28)} ${doneCount}/${total} stages   ${driftLabel}`
    );
  }
  if (active.length > 5) console.log(chalk.dim(`  ... +${active.length - 5} more`));

  console.log("");
  if (inProgress) {
    console.log(
      "Next action: " +
        chalk.cyan(`devspec coherence ${inProgress.slug}`) +
        chalk.dim(`  (or run /loop /devspec:iterate ${inProgress.slug} in Claude Code)`)
    );
  } else {
    console.log("All changes done. " + chalk.cyan("devspec phase") + chalk.dim(" to see what's next."));
  }
  console.log("");
  console.log(
    chalk.dim("More: ") +
      chalk.cyan("devspec status") +
      chalk.dim("  ·  ") +
      chalk.cyan("devspec phase") +
      chalk.dim("  ·  ") +
      chalk.cyan("devspec guide") +
      chalk.dim("  ·  ") +
      chalk.cyan("devspec --help")
  );
}
