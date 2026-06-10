import { describe, it, expect } from "vitest";
import { apiTestCoverageRule } from "../../src/core/coherence/rules/api-test-coverage.js";
import { buildChangeState } from "./helpers.js";

describe("api-test-coverage", () => {
  it("ignores empty contract", async () => {
    const state = buildChangeState({});
    expect(await apiTestCoverageRule.check(state)).toHaveLength(0);
  });

  it("warns when an API method has no matching test", async () => {
    const contract = `# Contract

\`\`\`ts
interface BookingService {
  create(req: CreateBookingRequest): Booking;
  cancel(id: BookingId): void;
}
\`\`\`

\`\`\`yaml tests
- name: creates a booking
  given: []
  when: create is called
  then: returns Booking
\`\`\`
`;
    const state = buildChangeState({ docs: { contract } });
    const drifts = await apiTestCoverageRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].hint).toContain("cancel");
  });

  it("passes when every API method has a test mentioning it", async () => {
    const contract = `# Contract

\`\`\`ts
interface BookingService {
  create(req: CreateBookingRequest): Booking;
  cancel(id: BookingId): void;
}
\`\`\`

\`\`\`yaml tests
- name: creates a booking
  given: []
  when: create is called
  then: ok
- name: cancels a booking
  given: []
  when: cancel is called
  then: ok
\`\`\`
`;
    const state = buildChangeState({ docs: { contract } });
    expect(await apiTestCoverageRule.check(state)).toHaveLength(0);
  });
});
