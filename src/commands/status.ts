import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { loadChangeState } from "../core/change.js";
import { runCoherence } from "../core/coherence/runner.js";
import { loadWorkspaceState, testsInSourceCount } from "../core/phase.js";
import { LIFECYCLE_STAGES, PHASES, type StageStatus } from "../core/coherence/types.js";

interface StatusRow {
  slug: string;
  title: string;
  doneCount: number;
  totalStages: number;
  stageDots: string;
  state: string;
  blockingCount: number;
  warningCount: number;
  archived: boolean;
  totalTests: number;
  implementedTests: number;
  stubbedTests: number;
}

export const statusCommand = new Command("status")
  .description("Show progress and drift summary for all changes in the workspace")
  .option("--json", "Emit machine-readable JSON", false)
  .action(async (options: { json: boolean }) => {
    const root = await requireWorkspaceRoot();
    const projectsRoot = devspecPath(root, "projects");

    let slugs: string[] = [];
    if (await fs.pathExists(projectsRoot)) {
      slugs = (await fs.readdir(projectsRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    }

    const workspace = await loadWorkspaceState(root);

    // In JSON mode we always emit a valid object, even when there are no
    // changes yet — machine consumers (VS Code extension, scripts) need a
    // stable contract. Human-mode keeps the friendly "run plan" hint.
    if (slugs.length === 0) {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              phase: {
                effective: workspace.effectivePhase,
                detected: workspace.detectedPhase,
                declared: workspace.declaredPhase,
                strict: workspace.strict,
              },
              config: configJson(workspace),
              changes: [],
            },
            null,
            2
          )
        );
        return;
      }
      console.log(chalk.dim("No changes yet. Run `devspec plan \"<title>\"` to create one."));
      return;
    }

    const rows: StatusRow[] = [];
    for (const slug of slugs) {
      try {
        const state = await loadChangeState(root, slug);
        const report = await runCoherence(state, { strict: workspace.strict });
        rows.push(buildRow(state, report.blockingCount, report.warningCount));
      } catch (err) {
        rows.push({
          slug,
          title: slug,
          doneCount: 0,
          totalStages: LIFECYCLE_STAGES.length,
          stageDots: "?".repeat(LIFECYCLE_STAGES.length),
          state: chalk.red(`error: ${(err as Error).message}`),
          blockingCount: 0,
          warningCount: 0,
          archived: false,
          totalTests: 0,
          implementedTests: 0,
          stubbedTests: 0,
        });
      }
    }

    if (options.json) {
      // Build a slug → in-progress stage lookup so machine consumers don't
      // have to re-read every status.yaml.
      const inProgressByChange = new Map<string, string | null>();
      for (const change of workspace.changes) {
        const inProgress =
          LIFECYCLE_STAGES.find((s) => change.status.stages[s] === "in_progress") ??
          LIFECYCLE_STAGES.find((s) => change.status.stages[s] !== "done") ??
          null;
        inProgressByChange.set(change.slug, inProgress);
      }

      console.log(
        JSON.stringify(
          {
            phase: {
              effective: workspace.effectivePhase,
              detected: workspace.detectedPhase,
              declared: workspace.declaredPhase,
              strict: workspace.strict,
            },
            config: configJson(workspace),
            changes: rows.map((r) => ({
              slug: r.slug,
              title: r.title,
              doneStages: r.doneCount,
              totalStages: r.totalStages,
              inProgressStage: inProgressByChange.get(r.slug) ?? null,
              blockingCount: r.blockingCount,
              warningCount: r.warningCount,
              archived: r.archived,
              totalTests: r.totalTests,
              implementedTests: r.implementedTests,
              stubbedTests: r.stubbedTests,
            })),
          },
          null,
          2
        )
      );
      return;
    }

    const reachedCount = workspace.gates.filter((g) => g.satisfied).length;
    const phaseHeader =
      `Workspace: ${chalk.bold(workspace.effectivePhase)} (${reachedCount}/${PHASES.length})` +
      (workspace.declaredPhase
        ? chalk.dim(` — declared, detected=${workspace.detectedPhase}`)
        : "") +
      (workspace.strict ? "  " + chalk.magenta("[strict]") : "");
    const nextGate = workspace.gates.find((g) => !g.satisfied);
    const trailer = nextGate
      ? chalk.dim(` — next: ${nextGate.phase} (${nextGate.missing[0] ?? ""})`)
      : "";
    console.log(phaseHeader + trailer);
    console.log("");

    const slugWidth = Math.max(20, ...rows.map((r) => r.slug.length)) + 2;
    const showTests = rows.some((r) => r.totalTests > 0);
    const header =
      chalk.bold("SLUG".padEnd(slugWidth)) +
      chalk.bold("STAGES".padEnd(16)) +
      chalk.bold("STATE".padEnd(showTests ? 22 : 0)) +
      (showTests ? chalk.bold("TESTS") : "");
    console.log(header);
    for (const row of rows) {
      const testsCell = formatTestsCell(row, showTests);
      const stateCell = stripChalkLength(row.state) > 0 && showTests
        ? padEndVisual(row.state, 22)
        : row.state;
      console.log(
        row.slug.padEnd(slugWidth) +
          `${row.stageDots}  ${row.doneCount}/${row.totalStages}`.padEnd(16) +
          stateCell +
          testsCell
      );
    }
    console.log("");
    const totalBlocking = rows.reduce((a, r) => a + r.blockingCount, 0);
    const totalWarning = rows.reduce((a, r) => a + r.warningCount, 0);
    const summary = `${rows.length} change(s), ${totalBlocking} blocking, ${totalWarning} warning`;
    console.log(chalk.dim(summary));
  });

