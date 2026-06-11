import type { CoherenceReport } from "./coherence/runner.js";
import { BUILTIN_RULES, BUILTIN_WORKSPACE_RULES } from "./coherence/runner.js";

const TOOL_VERSION = "0.1.0";

// Each coherence rule's finding is anchored to the lifecycle doc that owns the
// drifted claim, so SARIF viewers (GitHub code scanning, the ADO SARIF tab)
// annotate the file a human would edit to fix it.
const RULE_DOC: Record<string, string> = {
  "stage-order": "status.yaml",
  "stage-claim-vs-content": "status.yaml",
  "task-granularity": "tasks.md",
  "design-tasks-coverage": "tasks.md",
  "goal-coverage": "design.md",
  "design-contract-coverage": "design.md",
  "contract-coverage": "contract.md",
  "tests-implemented": "contract.md",
  "api-test-coverage": "contract.md",
  "api-method-implemented": "contract.md",
  "capability-exists": "contract.md",
  "delta-format": "contract.md",
  "delta-capability-match": "contract.md",
  "requirement-conflict": "contract.md",
};

export function buildSarif(report: CoherenceReport, slug: string): object {
  const allRules = [...BUILTIN_RULES, ...BUILTIN_WORKSPACE_RULES];

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "devspec",
            informationUri: "https://www.npmjs.com/package/devspec-cli",
            version: TOOL_VERSION,
            rules: allRules.map((rule) => ({
              id: rule.name,
              shortDescription: { text: rule.description },
              defaultConfiguration: { level: "warning" },
            })),
          },
        },
        results: report.drifts.map((drift) => ({
          ruleId: drift.rule,
          level: drift.severity === "block" ? "error" : "warning",
          message: {
            text: drift.hint ? `${drift.message} — ${drift.hint}` : drift.message,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: `.devspec/projects/${slug}/${RULE_DOC[drift.rule] ?? "contract.md"}`,
                  uriBaseId: "%SRCROOT%",
                },
                region: { startLine: 1 },
              },
            },
          ],
        })),
      },
    ],
  };
}
