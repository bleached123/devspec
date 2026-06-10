import type { CoherenceRule, Drift } from "../types.js";
import { extractApiMethods } from "../../contract.js";

export const apiTestCoverageRule: CoherenceRule = {
  name: "api-test-coverage",
  description: "Every method declared in the contract API must have at least one test",
  check(state) {
    const methods = extractApiMethods(state.docs.contract.raw);
    if (methods.length === 0) return [];
    if (state.tests.length === 0) return [];

    const testHaystack = state.tests
      .map((t) => `${t.name} ${t.when} ${t.then} ${t.given.join(" ")}`.toLowerCase())
      .join("\n");

    const uncovered: string[] = [];
    for (const method of methods) {
      if (!testHaystack.includes(method.name.toLowerCase())) {
        uncovered.push(
          method.inInterface
            ? `${method.inInterface}.${method.name}`
            : method.name
        );
      }
    }
    if (uncovered.length === 0) return [];

    const drifts: Drift[] = [];
    drifts.push({
      rule: "api-test-coverage",
      severity: "warn",
      message: `${uncovered.length} API method(s) have no matching test in tests.yaml`,
      hint: `Missing: ${uncovered.slice(0, 5).join(", ")}${uncovered.length > 5 ? `, +${uncovered.length - 5} more` : ""}`,
      remediations: [
        {
          label: "Add tests for the uncovered methods",
          description:
            "Each API method should be exercised by at least one test entry. Mention the method name in the test's `name` or `when` clause.",
        },
        {
          label: "Remove the uncovered methods from the API",
          description:
            "If the methods aren't actually needed, drop them from contract.md's API section",
        },
        {
          label: "Acknowledge as warning",
          description:
            "Trivial methods (getters, constructors) may not warrant explicit tests",
        },
      ],
    });
    return drifts;
  },
};
