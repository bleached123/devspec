import { describe, it, expect } from "vitest";
import { goalCoverageRule } from "../../src/core/coherence/rules/goal-coverage.js";
import { buildChangeState } from "./helpers.js";

describe("goal-coverage", () => {
  it("ignores when proposal is not done", async () => {
    const state = buildChangeState({
      stages: { proposal: "pending" },
      docs: {
        proposal: "## Goal\nSupport idempotent payment retries for charges.",
        design: "## Approach\nUnrelated content.",
      },
    });
    expect(await goalCoverageRule.check(state)).toHaveLength(0);
  });

  it("warns when design doesn't mention goal keywords", async () => {
    const state = buildChangeState({
      stages: { proposal: "done" },
      docs: {
        proposal: "## Goal\nSupport idempotent payment retries for failed charges.",
        design: `## Architecture impact\nWe will add a Foo aggregate. The implementation uses queues and adds new repositories.`,
      },
    });
    const drifts = await goalCoverageRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].message.toLowerCase()).toMatch(/idempotent|payment|retries/);
  });

  it("passes when design references goal keywords", async () => {
    const state = buildChangeState({
      stages: { proposal: "done" },
      docs: {
        proposal: "## Goal\nSupport idempotent payment retries for failed charges.",
        design: `## Approach\nWe support idempotent retries on the payment aggregate by writing an idempotency key alongside failed charges.`,
      },
    });
    expect(await goalCoverageRule.check(state)).toHaveLength(0);
  });
});
