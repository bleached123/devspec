import type { CoherenceRule, Drift } from "../types.js";

const MIN_TESTS = 1;

export const contractCoverageRule: CoherenceRule = {
  name: "contract-coverage",
  description:
    "Contract must define both an API surface and at least one test before tasks begin",
  check(state) {
    const contract = state.docs.contract;
    const drifts: Drift[] = [];

    if (
      state.status.stages.contract === "pending" &&
      state.status.stages.tasks === "pending"
    ) {
      return drifts;
    }

    if (contract.isEmpty || contract.isTemplateOnly) {
      drifts.push({
        rule: "contract-coverage",
        severity: "block",
        message: "contract.md is empty or template-only — no API or tests defined",
        remediations: [
          {
            label: "Fill in contract.md",
            description:
              "Add an API section with TS-flavored pseudocode and a ```yaml tests block with at least one test case",
          },
          {
            label: "Revert contract to pending",
            description: "Mark the contract stage pending and pause downstream work",
          },
        ],
      });
      return drifts;
    }

    const hasApiSection = contract.sections.some((s) =>
      /\bapi\b/i.test(s.heading)
    );
    if (!hasApiSection) {
      drifts.push({
        rule: "contract-coverage",
        severity: "warn",
        message: "contract.md has no ## API section",
        hint: "The contract should describe the public surface (interfaces, types, error variants) under an `## API` heading.",
        remediations: [
          {
            label: "Add an API section",
            description: "Introduce an `## API` heading with TS-flavored pseudocode",
          },
          {
            label: "Acknowledge as warning",
            description: "Skip if your contract uses a different heading convention",
          },
        ],
      });
    }

    if (state.tests.length < MIN_TESTS) {
      drifts.push({
        rule: "contract-coverage",
        severity: "block",
        message: "contract.md has no parseable ```yaml tests block (or it is empty)",
        hint: "Tests must live in a fenced block tagged ```yaml tests with entries containing name/when/then.",
        remediations: [
          {
            label: "Add at least one test entry",
            description:
              "Add a ```yaml tests block with one or more entries containing name, when, and then",
          },
          {
            label: "Acknowledge as block (no scaffold)",
            description:
              "If you intend to skip TDD scaffolding for this change, revert contract to pending",
          },
        ],
      });
    }

    return drifts;
  },
};
