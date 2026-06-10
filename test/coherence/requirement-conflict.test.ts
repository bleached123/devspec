import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { requirementConflictRule } from "../../src/core/coherence/rules/requirement-conflict.js";
import type { WorkspaceContext } from "../../src/core/coherence/types.js";
import { buildChangeState } from "./helpers.js";

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "devspec-reqconf-"));
}

async function writeDelta(
  root: string,
  slug: string,
  cap: string,
  content: string
): Promise<void> {
  const dir = path.join(root, ".devspec", "projects", slug, "deltas", cap);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, "spec.md"), content);
}

function makeCtx(root: string, slugs: string[]): WorkspaceContext {
  return {
    root,
    activeSlugs: slugs,
    loadChangeState: async (slug) => {
      const state = buildChangeState({ slug });
      state.workspaceRoot = root;
      return state;
    },
  };
}

describe("requirement-conflict workspace rule", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
  });

  it("emits no findings when there is only one active change", async () => {
    await writeDelta(
      root,
      "a",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody\n"
    );
    const ctx = makeCtx(root, ["a"]);
    const drifts = await requirementConflictRule.check(ctx);
    expect(drifts).toEqual([]);
  });

  it("flags two changes that MODIFY the same requirement", async () => {
    await writeDelta(
      root,
      "a",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-a\n"
    );
    await writeDelta(
      root,
      "b",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-b\n"
    );
    const ctx = makeCtx(root, ["a", "b"]);
    const drifts = await requirementConflictRule.check(ctx);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].rule).toBe("requirement-conflict");
    expect(drifts[0].severity).toBe("block");
    expect(drifts[0].slugs.sort()).toEqual(["a", "b"]);
    expect(drifts[0].message).toContain("Session storage");
    expect(drifts[0].message).toContain("user-auth");
    expect(drifts[0].message).toContain("modified-modified");
  });

  it("flags a MODIFY/REMOVE collision", async () => {
    await writeDelta(
      root,
      "a",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody\n"
    );
    await writeDelta(
      root,
      "b",
      "user-auth",
      "## REMOVED Requirements\n\n### Requirement: Session storage\n\nremoved.\n"
    );
    const ctx = makeCtx(root, ["a", "b"]);
    const drifts = await requirementConflictRule.check(ctx);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].message).toContain("modified-removed");
  });

  it("flags an ADD/ADD collision", async () => {
    await writeDelta(
      root,
      "a",
      "user-auth",
      "## ADDED Requirements\n\n### Requirement: Hardware key\n\nbody-a\n"
    );
    await writeDelta(
      root,
      "b",
      "user-auth",
      "## ADDED Requirements\n\n### Requirement: Hardware key\n\nbody-b\n"
    );
    const ctx = makeCtx(root, ["a", "b"]);
    const drifts = await requirementConflictRule.check(ctx);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].message).toContain("added-added");
  });

  it("does NOT flag when changes touch different requirements", async () => {
    await writeDelta(
      root,
      "a",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-a\n"
    );
    await writeDelta(
      root,
      "b",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Password reset\n\nbody-b\n"
    );
    const ctx = makeCtx(root, ["a", "b"]);
    const drifts = await requirementConflictRule.check(ctx);
    expect(drifts).toEqual([]);
  });

  it("does NOT flag when changes touch the same requirement in different capabilities", async () => {
    await writeDelta(
      root,
      "a",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-a\n"
    );
    await writeDelta(
      root,
      "b",
      "billing",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-b\n"
    );
    const ctx = makeCtx(root, ["a", "b"]);
    const drifts = await requirementConflictRule.check(ctx);
    expect(drifts).toEqual([]);
  });

  it("ignores synced deltas (only pending deltas count)", async () => {
    // a's delta is already synced
    const dir = path.join(root, ".devspec", "projects", "a", "deltas", "user-auth");
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, "spec.md.synced"),
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-a\n"
    );
    // b's delta is pending
    await writeDelta(
      root,
      "b",
      "user-auth",
      "## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-b\n"
    );
    const ctx = makeCtx(root, ["a", "b"]);
    const drifts = await requirementConflictRule.check(ctx);
    expect(drifts).toEqual([]);
  });
});
