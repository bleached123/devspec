import fs from "fs-extra";
import type {
  ChangeState,
  CoherenceRule,
  Drift,
  WorkspaceContext,
  WorkspaceDrift,
  WorkspaceRule,
} from "./types.js";
import { collectIgnoredRules } from "./ignores.js";
import { loadChangeState } from "../change.js";
import { devspecPath } from "../workspace.js";
import { stageOrderRule } from "./rules/stage-order.js";
import { stageClaimVsContentRule } from "./rules/stage-claim-vs-content.js";
import { taskGranularityRule } from "./rules/task-granularity.js";
import { goalCoverageRule } from "./rules/goal-coverage.js";
import { designTasksCoverageRule } from "./rules/design-tasks-coverage.js";
import { contractCoverageRule } from "./rules/contract-coverage.js";
import { testsImplementedRule } from "./rules/tests-implemented.js";
import { apiTestCoverageRule } from "./rules/api-test-coverage.js";
import { apiMethodImplementedRule } from "./rules/api-method-implemented.js";
import { designContractCoverageRule } from "./rules/design-contract-coverage.js";
import { dryDuplicateFunctionsRule } from "./rules/dry-duplicate-functions.js";
import { yagniUnusedFunctionsRule } from "./rules/yagni-unused-functions.js";
import { capabilityExistsRule } from "./rules/capability-exists.js";
import { deltaFormatRule } from "./rules/delta-format.js";
import { deltaCapabilityMatchRule } from "./rules/delta-capability-match.js";
import { requirementConflictRule } from "./rules/requirement-conflict.js";

export const BUILTIN_RULES: CoherenceRule[] = [
  stageOrderRule,
  stageClaimVsContentRule,
  taskGranularityRule,
  goalCoverageRule,
  designTasksCoverageRule,
  contractCoverageRule,
  testsImplementedRule,
  apiTestCoverageRule,
  apiMethodImplementedRule,
  designContractCoverageRule,
  dryDuplicateFunctionsRule,
  yagniUnusedFunctionsRule,
  capabilityExistsRule,
  deltaFormatRule,
  deltaCapabilityMatchRule,
];

export const BUILTIN_WORKSPACE_RULES: WorkspaceRule[] = [requirementConflictRule];

export interface CoherenceReport {
  slug: string;
  drifts: Drift[];
  blockingCount: number;
  warningCount: number;
  ignoredRules: string[];
}

export interface RunOptions {
  strict?: boolean;
  rules?: CoherenceRule[];
}

export async function runCoherence(
  state: ChangeState,
  optionsOrRules: RunOptions | CoherenceRule[] = {}
): Promise<CoherenceReport> {
  const options: RunOptions = Array.isArray(optionsOrRules)
    ? { rules: optionsOrRules }
    : optionsOrRules;
  const rules = options.rules ?? BUILTIN_RULES;
  const ignored = collectIgnoredRules(state);
  const drifts: Drift[] = [];
  for (const rule of rules) {
    if (ignored.has(rule.name)) continue;
    const ruleDrifts = await rule.check(state);
    for (const drift of ruleDrifts) {
      drifts.push(
        options.strict && drift.severity === "warn"
          ? { ...drift, severity: "block" }
          : drift
      );
    }
  }
  return {
    slug: state.slug,
    drifts,
    blockingCount: drifts.filter((d) => d.severity === "block").length,
    warningCount: drifts.filter((d) => d.severity === "warn").length,
    ignoredRules: Array.from(ignored),
  };
}

export interface WorkspaceRunOptions {
  strict?: boolean;
  rules?: WorkspaceRule[];
}

export interface WorkspaceCoherenceReport {
  drifts: WorkspaceDrift[];
  blockingCount: number;
  warningCount: number;
}

/**
 * Build a WorkspaceContext from the workspace root by discovering active
 * (non-archived) changes under .devspec/projects/.
 */
export async function buildWorkspaceContext(root: string): Promise<WorkspaceContext> {
  const projectsDir = devspecPath(root, "projects");
  let activeSlugs: string[] = [];
  if (await fs.pathExists(projectsDir)) {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    activeSlugs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }
  return {
    root,
    activeSlugs,
    loadChangeState: (slug) => loadChangeState(root, slug),
  };
}

export async function runWorkspaceCoherence(
  ctx: WorkspaceContext,
  optionsOrRules: WorkspaceRunOptions | WorkspaceRule[] = {}
): Promise<WorkspaceCoherenceReport> {
  const options: WorkspaceRunOptions = Array.isArray(optionsOrRules)
    ? { rules: optionsOrRules }
    : optionsOrRules;
  const rules = options.rules ?? BUILTIN_WORKSPACE_RULES;

  // Pre-load ignored-rule sets for every active change so suppression can be
  // computed without each rule re-reading docs.
  const ignoredBySlug = new Map<string, Set<string>>();
  for (const slug of ctx.activeSlugs) {
    try {
      const state = await ctx.loadChangeState(slug);
      ignoredBySlug.set(slug, collectIgnoredRules(state));
    } catch {
      ignoredBySlug.set(slug, new Set());
    }
  }

  const drifts: WorkspaceDrift[] = [];
  for (const rule of rules) {
    const ruleDrifts = await rule.check(ctx);
    for (const drift of ruleDrifts) {
      const unsuppressed = drift.slugs.filter(
        (slug) => !(ignoredBySlug.get(slug)?.has(rule.name) ?? false)
      );
      // Workspace drifts require ≥2 unsuppressed slugs by default; rules that
      // semantically apply to a single slug can opt out by setting slugs.length=1
      // before suppression — we honour that by treating "originally single" as
      // OK and only drop the drift when suppression collapses a multi-slug drift
      // below 2 slugs.
      if (drift.slugs.length >= 2 && unsuppressed.length < 2) continue;
      if (drift.slugs.length === 1 && unsuppressed.length === 0) continue;

      const filtered: WorkspaceDrift = { ...drift, slugs: unsuppressed };
      const escalated =
        options.strict && filtered.severity === "warn"
          ? { ...filtered, severity: "block" as const }
          : filtered;
      drifts.push(escalated);
    }
  }

  return {
    drifts,
    blockingCount: drifts.filter((d) => d.severity === "block").length,
    warningCount: drifts.filter((d) => d.severity === "warn").length,
  };
}

