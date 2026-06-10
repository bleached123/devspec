import { describe, it, expect } from "vitest";
import { testsImplementedRule } from "../../src/core/coherence/rules/tests-implemented.js";
import { buildChangeState } from "./helpers.js";

const CONTRACT_WITH_TESTS = `# Contract

\`\`\`yaml tests
- name: rejects double-booking
  given: []
  when: x
  then: y
- name: creates a pending booking
  given: []
  when: x
  then: y
\`\`\`
`;

describe("tests-implemented", () => {
  it("ignores when no tests defined", async () => {
    const state = buildChangeState({});
    expect(await testsImplementedRule.check(state)).toHaveLength(0);
  });

  it("ignores when source index is empty (no codebase yet)", async () => {
    const state = buildChangeState({ docs: { contract: CONTRACT_WITH_TESTS } });
    expect(await testsImplementedRule.check(state)).toHaveLength(0);
  });

  it("blocks when a test from tests.yaml is missing in source", async () => {
    const state = buildChangeState({
      backend: "rust",
      docs: { contract: CONTRACT_WITH_TESTS },
      sources: [{ name: "rejects_double_booking", bodyPreview: "assert_eq!(1, 1);" }],
    });
    const drifts = await testsImplementedRule.check(state);
    expect(drifts.some((d) => d.severity === "block")).toBe(true);
    expect(drifts.find((d) => d.severity === "block")?.message).toContain("1 test");
  });

  it("warns on tests whose source body is still todo!", async () => {
    const state = buildChangeState({
      backend: "rust",
      docs: { contract: CONTRACT_WITH_TESTS },
      sources: [
        { name: "rejects_double_booking", bodyPreview: "todo!(\"implement\");" },
        { name: "creates_a_pending_booking", bodyPreview: "assert_eq!(1, 1);" },
      ],
    });
    const drifts = await testsImplementedRule.check(state);
    expect(drifts.some((d) => d.severity === "warn")).toBe(true);
    expect(drifts.some((d) => d.severity === "block")).toBe(false);
  });

  it("passes when all tests are present and implemented (rust)", async () => {
    const state = buildChangeState({
      backend: "rust",
      docs: { contract: CONTRACT_WITH_TESTS },
      sources: [
        { name: "rejects_double_booking", bodyPreview: "assert!(true);" },
        { name: "creates_a_pending_booking", bodyPreview: "assert!(true);" },
      ],
    });
    expect(await testsImplementedRule.check(state)).toHaveLength(0);
  });

  it("uses PascalCase for dotnet test names", async () => {
    const state = buildChangeState({
      backend: "dotnet",
      docs: { contract: CONTRACT_WITH_TESTS },
      sources: [
        { name: "RejectsDoubleBooking", bodyPreview: "Assert.True(true);" },
        { name: "CreatesAPendingBooking", bodyPreview: "Assert.True(true);" },
      ],
    });
    expect(await testsImplementedRule.check(state)).toHaveLength(0);
  });
});
