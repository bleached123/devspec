import { describe, it, expect } from "vitest";
import { stageClaimVsContentRule } from "../../src/core/coherence/rules/stage-claim-vs-content.js";
import { buildChangeState } from "./helpers.js";

describe("stage-claim-vs-content", () => {
  it("ignores pending stages", async () => {
    const state = buildChangeState({
      stages: { discovery: "pending" },
      docs: { discovery: "" },
    });
    expect(await stageClaimVsContentRule.check(state)).toHaveLength(0);
  });

  it("blocks when a done stage has an empty doc", async () => {
    const state = buildChangeState({
      stages: { discovery: "done" },
      docs: { discovery: "" },
    });
    const drifts = await stageClaimVsContentRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("block");
    expect(drifts[0].message).toContain("empty");
  });

  it("blocks when a done stage has only template skeleton", async () => {
    const skeleton = "# Discovery\n\n## Problem\n\n## Evidence\n\n## Constraints\n";
    const state = buildChangeState({
      stages: { discovery: "done" },
      docs: { discovery: skeleton },
    });
    const drifts = await stageClaimVsContentRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("block");
    expect(drifts[0].message).toContain("template");
  });

  it("passes when a done stage has substantive content", async () => {
    const content = `# Discovery

## Problem
The booking system loses sessions when users navigate away mid-form and we have evidence from 200+ support tickets demonstrating this.

## Evidence
Support data and analytics show consistent drop-off at the form transition.
`;
    const state = buildChangeState({
      stages: { discovery: "done" },
      docs: { discovery: content },
    });
    expect(await stageClaimVsContentRule.check(state)).toHaveLength(0);
  });
});
