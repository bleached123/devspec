import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { deltaCapabilityMatchRule } from "../../src/core/coherence/rules/delta-capability-match.js";
import { buildChangeState } from "./helpers.js";

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "devspec-dcm-"));
}

async function writeDelta(root: string, slug: string, cap: string): Promise<void> {
  const dir = path.join(root, ".devspec", "projects", slug, "deltas", cap);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, "spec.md"), "");
}

describe("delta-capability-match rule", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
  });

  it("emits no findings when contract has no frontmatter", async () => {
    await writeDelta(root, "test", "user-auth");
    const state = buildChangeState({
      slug: "test",
      docs: { contract: "# Contract\n\nNo frontmatter here.\n" },
    });
    state.workspaceRoot = root;
    const drifts = await deltaCapabilityMatchRule.check(state);
    expect(drifts).toEqual([]);
  });

  it("flags a declared capability without a matching delta", async () => {
    const state = buildChangeState({
      slug: "test",
      docs: {
        contract: `---\ncapability:\n  - user-auth\n  - billing\n---\n\n# Contract\n`,
      },
    });
    state.workspaceRoot = root;
    await writeDelta(root, "test", "user-auth");
    // billing has no delta
    const drifts = await deltaCapabilityMatchRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].message).toContain("billing");
    expect(drifts[0].message).toContain("frontmatter");
  });

  it("flags an undeclared delta directory", async () => {
    const state = buildChangeState({
      slug: "test",
      docs: {
        contract: `---\ncapability:\n  - user-auth\n---\n\n# Contract\n`,
      },
    });
    state.workspaceRoot = root;
    await writeDelta(root, "test", "user-auth");
    await writeDelta(root, "test", "billing");
    // billing exists as delta but isn't declared
    const drifts = await deltaCapabilityMatchRule.check(state);
    const undecl = drifts.find((d) => d.message.includes("billing") && d.message.includes("not declared"));
    expect(undecl).toBeDefined();
  });

  it("emits no findings when declared and present sets match exactly", async () => {
    const state = buildChangeState({
      slug: "test",
      docs: {
        contract: `---\ncapability:\n  - user-auth\n  - billing\n---\n\n# Contract\n`,
      },
    });
    state.workspaceRoot = root;
    await writeDelta(root, "test", "user-auth");
    await writeDelta(root, "test", "billing");
    const drifts = await deltaCapabilityMatchRule.check(state);
    expect(drifts).toEqual([]);
  });
});
