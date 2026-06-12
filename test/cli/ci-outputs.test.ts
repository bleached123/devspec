import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

describe("devspec check --json", () => {
  it(
    "emits machine-readable results with exit-code semantics",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);

        // .vscode/settings.json is missing (env generate not run) → one FAIL
        const r = await runCli(["check", "--json"], root);
        expect(r.exitCode).toBe(1);

        const parsed = JSON.parse(r.stdout);
        expect(parsed.ok).toBe(false);
        expect(parsed.total).toBeGreaterThan(0);
        expect(parsed.failed).toBeGreaterThan(0);
        expect(Array.isArray(parsed.results)).toBe(true);
        const ids = parsed.results.map((x: { id: string }) => x.id);
        expect(ids).toContain("workspace");
        expect(ids).toContain("standards");

        // After env generate, everything passes and exit code is 0
        const gen = await runCli(["env", "generate"], root);
        expect(gen.exitCode).toBe(0);
        const r2 = await runCli(["check", "--json"], root);
        expect(r2.exitCode).toBe(0);
        expect(JSON.parse(r2.stdout).ok).toBe(true);
      });
    }
  );
});

describe("devspec plan --json", () => {
  it(
    "returns the created change as JSON, and errors as JSON too",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);

        const r = await runCli(["plan", "Add bookings flow", "--json"], root);
        expect(r.exitCode).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.ok).toBe(true);
        expect(parsed.slug).toBe("add-bookings-flow");
        expect(parsed.docs).toContain("contract.md");
        expect(parsed.stages.discovery).toBe("pending");

        // Duplicate slug → ok:false + exit 1, still valid JSON on stdout
        const r2 = await runCli(["plan", "Add bookings flow", "--json"], root);
        expect(r2.exitCode).toBe(1);
        expect(JSON.parse(r2.stdout).ok).toBe(false);
      });
    }
  );
});

describe("devspec coherence --sarif", () => {
  it(
    "writes a valid SARIF 2.1.0 file with one result per drift",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Test change"] });

        const r = await runCli(["coherence", "test-change", "--sarif"], root);
        expect(r.stdout).toContain("SARIF written to");

        const sarifPath = path.join(root, "devspec-coherence-test-change.sarif");
        const sarif = JSON.parse(await fs.readFile(sarifPath, "utf8"));
        expect(sarif.version).toBe("2.1.0");
        expect(sarif.runs).toHaveLength(1);
        expect(sarif.runs[0].tool.driver.name).toBe("devspec");
        // Rule metadata covers the built-in rules
        const ruleIds = sarif.runs[0].tool.driver.rules.map((x: { id: string }) => x.id);
        expect(ruleIds).toContain("contract-coverage");
        expect(ruleIds).toContain("requirement-conflict");
        // Every result is anchored to a doc in the change folder
        for (const result of sarif.runs[0].results) {
          expect(["error", "warning"]).toContain(result.level);
          expect(
            result.locations[0].physicalLocation.artifactLocation.uri
          ).toContain(".devspec/projects/test-change/");
        }
      });
    }
  );

  it(
    "honours an explicit file path",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Test change"] });

        const r = await runCli(
          ["coherence", "test-change", "--sarif", "out/findings.sarif"],
          root
        );
        expect(r.stdout).toContain("SARIF written to");
        expect(await fs.pathExists(path.join(root, "out", "findings.sarif"))).toBe(
          true
        );
      });
    }
  );
});
