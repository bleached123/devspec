import { describe, it, expect } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { runCli, setupWorkspace, withTempWorkspace } from "./helpers.js";

describe("devspec specs", () => {
  it("init scaffolds .devspec/specs/<cap>/spec.md and is idempotent", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root);
      const r1 = await runCli(["specs", "init", "user-auth"], root);
      expect(r1.exitCode).toBe(0);
      const file = path.join(root, ".devspec", "specs", "user-auth", "spec.md");
      expect(await fs.pathExists(file)).toBe(true);
      const content = await fs.readFile(file, "utf8");
      expect(content).toContain("# user-auth");
      expect(content).toContain("## Requirements");

      // Idempotent: a second run keeps the file
      await fs.writeFile(file, "# user-auth\n\nedited\n\n## Requirements\n");
      const r2 = await runCli(["specs", "init", "user-auth"], root);
      expect(r2.exitCode).toBe(0);
      const after = await fs.readFile(file, "utf8");
      expect(after).toContain("edited");
    });
  });

  it("init rejects invalid capability names", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root);
      const r = await runCli(["specs", "init", "User_Auth"], root);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr + r.stdout).toContain("kebab-case");
    });
  });

  it("list shows capabilities with sync status", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root);
      await runCli(["specs", "init", "alpha"], root);
      await runCli(["specs", "init", "beta"], root);

      const r = await runCli(["specs", "list"], root);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("alpha");
      expect(r.stdout).toContain("beta");
      expect(r.stdout).toContain("clean");
    });
  });

  it("list (json) emits machine-readable output", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root);
      await runCli(["specs", "init", "alpha"], root);

      const r = await runCli(["specs", "list", "--json"], root);
      expect(r.exitCode).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toEqual([{ capability: "alpha", status: "clean", changes: [] }]);
    });
  });

  it("delta refuses when capability does not exist", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root, { plan: ["Add bookings"] });
      const r = await runCli(["specs", "delta", "add-bookings", "pricing"], root);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr + r.stdout).toContain("specs init pricing");
    });
  });

  it("delta scaffolds when capability exists", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root, { plan: ["Add bookings"] });
      await runCli(["specs", "init", "user-auth"], root);

      const r = await runCli(["specs", "delta", "add-bookings", "user-auth"], root);
      expect(r.exitCode).toBe(0);
      const deltaFile = path.join(
        root,
        ".devspec",
        "projects",
        "add-bookings",
        "deltas",
        "user-auth",
        "spec.md"
      );
      expect(await fs.pathExists(deltaFile)).toBe(true);
      const content = await fs.readFile(deltaFile, "utf8");
      expect(content).toContain("## ADDED Requirements");
      expect(content).toContain("## MODIFIED Requirements");
      expect(content).toContain("## REMOVED Requirements");
    });
  });

  it("status reports pending deltas for a single change", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root, { plan: ["Add bookings"] });
      await runCli(["specs", "init", "user-auth"], root);
      await runCli(["specs", "delta", "add-bookings", "user-auth"], root);

      // Fill the delta with a real ADDED block
      const deltaFile = path.join(
        root,
        ".devspec",
        "projects",
        "add-bookings",
        "deltas",
        "user-auth",
        "spec.md"
      );
      await fs.writeFile(
        deltaFile,
        "## ADDED Requirements\n\n### Requirement: Login\n\nThe system SHALL log users in.\n"
      );

      const r = await runCli(["specs", "status", "add-bookings", "--json"], root);
      expect(r.exitCode).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toEqual([{ slug: "add-bookings", pending: ["user-auth"], synced: [] }]);
    });
  });

  it("sync dry-run previews without writing", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root, { plan: ["Add bookings"] });
      await runCli(["specs", "init", "user-auth"], root);
      await runCli(["specs", "delta", "add-bookings", "user-auth"], root);

      const deltaFile = path.join(
        root,
        ".devspec",
        "projects",
        "add-bookings",
        "deltas",
        "user-auth",
        "spec.md"
      );
      await fs.writeFile(
        deltaFile,
        "## ADDED Requirements\n\n### Requirement: Login\n\nThe system SHALL log users in.\n"
      );
      const mainSpec = path.join(root, ".devspec", "specs", "user-auth", "spec.md");
      const before = await fs.readFile(mainSpec, "utf8");

      const r = await runCli(["specs", "sync", "add-bookings", "--dry-run"], root);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("preview");

      // Files unchanged
      expect(await fs.readFile(mainSpec, "utf8")).toBe(before);
      expect(await fs.pathExists(deltaFile)).toBe(true);
    });
  });

  it("sync merges delta into main spec and renames delta to .synced", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root, { plan: ["Add bookings"] });
      await runCli(["specs", "init", "user-auth"], root);
      await runCli(["specs", "delta", "add-bookings", "user-auth"], root);

      const deltaFile = path.join(
        root,
        ".devspec",
        "projects",
        "add-bookings",
        "deltas",
        "user-auth",
        "spec.md"
      );
      await fs.writeFile(
        deltaFile,
        "## ADDED Requirements\n\n### Requirement: Login\n\nThe system SHALL log users in.\n"
      );

      const r = await runCli(["specs", "sync", "add-bookings"], root);
      expect(r.exitCode).toBe(0);
      const mainSpec = path.join(root, ".devspec", "specs", "user-auth", "spec.md");
      const content = await fs.readFile(mainSpec, "utf8");
      expect(content).toContain("### Requirement: Login");
      expect(await fs.pathExists(deltaFile)).toBe(false);
      expect(await fs.pathExists(`${deltaFile}.synced`)).toBe(true);
    });
  });

  it("sync error exits non-zero and leaves files untouched", { timeout: 60000 }, async () => {
    await withTempWorkspace(async (root) => {
      await setupWorkspace(root, { plan: ["Add bookings"] });
      await runCli(["specs", "init", "user-auth"], root);
      await runCli(["specs", "delta", "add-bookings", "user-auth"], root);

      const deltaFile = path.join(
        root,
        ".devspec",
        "projects",
        "add-bookings",
        "deltas",
        "user-auth",
        "spec.md"
      );
      // Reference a non-existent requirement
      await fs.writeFile(
        deltaFile,
        "## MODIFIED Requirements\n\n### Requirement: Phantom\n\nbody\n"
      );
      const mainSpec = path.join(root, ".devspec", "specs", "user-auth", "spec.md");
      const before = await fs.readFile(mainSpec, "utf8");

      const r = await runCli(["specs", "sync", "add-bookings"], root);
      expect(r.exitCode).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/Phantom|not found/);
      expect(await fs.readFile(mainSpec, "utf8")).toBe(before);
      expect(await fs.pathExists(deltaFile)).toBe(true);
    });
  });
});
