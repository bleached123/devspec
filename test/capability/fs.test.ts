import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import {
  atomicWrite,
  capabilitySpecPath,
  deltaSpecPath,
  listCapabilities,
  listDeltas,
} from "../../src/core/capability.js";

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "devspec-cap-"));
  return root;
}

describe("capability path helpers", () => {
  it("builds capability spec path inside .devspec/specs/<cap>/spec.md", () => {
    const root = path.join("/", "tmp", "ws");
    expect(capabilitySpecPath(root, "user-auth")).toBe(
      path.join(root, ".devspec", "specs", "user-auth", "spec.md")
    );
  });

  it("builds delta spec path inside .devspec/projects/<slug>/deltas/<cap>/spec.md", () => {
    const root = path.join("/", "tmp", "ws");
    expect(deltaSpecPath(root, "cancel-booking", "user-auth")).toBe(
      path.join(root, ".devspec", "projects", "cancel-booking", "deltas", "user-auth", "spec.md")
    );
  });
});

describe("listCapabilities", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
  });

  it("returns [] when .devspec/specs/ does not exist", async () => {
    expect(await listCapabilities(root)).toEqual([]);
  });

  it("lists directory names sorted alphabetically", async () => {
    await fs.ensureDir(path.join(root, ".devspec", "specs", "zeta"));
    await fs.ensureDir(path.join(root, ".devspec", "specs", "alpha"));
    await fs.ensureDir(path.join(root, ".devspec", "specs", "mu"));
    expect(await listCapabilities(root)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("ignores subdirectories with invalid kebab-case names", async () => {
    await fs.ensureDir(path.join(root, ".devspec", "specs", "good-name"));
    await fs.ensureDir(path.join(root, ".devspec", "specs", "Bad_Name"));
    expect(await listCapabilities(root)).toEqual(["good-name"]);
  });
});

describe("listDeltas", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
  });

  it("returns [] when the change has no deltas/ directory", async () => {
    expect(await listDeltas(root, "missing")).toEqual([]);
  });

  it("lists pending deltas (spec.md without .synced)", async () => {
    const deltaDir = path.join(
      root,
      ".devspec",
      "projects",
      "cancel-booking",
      "deltas",
      "user-auth"
    );
    await fs.ensureDir(deltaDir);
    await fs.writeFile(path.join(deltaDir, "spec.md"), "## ADDED Requirements\n");

    const result = await listDeltas(root, "cancel-booking");
    expect(result).toHaveLength(1);
    expect(result[0].capability).toBe("user-auth");
    expect(result[0].status).toBe("pending");
  });

  it("marks deltas as synced when file has .synced suffix", async () => {
    const deltaDir = path.join(
      root,
      ".devspec",
      "projects",
      "cancel-booking",
      "deltas",
      "billing"
    );
    await fs.ensureDir(deltaDir);
    await fs.writeFile(path.join(deltaDir, "spec.md.synced"), "## ADDED Requirements\n");

    const result = await listDeltas(root, "cancel-booking");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("synced");
  });

  it("returns entries sorted by capability name", async () => {
    for (const cap of ["zeta", "alpha", "mu"]) {
      const d = path.join(
        root,
        ".devspec",
        "projects",
        "cancel-booking",
        "deltas",
        cap
      );
      await fs.ensureDir(d);
      await fs.writeFile(path.join(d, "spec.md"), "");
    }
    const result = await listDeltas(root, "cancel-booking");
    expect(result.map((d) => d.capability)).toEqual(["alpha", "mu", "zeta"]);
  });
});

describe("atomicWrite", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempRoot();
  });

  it("writes a new file when target does not exist", async () => {
    const target = path.join(root, "new.txt");
    await atomicWrite(target, "hello");
    expect(await fs.readFile(target, "utf8")).toBe("hello");
  });

  it("creates parent directories if missing", async () => {
    const target = path.join(root, "nested", "deep", "file.txt");
    await atomicWrite(target, "deep");
    expect(await fs.readFile(target, "utf8")).toBe("deep");
  });

  it("overwrites an existing file", async () => {
    const target = path.join(root, "existing.txt");
    await fs.writeFile(target, "old");
    await atomicWrite(target, "new");
    expect(await fs.readFile(target, "utf8")).toBe("new");
  });

  it("leaves no .tmp files behind after success", async () => {
    const target = path.join(root, "clean.txt");
    await atomicWrite(target, "ok");
    const entries = await fs.readdir(root);
    expect(entries).toEqual(["clean.txt"]);
  });

  it("preserves the original file if rename fails (simulated via target being a directory)", async () => {
    // Make the target path a directory — fs.rename of a file over a non-empty dir errors on
    // most platforms. The original directory should remain untouched.
    const target = path.join(root, "target-as-dir");
    await fs.ensureDir(target);
    await fs.writeFile(path.join(target, "inner.txt"), "preserved");

    let threw = false;
    try {
      await atomicWrite(target, "should fail");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // Directory still exists with its inner file
    expect(await fs.readFile(path.join(target, "inner.txt"), "utf8")).toBe("preserved");
  });
});
