import { describe, it, expect } from "vitest";
import { dryDuplicateFunctionsRule } from "../../src/core/coherence/rules/dry-duplicate-functions.js";
import { yagniUnusedFunctionsRule } from "../../src/core/coherence/rules/yagni-unused-functions.js";
import { buildChangeState } from "./helpers.js";

describe("dry-duplicate-functions", () => {
  it("ignores when source index is empty", async () => {
    const state = buildChangeState({});
    expect(await dryDuplicateFunctionsRule.check(state)).toHaveLength(0);
  });

  it("warns when a non-trivial function name appears in multiple files", async () => {
    const state = buildChangeState({
      sources: [
        { name: "format_currency", kind: "function", file: "src/billing.rs" },
        { name: "format_currency", kind: "function", file: "src/display.rs" },
      ],
    });
    const drifts = await dryDuplicateFunctionsRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].hint).toContain("format_currency");
  });

  it("ignores common method names like 'new', 'main', '__init__'", async () => {
    const state = buildChangeState({
      sources: [
        { name: "new", kind: "function", file: "src/booking.rs" },
        { name: "new", kind: "function", file: "src/payment.rs" },
        { name: "__init__", kind: "function", file: "src/foo.py" },
        { name: "__init__", kind: "function", file: "src/bar.py" },
      ],
    });
    expect(await dryDuplicateFunctionsRule.check(state)).toHaveLength(0);
  });

  it("ignores short identifier names (< 4 chars)", async () => {
    const state = buildChangeState({
      sources: [
        { name: "foo", kind: "function", file: "src/a.rs" },
        { name: "foo", kind: "function", file: "src/b.rs" },
      ],
    });
    expect(await dryDuplicateFunctionsRule.check(state)).toHaveLength(0);
  });

  it("does not flag a single function defined in one file", async () => {
    const state = buildChangeState({
      sources: [{ name: "process_payment", kind: "function", file: "src/billing.rs" }],
    });
    expect(await dryDuplicateFunctionsRule.check(state)).toHaveLength(0);
  });
});

describe("yagni-unused-functions", () => {
  it("ignores when source index is empty", async () => {
    const state = buildChangeState({});
    expect(await yagniUnusedFunctionsRule.check(state)).toHaveLength(0);
  });

  it("warns when a function is defined exactly once and never referenced", async () => {
    const state = buildChangeState({
      sources: [
        { name: "calculate_late_fee", kind: "function", file: "src/billing.rs" },
      ],
    });
    const drifts = await yagniUnusedFunctionsRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].hint).toContain("calculate_late_fee");
  });

  it("does not flag main or lifecycle methods", async () => {
    const state = buildChangeState({
      sources: [
        { name: "main", kind: "function", file: "src/main.rs" },
        { name: "OnInitializedAsync", kind: "function", file: "src/Component.razor.cs" },
      ],
    });
    expect(await yagniUnusedFunctionsRule.check(state)).toHaveLength(0);
  });

  it("does not flag functions that match contract test names", async () => {
    const contract = `# Contract

\`\`\`yaml tests
- name: calculates late fee for overdue payment
  given: []
  when: x
  then: y
\`\`\`
`;
    const state = buildChangeState({
      docs: { contract },
      sources: [
        {
          name: "calculates_late_fee_for_overdue_payment",
          kind: "function",
          file: "src/billing_tests.rs",
        },
      ],
    });
    expect(await yagniUnusedFunctionsRule.check(state)).toHaveLength(0);
  });
});
