import fs from "fs-extra";
import { devspecPath } from "./workspace.js";
import { readDevspecConfig, type DevspecConfig } from "./config.js";
import { loadChangeState } from "./change.js";
import { runCoherence } from "./coherence/runner.js";
import { loadUat } from "./uat.js";
import {
  PHASES,
  type ChangeState,
  type Phase,
  type UatCriterion,
} from "./coherence/types.js";
import { looksUnimplemented } from "./source.js";
import { targetTestName } from "./templates.js";

export interface PhaseGate {
  phase: Phase;
  description: string;
  satisfied: boolean;
  missing: string[];
}

export interface WorkspaceState {
  root: string;
  config: DevspecConfig;
  changes: ChangeState[];
  changeBlocking: Map<string, number>;
  changeWarning: Map<string, number>;
  uat: UatCriterion[] | null;
  declaredPhase: Phase | null;
  detectedPhase: Phase;
  effectivePhase: Phase;
  strict: boolean;
  gates: PhaseGate[];
}

export async function loadWorkspaceState(root: string): Promise<WorkspaceState> {
  const config = await readDevspecConfig(root);
  const projectsRoot = devspecPath(root, "projects");
  const changes: ChangeState[] = [];
  if (await fs.pathExists(projectsRoot)) {
    const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        changes.push(await loadChangeState(root, e.name));
      } catch {
        // skip unreadable change; doctor will report it
      }
    }
  }

  const changeBlocking = new Map<string, number>();
  const changeWarning = new Map<string, number>();
  for (const change of changes) {
    if (change.status.archived) continue;
    const report = await runCoherence(change);
    changeBlocking.set(change.slug, report.blockingCount);
    changeWarning.set(change.slug, report.warningCount);
  }

  const uat = await loadUat(root);
  const declaredPhase = config.phase ?? null;
  const gates = computeGates(changes, uat, changeBlocking);
  const detectedPhase = computeDetectedPhase(gates);
  const effectivePhase = declaredPhase ?? detectedPhase;
  const strict = effectivePhase === "production";

  return {
    root,
    config,
    changes,
    changeBlocking,
    changeWarning,
    uat,
    declaredPhase,
    detectedPhase,
    effectivePhase,
    strict,
    gates,
  };
}

