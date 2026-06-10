import { describe, it, expect } from "vitest";
import { runWorkspaceCoherence } from "../../src/core/coherence/runner.js";
import type {
  ChangeState,
  WorkspaceContext,
  WorkspaceDrift,
  WorkspaceRule,
} from "../../src/core/coherence/types.js";
import { buildChangeState } from "./helpers.js";

function ctxFrom(states: ChangeState[]): WorkspaceContext {
  const map = new Map(states.map((s) => [s.slug, s]));
  return {
    root: "/tmp/fake",
    activeSlugs: Array.from(map.keys()),
    loadChangeState: async (slug) => {
      const s = map.get(slug);
      if (!s) throw new Error(`unknown slug ${slug}`);
      return s;
    },
  };
}

describe("runWorkspaceCoherence", () => {
  it("invokes each rule exactly once with the workspace context", async () => {
    const calls: WorkspaceContext[] = [];
    const rule: WorkspaceRule = {
      name: "test-rule",
      description: "",
      check: async (c) => {
        calls.push(c);
        return [];
      },
    };
    const ctx = ctxFrom([buildChangeState({ slug: "a" }), buildChangeState({ slug: "b" })]);
    await runWorkspaceCoherence(ctx, { rules: [rule] });
    expect(calls).toHaveLength(1);
    expect(calls[0].activeSlugs).toEqual(["a", "b"]);
  });

  it("emits drifts with affected slugs intact when none suppress", async () => {
    const drift: WorkspaceDrift = {
      rule: "test-rule",
      severity: "block",
      message: "conflict",
      slugs: ["a", "b"],
    };
    const rule: WorkspaceRule = {
      name: "test-rule",
      description: "",
      check: async () => [drift],
    };
    const ctx = ctxFrom([buildChangeState({ slug: "a" }), buildChangeState({ slug: "b" })]);
    const report = await runWorkspaceCoherence(ctx, { rules: [rule] });
    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0].slugs).toEqual(["a", "b"]);
  });

  it("filters out a change that suppresses the rule via ignore marker", async () => {
    const rule: WorkspaceRule = {
      name: "test-rule",
      description: "",
      check: async () => [
        {
          rule: "test-rule",
          severity: "block",
          message: "conflict",
          slugs: ["a", "b", "c"],
        } satisfies WorkspaceDrift,
      ],
    };
    // change "a" has the ignore marker in its proposal.md
    const stateA = buildChangeState({
      slug: "a",
      docs: { proposal: "<!-- devspec:ignore test-rule -->\n" },
    });
    const stateB = buildChangeState({ slug: "b" });
    const stateC = buildChangeState({ slug: "c" });

    const ctx = ctxFrom([stateA, stateB, stateC]);
    const report = await runWorkspaceCoherence(ctx, { rules: [rule] });
    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0].slugs).toEqual(["b", "c"]);
  });

  it("drops a drift when suppression leaves fewer than 2 slugs in a multi-slug drift", async () => {
    const rule: WorkspaceRule = {
      name: "test-rule",
      description: "",
      check: async () => [
        {
          rule: "test-rule",
          severity: "block",
          message: "conflict",
          slugs: ["a", "b"],
        } satisfies WorkspaceDrift,
      ],
    };
    const stateA = buildChangeState({
      slug: "a",
      docs: { proposal: "<!-- devspec:ignore test-rule -->\n" },
    });
    const stateB = buildChangeState({ slug: "b" });
    const ctx = ctxFrom([stateA, stateB]);
    const report = await runWorkspaceCoherence(ctx, { rules: [rule] });
    expect(report.drifts).toHaveLength(0);
  });

  it("strict mode escalates warn to block", async () => {
    const rule: WorkspaceRule = {
      name: "test-rule",
      description: "",
      check: async () => [
        {
          rule: "test-rule",
          severity: "warn",
          message: "drift",
          slugs: ["a", "b"],
        } satisfies WorkspaceDrift,
      ],
    };
    const ctx = ctxFrom([buildChangeState({ slug: "a" }), buildChangeState({ slug: "b" })]);
    const report = await runWorkspaceCoherence(ctx, { rules: [rule], strict: true });
    expect(report.drifts[0].severity).toBe("block");
    expect(report.blockingCount).toBe(1);
  });
});
