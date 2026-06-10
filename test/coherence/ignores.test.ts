import { describe, it, expect } from "vitest";
import { collectIgnoredRules } from "../../src/core/coherence/ignores.js";
import { runCoherence } from "../../src/core/coherence/runner.js";
import { buildChangeState } from "./helpers.js";

describe("ignore comments", () => {
  it("collects no rules from a clean doc", () => {
    const state = buildChangeState({ docs: { design: "# Design\nSome content." } });
    expect(collectIgnoredRules(state).size).toBe(0);
  });

  it("collects a single rule marker", () => {
    const state = buildChangeState({
      docs: { design: "# Design\n<!-- devspec:ignore task-granularity -->\nSome content." },
    });
    const ignored = collectIgnoredRules(state);
    expect(ignored.has("task-granularity")).toBe(true);
    expect(ignored.size).toBe(1);
  });

  it("collects multiple rules across different docs", () => {
    const state = buildChangeState({
      docs: {
        design: "<!-- devspec:ignore goal-coverage -->",
        tasks: "<!-- devspec:ignore task-granularity -->\n- [ ] foo",
      },
    });
    const ignored = collectIgnoredRules(state);
    expect(ignored.has("goal-coverage")).toBe(true);
    expect(ignored.has("task-granularity")).toBe(true);
  });

  it("runner skips ignored rules", async () => {
    const state = buildChangeState({
      docs: {
        tasks: `# Tasks\n<!-- devspec:ignore task-granularity -->\n## Domain\n- [ ] foo\n- [ ] bar\n`,
      },
    });
    const report = await runCoherence(state);
    expect(report.drifts.some((d) => d.rule === "task-granularity")).toBe(false);
    expect(report.ignoredRules).toContain("task-granularity");
  });

  it("runner still runs non-ignored rules", async () => {
    const state = buildChangeState({
      stages: { discovery: "done" },
      docs: {
        discovery: "",
        tasks: "<!-- devspec:ignore task-granularity -->\n- [ ] foo",
      },
    });
    const report = await runCoherence(state);
    expect(report.drifts.some((d) => d.rule === "stage-claim-vs-content")).toBe(true);
  });
});
