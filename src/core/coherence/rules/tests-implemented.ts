import type { CoherenceRule, Drift } from "../types.js";
import { targetTestName } from "../../templates.js";
import { looksUnimplemented } from "../../source.js";

export const testsImplementedRule: CoherenceRule = {
  name: "tests-implemented",
  description:
    "Each test in tests.yaml must have a matching function in source code",
  check(state) {
    if (state.tests.length === 0) return [];
    if (state.sourceIndex.fileCount === 0) return [];

    const missing: string[] = [];
    const stubbed: string[] = [];

    for (const test of state.tests) {
      const expected = targetTestName(test.name, state.backend);
      const matches = state.sourceIndex.identifiers.get(expected);
      if (!matches || matches.length === 0) {
        missing.push(`${expected}  ← "${test.name}"`);
        continue;
      }
      if (matches.every((m) => looksUnimplemented(m.bodyPreview))) {
        stubbed.push(`${expected}  ← "${test.name}"`);
      }
    }

    const drifts: Drift[] = [];
    if (missing.length > 0) {
      drifts.push({
        rule: "tests-implemented",
        severity: "block",
        message: `${missing.length} test(s) from tests.yaml are not present in source`,
        hint: missing.slice(0, 5).join("\n         "),
        remediations: [
          {
            label: "Run `devspec scaffold` to regenerate missing tests",
            description:
              "Re-emit the failing test stubs so the agent can implement them",
          },
          {
            label: "Remove the orphaned entry from tests.yaml",
            description:
              "If the test was intentionally dropped, remove it from contract.md and re-run coherence",
          },
        ],
      });
    }
    if (stubbed.length > 0) {
      drifts.push({
        rule: "tests-implemented",
        severity: "warn",
        message: `${stubbed.length} test(s) are scaffolded but not yet implemented (todo!/NotImplementedException)`,
        hint: stubbed.slice(0, 5).join("\n         "),
      });
    }
    return drifts;
  },
};
