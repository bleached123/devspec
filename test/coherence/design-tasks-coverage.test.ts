import { describe, it, expect } from "vitest";
import { designTasksCoverageRule } from "../../src/core/coherence/rules/design-tasks-coverage.js";
import { buildChangeState } from "./helpers.js";

describe("design-tasks-coverage", () => {
  it("ignores empty design or tasks", async () => {
    const state = buildChangeState({ docs: { design: "", tasks: "" } });
    expect(await designTasksCoverageRule.check(state)).toHaveLength(0);
  });

  it("warns when a design section has no matching task section", async () => {
    const design = `## Aggregates affected\nWe modify the Booking aggregate.\n\n## Infrastructure\nNew Postgres migration.\n`;
    const tasks = `## Aggregates affected\n- [ ] Update Booking aggregate with new field\n`;
    const state = buildChangeState({ docs: { design, tasks } });
    const drifts = await designTasksCoverageRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].message).toContain("Infrastructure");
  });

  it("ignores trade-offs and non-goals sections", async () => {
    const design = `## Aggregates affected\nFoo.\n\n## Trade-offs\nWe considered X.\n\n## Non-goals\nWe are not doing Y.\n`;
    const tasks = `## Aggregates affected\n- [ ] Add Foo\n`;
    const state = buildChangeState({ docs: { design, tasks } });
    expect(await designTasksCoverageRule.check(state)).toHaveLength(0);
  });

  it("passes when every design section has a matching task section", async () => {
    const design = `## Aggregates affected\nFoo.\n\n## Infrastructure\nBar.\n`;
    const tasks = `## Aggregates affected\n- [ ] Add Foo aggregate\n\n## Infrastructure\n- [ ] Add Bar migration script\n`;
    const state = buildChangeState({ docs: { design, tasks } });
    expect(await designTasksCoverageRule.check(state)).toHaveLength(0);
  });
});
