import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { deltaFormatRule } from "../../src/core/coherence/rules/delta-format.js";
import { buildChangeState } from "./helpers.js";

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "devspec-deltafmt-"));
}

async function writeDelta(
  root: string,
  slug: string,
  capability: string,
  content: string
): Promise<void> {
  const dir = path.join(root, ".devspec", "projects", slug, "deltas", capability);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, "spec.md"), content);
}

describe("delta-format rule", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
  });

  it("emits no findings for a well-formed delta", async () => {
    await writeDelta(
      root,
      "test",
      "user-auth",
      `## ADDED Requirements\n\n### Requirement: Login\n\nThe system SHALL log users in.\n`
    );
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await deltaFormatRule.check(state);
    expect(drifts).toEqual([]);
  });

  it("flags an unknown block header (typo)", async () => {
    await writeDelta(
      root,
      "test",
      "user-auth",
      `## ADDDED Requirements\n\n### Requirement: Login\n\nbody\n`
    );
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await deltaFormatRule.check(state);
    const unknownBlockFinding = drifts.find((d) => d.message.includes("ADDDED"));
    expect(unknownBlockFinding).toBeDefined();
    expect(unknownBlockFinding!.severity).toBe("warn");
  });

  it("flags a requirement outside any block", async () => {
    await writeDelta(
      root,
      "test",
      "user-auth",
      `### Requirement: Orphan\n\nbody\n`
    );
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await deltaFormatRule.check(state);
    const orphan = drifts.find((d) => d.message.includes("Orphan"));
    expect(orphan).toBeDefined();
  });

  it("flags an ADDED requirement with empty body", async () => {
    await writeDelta(
      root,
      "test",
      "user-auth",
      `## ADDED Requirements\n\n### Requirement: Empty\n\n### Requirement: NextOne\n\nfilled\n`
    );
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await deltaFormatRule.check(state);
    const empty = drifts.find((d) => d.message.includes("Empty") && d.message.includes("empty body"));
    expect(empty).toBeDefined();
  });

  it("allows REMOVED requirements to have empty body", async () => {
    await writeDelta(
      root,
      "test",
      "user-auth",
      `## REMOVED Requirements\n\n### Requirement: Deleted\n`
    );
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await deltaFormatRule.check(state);
    expect(drifts.filter((d) => d.message.includes("empty body"))).toHaveLength(0);
  });

  it("flags duplicate requirements within the same block", async () => {
    await writeDelta(
      root,
      "test",
      "user-auth",
      `## ADDED Requirements\n\n### Requirement: Login\n\nbody\n\n### Requirement: Login\n\nbody two\n`
    );
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await deltaFormatRule.check(state);
    const dup = drifts.find((d) => d.message.includes("Duplicate"));
    expect(dup).toBeDefined();
  });

  it("ignores content inside HTML comments", async () => {
    await writeDelta(
      root,
      "test",
      "user-auth",
      `## ADDED Requirements\n\n<!--\n### Requirement: Hidden\nthis is in a comment\n-->\n\n### Requirement: Real\n\nbody\n`
    );
    const state = buildChangeState({ slug: "test" });
    state.workspaceRoot = root;
    const drifts = await deltaFormatRule.check(state);
    // No orphan / empty-body finding because the commented requirement is invisible
    expect(drifts).toEqual([]);
  });
});
