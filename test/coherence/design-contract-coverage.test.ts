import { describe, it, expect } from "vitest";
import { designContractCoverageRule } from "../../src/core/coherence/rules/design-contract-coverage.js";
import { buildChangeState } from "./helpers.js";

describe("design-contract-coverage", () => {
  it("ignores empty design or contract", async () => {
    const state = buildChangeState({});
    expect(await designContractCoverageRule.check(state)).toHaveLength(0);
  });

  it("warns when a domain term from design is missing in contract", async () => {
    const design = `## Aggregates affected
We add a new Booking aggregate and update the Customer aggregate to track active bookings.

## Value objects
A new TimeSlot value object captures start and end timestamps.
`;
    const contract = `# Contract

\`\`\`ts
interface BookingService {
  create(req: CreateRequest): Booking;
}
\`\`\`
`;
    const state = buildChangeState({ docs: { design, contract } });
    const drifts = await designContractCoverageRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].message.toLowerCase()).toContain("timeslot");
  });

  it("passes when all design terms appear in contract", async () => {
    const design = `## Aggregates affected
A Booking aggregate.

## Value objects
A TimeSlot value object.
`;
    const contract = `# Contract

\`\`\`ts
interface BookingService {
  create(slot: TimeSlot): Booking;
}
\`\`\`
`;
    const state = buildChangeState({ docs: { design, contract } });
    expect(await designContractCoverageRule.check(state)).toHaveLength(0);
  });
});
