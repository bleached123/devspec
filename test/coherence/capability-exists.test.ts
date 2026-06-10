import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { capabilityExistsRule } from "../../src/core/coherence/rules/capability-exists.js";
import { buildChangeState } from "./helpers.js";

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "devspec-cap-exists-"));
}

describe("capability-exists rule", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
  });

  it("emits no findings when the change has no deltas", async () => {
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await capabilityExistsRule.check(state);
    expect(drifts).toEqual([]);
  });

  it("flags a delta whose capability has no main spec", async () => {
    const slug = "test";
    const deltaDir = path.join(root, ".devspec", "projects", slug, "deltas", "pricing");
    await fs.ensureDir(deltaDir);
    await fs.writeFile(path.join(deltaDir, "spec.md"), "## ADDED Requirements\n");

    const state = buildChangeState({ slug });
    state.workspaceRoot = root;
    const drifts = await capabilityExistsRule.check(state);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].rule).toBe("capability-exists");
    expect(drifts[0].severity).toBe("warn");
    expect(drifts[0].message).toContain("pricing");
    expect(drifts[0].remediations).toBeDefined();
    expect(drifts[0].remediations!.length).toBeGreaterThan(0);
  });

  it("does NOT flag a delta whose capability has a main spec", async () => {
    const slug = "test";
    const deltaDir = path.join(root, ".devspec", "projects", slug, "deltas", "user-auth");
    const specDir = path.join(root, ".devspec", "specs", "user-auth");
    await fs.ensureDir(deltaDir);
    await fs.ensureDir(specDir);
    await fs.writeFile(path.join(deltaDir, "spec.md"), "## ADDED Requirements\n");
    await fs.writeFile(path.join(specDir, "spec.md"), "# user-auth\n\n## Requirements\n");

    const state = buildChangeState({ slug });
    state.workspaceRoot = root;
    const drifts = await capabilityExistsRule.check(state);
    expect(drifts).toEqual([]);
  });

  it("flags multiple orphaned capabilities independently", async () => {
    const slug = "test";
    for (const cap of ["pricing", "shipping"]) {
      const d = path.join(root, ".devspec", "projects", slug, "deltas", cap);
      await fs.ensureDir(d);
      await fs.writeFile(path.join(d, "spec.md"), "");
    }
    const state = buildChangeState({ slug });
    state.workspaceRoot = root;
    const drifts = await capabilityExistsRule.check(state);
    expect(drifts).toHaveLength(2);
    const caps = drifts.map((d) => d.message).join(" ");
    expect(caps).toContain("pricing");
    expect(caps).toContain("shipping");
  });
});