function configJson(workspace: Awaited<ReturnType<typeof loadWorkspaceState>>): Record<string, string> {
  const out: Record<string, string> = {
    backend: workspace.config.backend,
    architecture: workspace.config.architecture,
    methodology: workspace.config.methodology,
  };
  if (workspace.config.frontend) out.frontend = workspace.config.frontend;
  if (workspace.config.infrastructure) out.infrastructure = workspace.config.infrastructure;
  if (workspace.config.pipeline) out.pipeline = workspace.config.pipeline;
  return out;
}

function stripChalkLength(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function padEndVisual(text: string, width: number): string {
  const visual = stripChalkLength(text);
  return visual >= width ? text + " " : text + " ".repeat(width - visual);
}

function formatTestsCell(row: StatusRow, showTests: boolean): string {
  if (!showTests) return "";
  if (row.totalTests === 0) return chalk.dim("-");
  const stub = row.stubbedTests > 0 ? chalk.yellow(` (${row.stubbedTests} stub)`) : "";
  const colored =
    row.implementedTests - row.stubbedTests === row.totalTests
      ? chalk.green(`${row.implementedTests}/${row.totalTests}`)
      : `${row.implementedTests}/${row.totalTests}`;
  return colored + stub;
}

function buildRow(
  state: Awaited<ReturnType<typeof loadChangeState>>,
  blockingCount: number,
  warningCount: number
): StatusRow {
  let doneCount = 0;
  let inProgressCount = 0;
  const dotChars: string[] = [];
  for (const stage of LIFECYCLE_STAGES) {
    const status = state.status.stages[stage];
    dotChars.push(dotFor(status));
    if (status === "done") doneCount++;
    else if (status === "in_progress") inProgressCount++;
  }
  const stageDots = dotChars.join("");

  const archived = state.status.archived === true;
  let state_: string;
  if (archived) {
    state_ = chalk.dim("archived");
  } else if (doneCount === LIFECYCLE_STAGES.length && blockingCount === 0) {
    state_ = chalk.green("ready to archive");
  } else if (blockingCount > 0 && warningCount > 0) {
    state_ = `${chalk.red(`${blockingCount} block`)}, ${chalk.yellow(`${warningCount} warn`)}`;
  } else if (blockingCount > 0) {
    state_ = chalk.red(`${blockingCount} block`);
  } else if (warningCount > 0) {
    state_ = chalk.yellow(`${warningCount} warn`);
  } else if (inProgressCount > 0) {
    state_ = chalk.cyan("in progress");
  } else if (doneCount === 0) {
    state_ = chalk.dim("pending");
  } else {
    state_ = chalk.green("clean");
  }

  const testCounts = testsInSourceCount(state);

  return {
    slug: state.slug,
    title: state.title,
    doneCount,
    totalStages: LIFECYCLE_STAGES.length,
    stageDots,
    state: state_,
    blockingCount,
    warningCount,
    archived,
    totalTests: state.tests.length,
    implementedTests: testCounts.found,
    stubbedTests: testCounts.stubbed,
  };
}

function dotFor(status: StageStatus): string {
  if (status === "done") return chalk.green("●");
  if (status === "in_progress") return chalk.cyan("◐");
  return chalk.dim("○");
}
