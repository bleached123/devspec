import { describe, it, expect } from "vitest";
import { contractCoverageRule } from "../../src/core/coherence/rules/contract-coverage.js";
import { buildChangeState } from "./helpers.js";

const VALID_CONTRACT = `# Contract — test

## API
\`\`\`ts
interface Foo { bar(): void; }
\`\`\`

## Tests
\`\`\`yaml tests
- name: bar does the thing
  given:
    - precondition
  when: bar is called
  then: outcome happens
\`\`\`
`;

describe("contract-coverage", () => {
  it("ignores changes where contract is pending and tasks are pending", async () => {
    const state = buildChangeState({ docs: { contract: "" } });
    expect(await contractCoverageRule.check(state)).toHaveLength(0);
  });

  it("blocks when contract is empty and contract stage is done", async () => {
    const state = buildChangeState({
      stages: { contract: "done" },
      docs: { contract: "" },
    });
    const drifts = await contractCoverageRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].severity).toBe("block");
    expect(drifts[0].message).toContain("empty");
  });

  it("blocks when contract has API but no test block", async () => {
    const noTests = `# Contract\n\n## API\n\`\`\`ts\ninterface Foo {}\n\`\`\`\n`;
    const state = buildChangeState({
      stages: { contract: "done" },
      docs: { contract: noTests },
    });
    const drifts = await contractCoverageRule.check(state);
    expect(drifts.some((d) => d.severity === "block")).toBe(true);
    expect(drifts.some((d) => d.message.includes("yaml tests"))).toBe(true);
  });

  it("warns when contract has tests but no API section", async () => {
    const noApi = `# Contract\n\n## Tests\n\`\`\`yaml tests\n- name: x\n  given: []\n  when: y\n  then: z\n\`\`\`\n`;
    const state = buildChangeState({
      stages: { contract: "done" },
      docs: { contract: noApi },
    });
    const drifts = await contractCoverageRule.check(state);
    expect(drifts.some((d) => d.severity === "warn" && d.message.includes("API"))).toBe(true);
  });

  it("passes on a well-formed contract", async () => {
    const state = buildChangeState({
      stages: { contract: "done" },
      docs: { contract: VALID_CONTRACT },
    });
    expect(await contractCoverageRule.check(state)).toHaveLength(0);
  });
});
