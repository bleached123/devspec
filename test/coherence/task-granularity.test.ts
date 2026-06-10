import { describe, it, expect } from "vitest";
import { taskGranularityRule } from "../../src/core/coherence/rules/task-granularity.js";
import { buildChangeState } from "./helpers.js";

describe("task-granularity", () => {
  it("ignores changes with no tasks and tasks stage not done", async () => {
    const state = buildChangeState({ docs: { tasks: "" } });
    expect(await taskGranularityRule.check(state)).toHaveLength(0);
  });

  it("warns on vague tasks", async () => {
    const state = buildChangeState({
      docs: {
        tasks: `# Tasks\n\n## Domain\n- [ ] Define domain model\n- [ ] Add tests\n`,
      },
    });
    const drifts = await taskGranularityRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].message).toContain("vague");
  });

  it("passes on specific tasks", async () => {
    const state = buildChangeState({
      docs: {
        tasks: `# Tasks\n\n## Domain\n- [ ] Add Booking aggregate with Id, CustomerId, ConfirmedAt fields\n- [ ] Add BookingConfirmed domain event with timestamp and customer id\n`,
      },
    });
    expect(await taskGranularityRule.check(state)).toHaveLength(0);
  });
});
