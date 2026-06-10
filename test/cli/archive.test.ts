import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("devspec archive", () => {
  it(
    "refuses to archive a change with incomplete stages without --force",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const r = await runCli(["archive", "add-bookings"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr + r.stdout).toMatch(/incomplete stages/);
      });
    }
  );

  it(
    "moves to .devspec/archive when all stages are done",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
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
        const r = await runCli(["archive", "add-bookings"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("Archived");

        expect(
          await fs.pathExists(
            path.join(root, ".devspec", "projects", "add-bookings")
          )
        ).toBe(false);
        expect(
          await fs.pathExists(
            path.join(root, ".devspec", "archive", "add-bookings")
          )
        ).toBe(true);
      });
    }
  );

  it(
    "--force lets you archive an incomplete change",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const r = await runCli(
          ["archive", "add-bookings", "--force"],
          root
        );
        expect(r.exitCode).toBe(0);
        expect(
          await fs.pathExists(
            path.join(root, ".devspec", "archive", "add-bookings")
          )
        ).toBe(true);
      });
    }
  );

  it(
    "--restore moves archive back to projects",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["archive", "add-bookings", "--force"], root);
        const r = await runCli(
          ["archive", "add-bookings", "--restore"],
          root
        );
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("Restored");
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
});

describe("devspec claude (CLAUDE.md generator)", () => {
  it(
    "auto-creates CLAUDE.md on init; re-running `devspec claude` updates the block",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });

        // init auto-generates CLAUDE.md — file exists immediately
        const initContent = await fs.readFile(
          path.join(root, "CLAUDE.md"),
          "utf8"
        );
        expect(initContent).toContain("<!-- devspec:claude:start -->");
        expect(initContent).toContain("<!-- devspec:claude:end -->");
        expect(initContent).toContain("DevSpec context");

        // Re-running `devspec claude` regenerates the managed block in place
        const r = await runCli(["claude"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("Updated");
        const content = await fs.readFile(
          path.join(root, "CLAUDE.md"),
          "utf8"
        );
        expect(content).toContain("Backend:");
        expect(content).toContain("Engineering standards");
      });
    }
  );

  it(
    "preserves user content outside the markers on re-run",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        await runCli(["claude"], root);

        const claudePath = path.join(root, "CLAUDE.md");
        const original = await fs.readFile(claudePath, "utf8");
        const customized = "## Team note\nWe ship every Tuesday.\n\n" + original;
        await fs.writeFile(claudePath, customized);

        const r = await runCli(["claude"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toMatch(/Updated/);

        const final = await fs.readFile(claudePath, "utf8");
        expect(final).toContain("Team note");
        expect(final).toContain("We ship every Tuesday");
        expect(final).toContain("<!-- devspec:claude:start -->");
      });
    }
  );
});
