import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("devspec status", () => {
  it(
    "reports an empty workspace with a hint",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const r = await runCli(["status"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toMatch(/No changes yet/);
      });
    }
  );

  it(
    "lists changes with phase line and per-change progress",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings", "Payment retries"] });
        const r = await runCli(["status"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("Workspace:");
        expect(r.stdout).toContain("sketch");
        expect(r.stdout).toContain("add-bookings");
        expect(r.stdout).toContain("payment-retries");
      });
    }
  );

  it(
    "--json emits structured workspace + changes",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const r = await runCli(["status", "--json"], root);
        expect(r.exitCode).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.phase.effective).toBe("sketch");
        expect(Array.isArray(parsed.changes)).toBe(true);
        expect(parsed.changes[0].slug).toBe("add-bookings");
        // The DDD methodology template ships with 2 starter tests
        expect(parsed.changes[0].totalTests).toBeGreaterThan(0);
        expect(parsed.changes[0].implementedTests).toBe(0);
      });
    }
  );

  it(
    "shows TESTS column when any change has tests defined",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Add bookings"] });
        const r = await runCli(["status"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("TESTS");
        // No tests implemented yet, so 0/<total>
        expect(r.stdout).toMatch(/0\/\d+/);
      });
    }
  );
});

describe("devspec phase", () => {
  it(
    "shows gates and 'to advance to ...' hint",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const r = await runCli(["phase"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("Workspace phase");
        expect(r.stdout).toContain("sketch");
        expect(r.stdout).toContain("To advance to");
      });
    }
  );

  it(
    "--set production enables strict mode",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const setR = await runCli(["phase", "--set", "production"], root);
        expect(setR.exitCode).toBe(0);
        expect(setR.stdout).toContain("declared as \"production\"");
        const showR = await runCli(["phase", "--json"], root);
        const parsed = JSON.parse(showR.stdout);
        expect(parsed.declared).toBe("production");
        expect(parsed.strict).toBe(true);
      });
    }
  );

  it(
    "--auto clears declaration",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await runCli(["phase", "--set", "production"], root);
        const clearR = await runCli(["phase", "--auto"], root);
        expect(clearR.exitCode).toBe(0);
        const parsed = JSON.parse((await runCli(["phase", "--json"], root)).stdout);
        expect(parsed.declared).toBeNull();
      });
    }
  );
});

describe("devspec doctor", () => {
  it(
    "reports missing workspace when run outside one",
    { timeout: 30000 },
    async () => {
      await withTempWorkspace(async (root) => {
        const r = await runCli(["doctor"], root);
        expect(r.exitCode).not.toBe(0);
        expect(r.stdout).toContain("workspace");
        expect(r.stdout).toContain("Run `devspec init");
      });
    }
  );

  it(
    "reports all green on a well-formed workspace",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        await runCli(["env", "generate"], root);
        const r = await runCli(["doctor"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain("All ");
        expect(r.stdout).toContain("checks passed");
      });
    }
  );
});