function computeGates(
  changes: ChangeState[],
  uat: UatCriterion[] | null,
  blocking: Map<string, number>
): PhaseGate[] {
  const active = changes.filter((c) => !c.status.archived);

  const gates: PhaseGate[] = [];

  // sketch: workspace + at least one change with any content
  const hasAnyContent = active.some((c) =>
    Object.values(c.docs).some((d) => !d.isEmpty && !d.isTemplateOnly)
  );
  gates.push({
    phase: "sketch",
    description: "Workspace exists with at least one change in progress",
    satisfied: active.length > 0 && hasAnyContent,
    missing:
      active.length === 0
        ? ["No changes yet — run `devspec plan \"<title>\"`"]
        : !hasAnyContent
          ? ["Every change is still template-only — fill in at least one lifecycle doc"]
          : [],
  });

  // design: at least one change has design stage done with real content
  const designDone = active.find(
    (c) =>
      c.status.stages.design === "done" &&
      !c.docs.design.isEmpty &&
      !c.docs.design.isTemplateOnly
  );
  gates.push({
    phase: "design",
    description: "At least one change has design completed",
    satisfied: !!designDone,
    missing: designDone
      ? []
      : ["No change has `design` stage marked done with substantive content"],
  });

  // contract: at least one change has contract done with tests
  const contractDone = active.find(
    (c) =>
      c.status.stages.contract === "done" &&
      c.tests.length > 0 &&
      !c.docs.contract.isTemplateOnly
  );
  gates.push({
    phase: "contract",
    description: "At least one change has contract defined with tests",
    satisfied: !!contractDone,
    missing: contractDone
      ? []
      : ["No change has `contract` stage done with parseable tests"],
  });

  // build: contracts exist AND at least some scaffolded tests appear in source
  const anyTestInSource = active.some((c) => testsInSourceCount(c).found > 0);
  gates.push({
    phase: "build",
    description: "Test scaffolds exist in source for at least one change",
    satisfied: !!contractDone && anyTestInSource,
    missing: !contractDone
      ? ["Contract phase not yet reached"]
      : !anyTestInSource
        ? ["Run `devspec scaffold <slug>` for at least one change with tests"]
        : [],
  });

  // ready: all active changes have all tests implemented AND no blocking drift anywhere
  const totalBlocking = Array.from(blocking.values()).reduce((a, b) => a + b, 0);
  const allTestsImplemented = active.every((c) => {
    const counts = testsInSourceCount(c);
    return counts.missing === 0 && counts.stubbed === 0;
  });
  const readyMissing: string[] = [];
  if (totalBlocking > 0) readyMissing.push(`${totalBlocking} blocking drift(s) outstanding`);
  if (!allTestsImplemented) {
    let totalStubbed = 0;
    let totalMissing = 0;
    for (const c of active) {
      const counts = testsInSourceCount(c);
      totalStubbed += counts.stubbed;
      totalMissing += counts.missing;
    }
    if (totalMissing > 0) readyMissing.push(`${totalMissing} test(s) not scaffolded`);
    if (totalStubbed > 0) readyMissing.push(`${totalStubbed} test(s) still stubbed (todo!/NotImplementedException)`);
  }
  if (active.length === 0) readyMissing.push("No changes to validate");
  gates.push({
    phase: "ready",
    description: "All active changes pass coherence with no stubbed tests",
    satisfied: active.length > 0 && totalBlocking === 0 && allTestsImplemented,
    missing: readyMissing,
  });

  // uat: uat.yaml exists with at least one criterion
  const hasUatCriteria = uat !== null && uat.length > 0;
  gates.push({
    phase: "uat",
    description: "UAT criteria defined in `.devspec/uat.yaml`",
    satisfied: hasUatCriteria,
    missing: hasUatCriteria
      ? []
      : [
          uat === null
            ? "Run `devspec uat init` to scaffold acceptance criteria"
            : "uat.yaml has no criteria — add at least one",
        ],
  });

  // production: all UAT passed (auto-satisfaction; manual declaration still possible)
  const allUatPassed = hasUatCriteria && uat!.every((c) => c.status === "passed");
  gates.push({
    phase: "production",
    description: "All UAT criteria passed (manual declaration required to enter)",
    satisfied: allUatPassed,
    missing: allUatPassed
      ? []
      : !hasUatCriteria
        ? ["UAT phase not yet reached"]
        : (() => {
            const failed = uat!.filter((c) => c.status !== "passed");
            return [
              `${failed.length} UAT criterion(s) not yet passed: ${failed
                .slice(0, 3)
                .map((c) => `"${c.name}"`)
                .join(", ")}`,
            ];
          })(),
  });

  return gates;
}

function computeDetectedPhase(gates: PhaseGate[]): Phase {
  let highest: Phase = "sketch";
  for (const gate of gates) {
    if (gate.satisfied) highest = gate.phase;
    else break;
  }
  return highest;
}

export function testsInSourceCount(state: ChangeState): {
  found: number;
  missing: number;
  stubbed: number;
} {
  if (state.tests.length === 0) return { found: 0, missing: 0, stubbed: 0 };
  let found = 0;
  let missing = 0;
  let stubbed = 0;
  for (const test of state.tests) {
    const expected = targetTestName(test.name, state.backend);
    const matches = state.sourceIndex.identifiers.get(expected);
    if (!matches || matches.length === 0) {
      missing++;
      continue;
    }
    found++;
    if (matches.every((m) => looksUnimplemented(m.bodyPreview))) {
      stubbed++;
    }
  }
  return { found, missing, stubbed };
}

export function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}
