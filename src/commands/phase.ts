import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { loadWorkspaceState } from "../core/phase.js";
import { PHASES, type Phase } from "../core/coherence/types.js";
import { cmd, nextStep } from "../core/hints.js";

export const phaseCommand = new Command("phase")
  .description("Show or set the workspace phase")
  .option("--set <phase>", `Declare a phase (${PHASES.join(", ")})`)
  .option("--auto", "Remove the declared phase and revert to auto-detection")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (options: { set?: string; auto?: boolean; json: boolean }) => {
    const root = await requireWorkspaceRoot();

    if (options.set && options.auto) {
      console.error(chalk.red("--set and --auto are mutually exclusive."));
      process.exitCode = 1;
      return;
    }

    if (options.set) {
      if (!PHASES.includes(options.set as Phase)) {
        console.error(
          chalk.red(`Unknown phase "${options.set}". Valid: ${PHASES.join(", ")}`)
        );
        process.exitCode = 1;
        return;
      }
      await updateConfigPhase(root, options.set as Phase);
      console.log(chalk.green(`Workspace phase declared as "${options.set}".`));
      if (options.set === "production") {
        nextStep("strict mode is now active — warnings will block. " + cmd("devspec status") + " to see effect");
      } else {
        nextStep(cmd("devspec status"));
      }
      return;
    }

    if (options.auto) {
      await updateConfigPhase(root, null);
      console.log(chalk.green("Declared phase cleared. Phase is now auto-detected."));
      nextStep(cmd("devspec phase"));
      return;
    }

    const workspace = await loadWorkspaceState(root);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            detected: workspace.detectedPhase,
            declared: workspace.declaredPhase,
            effective: workspace.effectivePhase,
            strict: workspace.strict,
            gates: workspace.gates,
          },
          null,
          2
        )
      );
      return;
    }

    const reachedIndex = PHASES.indexOf(workspace.effectivePhase);
    const reachedCount = workspace.gates.filter((g) => g.satisfied).length;
    const total = workspace.gates.length;

    let headerLine = `Workspace phase: ${chalk.bold(workspace.effectivePhase)} (${reachedCount} / ${total})`;
    if (workspace.declaredPhase) {
      headerLine += chalk.dim(
        `   detected: ${workspace.detectedPhase} | declared: ${workspace.declaredPhase}`
      );
    }
    if (workspace.strict) {
      headerLine += "  " + chalk.magenta("[strict]");
    }
    console.log(headerLine);
    console.log("");

    for (const gate of workspace.gates) {
      const phaseIdx = PHASES.indexOf(gate.phase);
      const tag = gate.satisfied
        ? chalk.green("✓")
        : phaseIdx === reachedIndex + 1
          ? chalk.yellow("●")
          : chalk.dim("○");
      const name = gate.satisfied
        ? gate.phase.padEnd(12)
        : phaseIdx === reachedIndex + 1
          ? chalk.bold(gate.phase.padEnd(12))
          : chalk.dim(gate.phase.padEnd(12));
      console.log(`  ${tag} ${name}  ${chalk.dim(gate.description)}`);
    }

    const nextGate = workspace.gates.find((g) => !g.satisfied);
    if (nextGate && nextGate.missing.length > 0) {
      console.log("");
      console.log(`To advance to ${chalk.cyan(nextGate.phase)}:`);
      for (const m of nextGate.missing) {
        console.log(chalk.dim(`  - ${m}`));
      }
    }
  });

async function updateConfigPhase(root: string, phase: Phase | null): Promise<void> {
  const file = devspecPath(root, "devspec.yaml");
  const raw = await fs.readFile(file, "utf8");
  const parsed = (YAML.parse(raw) ?? {}) as Record<string, unknown>;
  if (phase === null) {
    delete parsed.phase;
  } else {
    parsed.phase = phase;
  }
  await fs.writeFile(file, YAML.stringify(parsed));
}
