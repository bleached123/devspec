import { describe, it, expect } from "vitest";
import { stageOrderRule } from "../../src/core/coherence/rules/stage-order.js";
import { buildChangeState } from "./helpers.js";

describe("stage-order", () => {
  it("passes when all stages are pending", async () => {
    const state = buildChangeState();
    const drifts = await stageOrderRule.check(state);
    expect(drifts).toHaveLength(0);
  });

  it("passes when stages complete in order", async () => {
    const state = buildChangeState({
      stages: { discovery: "done", proposal: "done", design: "pending" },
    });
    expect(await stageOrderRule.check(state)).toHaveLength(0);
  });

  it("blocks when a later stage is done before an earlier one", async () => {
    const state = buildChangeState({
      stages: { discovery: "pending", proposal: "done" },
    });
    const drifts = await stageOrderRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("block");
    expect(drifts[0].message).toContain("proposal");
    expect(drifts[0].message).toContain("discovery");
  });

  it("offers two remediations for a violation", async () => {
    const state = buildChangeState({
      stages: { discovery: "pending", proposal: "done" },
    });
    const drifts = await stageOrderRule.check(state);
    expect(drifts[0].remediations).toHaveLength(2);
  });
});
