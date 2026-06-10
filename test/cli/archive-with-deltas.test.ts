import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

async function completeAllStages(root: string, slug: string): Promise<void> {
  for (const s of [
    "discovery",
    "proposal",
    "design",
    "contract",
    "alignment",
    "tasks",
  ]) {
    await runCli(["advance", slug, s], root);
  }
}

async function writeDelta(root: string, slug: string, cap: string, content: string): Promise<void> {
  const deltaFile = path.join(
    root,
    ".devspec",
    "projects",
    slug,
    "deltas",
    cap,
    "spec.md"
  );
  await fs.ensureDir(path.dirname(deltaFile));
  await fs.writeFile(deltaFile, content);
}

describe("devspec archive with deltas", () => {
  it(
    "legacy change with no deltas archives unchanged",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await completeAllStages(root, "add-bookings");

        const r = await runCli(["archive", "add-bookings"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("Archived");
        expect(r.stdout).not.toContain("synced");
      });
    }
  );

  it(
    "change with valid deltas auto-syncs then archives",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["specs", "init", "user-auth"], root);
        await writeDelta(
          root,
          "add-bookings",
          "user-auth",
          "## ADDED Requirements\n\n### Requirement: Login\n\nThe system SHALL log users in.\n"
        );
        await completeAllStages(root, "add-bookings");

        const r = await runCli(["archive", "add-bookings"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("synced");
        expect(r.stdout).toContain("user-auth");

        // Main capability spec has the new requirement
        const mainSpec = await fs.readFile(
          path.join(root, ".devspec", "specs", "user-auth", "spec.md"),
          "utf8"
        );
        expect(mainSpec).toContain("### Requirement: Login");

        // Change moved to archive
        expect(
          await fs.pathExists(
            path.join(root, ".devspec", "archive", "add-bookings")
          )
        ).toBe(true);
        expect(
          await fs.pathExists(
            path.join(root, ".devspec", "projects", "add-bookings")
          )
        ).toBe(false);

        // Synced delta marker preserved inside the archive (audit trail)
        expect(
          await fs.pathExists(
            path.join(
              root,
              ".devspec",
              "archive",
              "add-bookings",
              "deltas",
              "user-auth",
              "spec.md.synced"
            )
          )
        ).toBe(true);
      });
    }
  );

  it(
    "change with invalid deltas aborts archive",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["specs", "init", "user-auth"], root);
        await writeDelta(
          root,
          "add-bookings",
          "user-auth",
          "## MODIFIED Requirements\n\n### Requirement: Phantom\n\nbody\n"
        );
        await completeAllStages(root, "add-bookings");

        const r = await runCli(["archive", "add-bookings"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/Phantom|not found/);
        // Change remains in projects/
        expect(
          await fs.pathExists(
            path.join(root, ".devspec", "projects", "add-bookings")
          )
        ).toBe(true);
        expect(
          await fs.pathExists(
            path.join(root, ".devspec", "archive", "add-bookings")
          )
        ).toBe(false);
      });
    }
  );

  it(
    "--no-sync archives with deltas intact and no merge",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["specs", "init", "user-auth"], root);
        await writeDelta(
          root,
          "add-bookings",
          "user-auth",
          "## ADDED Requirements\n\n### Requirement: Login\n\nbody\n"
        );
        const beforeMain = await fs.readFile(
          path.join(root, ".devspec", "specs", "user-auth", "spec.md"),
          "utf8"
        );
        await completeAllStages(root, "add-bookings");

        const r = await runCli(["archive", "add-bookings", "--no-sync"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("skip sync");

        // Main spec untouched
        const afterMain = await fs.readFile(
          path.join(root, ".devspec", "specs", "user-auth", "spec.md"),
          "utf8"
        );
        expect(afterMain).toBe(beforeMain);

        // Delta archived intact, NOT renamed to .synced
        const archivedDelta = path.join(
          root,
          ".devspec",
          "archive",
          "add-bookings",
          "deltas",
          "user-auth",
          "spec.md"
        );
        expect(await fs.pathExists(archivedDelta)).toBe(true);
        expect(await fs.pathExists(`${archivedDelta}.synced`)).toBe(false);
      });
    }
  );
});
