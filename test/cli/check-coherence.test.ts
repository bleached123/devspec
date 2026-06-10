import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("devspec check", () => {
  it(
    "passes on a fresh workspace with env generated",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await runCli(["env", "generate"], root);
        const r = await runCli(["check"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("checks passed");
      });
    }
  );

  it(
    "flags Rust clean-architecture layer violation",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await fs.ensureDir(path.join(root, "src", "domain"));
        await fs.ensureDir(path.join(root, "src", "infrastructure"));
        await fs.writeFile(path.join(root, "src", "infrastructure", "db.rs"), "pub struct Db;");
        await fs.writeFile(
          path.join(root, "src", "domain", "foo.rs"),
          "use crate::infrastructure::db::Db;\npub struct Foo;\n"
        );
        const r = await runCli(["check"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stdout).toContain("guardrail.clean-architecture");
        expect(r.stdout).toMatch(/violations/i);
        expect(r.stdout).toContain("infrastructure");
      });
    }
  );
});

describe("devspec coherence", () => {
  it(
    "reports drifts in --json mode with structured fields",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const r = await runCli(["coherence", "add-bookings", "--json"], root);
        // Drifts exist (fresh change has unfilled docs); exitCode == 0 because all warns only.
        const parsed = JSON.parse(r.stdout);
        expect(parsed.slug).toBe("add-bookings");
        expect(Array.isArray(parsed.drifts)).toBe(true);
        expect(parsed.warningCount).toBeGreaterThan(0);
      });
    }
  );

  it(
    "ignore comments suppress the matching rule",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const before = await runCli(
          ["coherence", "add-bookings", "--json"],
          root
        );
        const beforeReport = JSON.parse(before.stdout);
        const taskGranBefore = beforeReport.drifts.filter(
          (d: { rule: string }) => d.rule === "task-granularity"
        ).length;
        expect(taskGranBefore).toBeGreaterThan(0);

        const tasksFile = path.join(
          root,
          ".devspec",
          "projects",
          "add-bookings",
          "tasks.md"
        );
        const tasksMd = await fs.readFile(tasksFile, "utf8");
        await fs.writeFile(
          tasksFile,
          "<!-- devspec:ignore task-granularity -->\n" + tasksMd
        );

        const after = await runCli(
          ["coherence", "add-bookings", "--json"],
          root
        );
        const afterReport = JSON.parse(after.stdout);
        const taskGranAfter = afterReport.drifts.filter(
          (d: { rule: string }) => d.rule === "task-granularity"
        ).length;
        expect(taskGranAfter).toBe(0);
        expect(afterReport.ignoredRules).toContain("task-granularity");
      });
    }
  );

  it(
    "block-only mode exits non-zero only on blocking drift",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        // Fresh change has warnings but no blockers
        const r = await runCli(
          ["coherence", "add-bookings", "--block-only"],
          root
        );
        expect(r.exitCode).toBe(0);
      });
    }
  );
});
