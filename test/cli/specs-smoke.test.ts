import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("delta-specs end-to-end smoke", () => {
  it(
    "init → specs init → plan → delta → sync (dry-run) → sync → archive",
    { timeout: 120000 },
    async () => {
      await withTempWorkspace(async (root) => {
        // Setup workspace
        await setupWorkspace(root, { plan: ["Add bookings"] });

        // Create a capability
        const initR = await runCli(["specs", "init", "user-auth"], root);
        expect(initR.exitCode).toBe(0);

        // Seed an existing requirement so we can exercise MODIFIED later
        const mainSpec = path.join(root, ".devspec", "specs", "user-auth", "spec.md");
        await fs.writeFile(
          mainSpec,
          `# user-auth

Authentication and session management.

## Requirements

### Requirement: Session storage

The system SHALL store sessions in HTTP-only cookies.
`
        );

        // Scaffold a delta inside the change
        const deltaR = await runCli(["specs", "delta", "add-bookings", "user-auth"], root);
        expect(deltaR.exitCode).toBe(0);

        const deltaFile = path.join(
          root,
          ".devspec",
          "projects",
          "add-bookings",
          "deltas",
          "user-auth",
          "spec.md"
        );

        // Write a real delta: one ADDED + one MODIFIED
        await fs.writeFile(
          deltaFile,
          `## ADDED Requirements

### Requirement: Hardware key support

The system SHALL support WebAuthn as an MFA option.

## MODIFIED Requirements

### Requirement: Session storage

The system SHALL store sessions in HTTP-only cookies expiring after 30 minutes
of inactivity OR 24 hours total session duration, whichever is shorter.
`
        );

        // Status shows pending
        const statusR = await runCli(
          ["specs", "status", "add-bookings", "--json"],
          root
        );
        expect(statusR.exitCode).toBe(0);
        const status = JSON.parse(statusR.stdout);
        expect(status[0].pending).toEqual(["user-auth"]);

        // Dry-run preview
        const dryR = await runCli(
          ["specs", "sync", "add-bookings", "--dry-run"],
          root
        );
        expect(dryR.exitCode).toBe(0);
        expect(dryR.stdout).toContain("preview");
        // Main spec untouched
        expect(await fs.readFile(mainSpec, "utf8")).toContain(
          "The system SHALL store sessions in HTTP-only cookies."
        );
        expect(await fs.readFile(mainSpec, "utf8")).not.toContain(
          "Hardware key support"
        );

        // Apply sync
        const syncR = await runCli(["specs", "sync", "add-bookings"], root);
        expect(syncR.exitCode).toBe(0);
        expect(syncR.stdout).toContain("synced");

        const merged = await fs.readFile(mainSpec, "utf8");
        expect(merged).toContain("Hardware key support");
        expect(merged).toContain("24 hours total session duration");
        expect(merged).not.toContain("HTTP-only cookies.\n"); // original 1-sentence body gone
        expect(await fs.pathExists(deltaFile)).toBe(false);
        expect(await fs.pathExists(`${deltaFile}.synced`)).toBe(true);

        // List shows the capability as clean
        const listR = await runCli(["specs", "list", "--json"], root);
        expect(listR.exitCode).toBe(0);
        const list = JSON.parse(listR.stdout);
        expect(list[0]).toEqual({
          capability: "user-auth",
          status: "clean",
          changes: [],
        });

        // Complete stages and archive — verifies the change-with-synced-delta path
        for (const s of [
          "discovery",
          "proposal",
          "design",
          "contract",
          "alignment",
          "tasks",
        ]) {
          await runCli(["advance", "add-bookings", s], root);
        }
        const archiveR = await runCli(["archive", "add-bookings"], root);
        expect(archiveR.exitCode).toBe(0);

        // The .synced delta file is preserved inside the archive
        const archivedDelta = path.join(
          root,
          ".devspec",
          "archive",
          "add-bookings",
          "deltas",
          "user-auth",
          "spec.md.synced"
        );
        expect(await fs.pathExists(archivedDelta)).toBe(true);

        // Main capability spec still has the merged content
        const afterArchive = await fs.readFile(mainSpec, "utf8");
        expect(afterArchive).toContain("Hardware key support");
        expect(afterArchive).toContain("24 hours total session duration");
      });
    }
  );
});
