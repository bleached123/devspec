import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot } from "../core/workspace.js";
import { buildSarif } from "../core/sarif.js";
import { loadChangeState } from "../core/change.js";
import {
  buildWorkspaceContext,
  runCoherence,
  runWorkspaceCoherence,
} from "../core/coherence/runner.js";
import { loadWorkspaceState } from "../core/phase.js";
import { cmd, nextStep } from "../core/hints.js";

export const coherenceCommand = new Command("coherence")
  .description("Check cross-artifact coherence for a change")
  .argument("<slug>", "Change slug (e.g. add-bookings)")
  .option("--json", "Emit machine-readable JSON instead of human output", false)
  .option("--block-only", "Only report blocking drifts (exit 1 only on block)", false)
  .option(
    "--sarif [file]",
    "Also write findings as SARIF 2.1.0 (default file: devspec-coherence-<slug>.sarif) for GitHub code scanning / ADO SARIF viewers"
  )
  .action(async (slug: string, options: { json: boolean; blockOnly: boolean; sarif?: string | boolean }) => {
    const root = await requireWorkspaceRoot();
    const workspace = await loadWorkspaceState(root);
    const state = await loadChangeState(root, slug);
    const report = await runCoherence(state, { strict: workspace.strict });

    // Workspace-level rules: scan ALL active changes once, filter results to those involving this slug.
    const wsCtx = await buildWorkspaceContext(root);
    const wsReport = await runWorkspaceCoherence(wsCtx, { strict: workspace.strict });
    const slugFilteredWsDrifts = wsReport.drifts.filter((d) => d.slugs.includes(slug));
    for (const drift of slugFilteredWsDrifts) {
      report.drifts.push({
        rule: drift.rule,
        severity: drift.severity,
        message: drift.message,
        hint: drift.hint,
        remediations: drift.remediations,
      });
    }
    report.blockingCount = report.drifts.filter((d) => d.severity === "block").length;
    report.warningCount = report.drifts.filter((d) => d.severity === "warn").length;

    if (options.sarif) {
      const sarifPath = path.resolve(
        typeof options.sarif === "string"
          ? options.sarif
          : `devspec-coherence-${slug}.sarif`
      );
      await fs.outputFile(sarifPath, JSON.stringify(buildSarif(report, slug), null, 2));
      if (!options.json) {
        console.log(chalk.dim(`SARIF written to ${path.relative(process.cwd(), sarifPath)}`));
      }
    }

    if (workspace.strict && !options.json) {
      console.log(
        chalk.magenta(`Strict mode active (phase: production) — warnings escalated to blocks.`)
      );
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      if (report.drifts.length === 0 && report.ignoredRules.length === 0) {
        console.log(chalk.green(`No coherence drifts for "${slug}".`));
      } else {
        for (const drift of report.drifts) {
          const tag =
            drift.severity === "block"
              ? chalk.red("BLOCK")
              : chalk.yellow("WARN ");
          console.log(`  ${tag}  ${drift.rule} — ${drift.message}`);
          if (drift.hint) {
            console.log(chalk.dim(`         ${drift.hint}`));
          }
          if (drift.remediations && drift.remediations.length > 0) {
            for (const r of drift.remediations) {
              console.log(chalk.dim(`         · ${r.label}`));
            }
          }
        }
        if (report.drifts.length > 0) console.log("");
        console.log(
          `${report.blockingCount} blocking, ${report.warningCount} warning.`
        );
        if (report.ignoredRules.length > 0) {
          console.log(
            chalk.dim(
              `Ignored via doc markers: ${report.ignoredRules.join(", ")}`
            )
          );
        }
        if (report.drifts.length > 0) {
          console.log(
            chalk.dim(
              `To suppress a rule, add `
            ) +
              chalk.cyan("<!-- devspec:ignore <rule-name> -->") +
              chalk.dim(" to any doc in the change.")
          );
        }
      }
    }

    if (options.blockOnly) {
      if (report.blockingCount > 0) process.exitCode = 1;
    } else if (report.drifts.length > 0) {
      process.exitCode = report.blockingCount > 0 ? 1 : 0;
    }

    if (!options.json) {
      console.log("");
      if (report.drifts.length === 0) {
        nextStep(cmd(`devspec next ${slug}`));
      } else {
        const rules = new Set(report.drifts.map((d) => d.rule));
        if (rules.has("api-method-implemented")) {
          nextStep(`${cmd(`devspec sync-contract ${slug}`)} to reflect renames back to contract.md`);
        } else if (rules.has("tests-implemented") && report.blockingCount > 0) {
          nextStep(`${cmd(`devspec scaffold ${slug}`)} to regenerate missing test stubs`);
        } else if (report.blockingCount > 0) {
          nextStep("resolve blocking drifts, then re-run");
        } else {
          nextStep(`address warnings or suppress with a doc marker, then ${cmd(`devspec next ${slug}`)}`);
        }
      }
    }
  });
