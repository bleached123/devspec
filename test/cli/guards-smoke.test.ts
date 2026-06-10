import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, setupWorkspace, withTempWorkspace } from "./helpers.js";

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

describe("delta-specs-guards end-to-end smoke", () => {
  it(
    "two changes modifying the same requirement surface requirement-conflict",
    { timeout: 120000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Change A", "Change B"] });
        await runCli(["specs", "init", "user-auth"], root);
        // Seed an existing requirement so MODIFIED is valid
        await fs.writeFile(
          path.join(root, ".devspec", "specs", "user-auth", "spec.md"),
          `# user-auth\n\n## Requirements\n\n### Requirement: Session storage\n\nbody\n`
        );
        await writeDelta(
          root,
          "change-a",
          "user-auth",
          `## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-a\n`
        );
        await writeDelta(
          root,
          "change-b",
          "user-auth",
          `## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-b\n`
        );

        const r = await runCli(["coherence", "change-a", "--json"], root);
        expect(r.exitCode).not.toBe(0); // block-severity → non-zero
        const report = JSON.parse(r.stdout);
        const conflict = report.drifts.find(
          (d: { rule: string }) => d.rule === "requirement-conflict"
        );
        expect(conflict).toBeDefined();
        expect(conflict.severity).toBe("block");
        expect(conflict.message).toContain("change-a");
        expect(conflict.message).toContain("change-b");
        expect(conflict.message).toContain("Session storage");
      });
    }
  );

  it(
    "single-change workspace fires per-change rules but not requirement-conflict",
    { timeout: 90000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Solo"] });
        // Orphan delta — capability doesn't exist
        await writeDelta(
          root,
          "solo",
          "ghost-cap",
          `## ADDED Requirements\n\n### Requirement: Login\n\nbody\n`
        );
        // Malformed delta in a real capability
        await runCli(["specs", "init", "user-auth"], root);
        await writeDelta(
          root,
          "solo",
          "user-auth",
          `## ADDDED Requirements\n\n### Requirement: Login\n\nbody\n`
        );

        const r = await runCli(["coherence", "solo", "--json"], root);
        const report = JSON.parse(r.stdout);
        const ruleNames = new Set(report.drifts.map((d: { rule: string }) => d.rule));

        // capability-exists fires for ghost-cap
        expect(ruleNames.has("capability-exists")).toBe(true);
        // delta-format fires for ADDDED typo
        expect(ruleNames.has("delta-format")).toBe(true);
        // requirement-conflict does NOT fire (single change)
        expect(ruleNames.has("requirement-conflict")).toBe(false);
      });
    }
  );

  it(
    "frontmatter mismatch triggers delta-capability-match",
    { timeout: 90000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Test"] });
        await runCli(["specs", "init", "user-auth"], root);
        await runCli(["specs", "init", "billing"], root);

        // Frontmatter declares user-auth AND billing, but only user-auth has a delta
        const contractPath = path.join(
          root,
          ".devspec",
          "projects",
          "test",
          "contract.md"
        );
        const original = await fs.readFile(contractPath, "utf8");
        const withFrontmatter = `---\ncapability:\n  - user-auth\n  - billing\n---\n\n${original}`;
        await fs.writeFile(contractPath, withFrontmatter);

        await writeDelta(
          root,
          "test",
          "user-auth",
          `## ADDED Requirements\n\n### Requirement: Login\n\nbody\n`
        );

        const r = await runCli(["coherence", "test", "--json"], root);
        const report = JSON.parse(r.stdout);
        const mismatch = report.drifts.find(
          (d: { rule: string; message: string }) =>
            d.rule === "delta-capability-match" && d.message.includes("billing")
        );
        expect(mismatch).toBeDefined();
      });
    }
  );

  it(
    "ignore marker suppresses requirement-conflict in one change",
    { timeout: 120000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { plan: ["Change A", "Change B"] });
        await runCli(["specs", "init", "user-auth"], root);
        await fs.writeFile(
          path.join(root, ".devspec", "specs", "user-auth", "spec.md"),
          `# user-auth\n\n## Requirements\n\n### Requirement: Session storage\n\nbody\n`
        );
        await writeDelta(
          root,
          "change-a",
          "user-auth",
          `## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-a\n`
        );
        await writeDelta(
          root,
          "change-b",
          "user-auth",
          `## MODIFIED Requirements\n\n### Requirement: Session storage\n\nbody-b\n`
        );

        // Add ignore marker in change-a's alignment.md
        const alignmentPath = path.join(
          root,
          ".devspec",
          "projects",
          "change-a",
          "alignment.md"
        );
        await fs.writeFile(
          alignmentPath,
          `<!-- devspec:ignore requirement-conflict -->\n\nIntentional: A and B coordinate on this.\n`
        );

        // Now coherence for change-a should NOT include the conflict, and
        // change-b should also not (since only change-a is left in the set)
        const rA = await runCli(["coherence", "change-a", "--json"], root);
        const reportA = JSON.parse(rA.stdout);
        const conflictA = reportA.drifts.find(
          (d: { rule: string }) => d.rule === "requirement-conflict"
        );
        expect(conflictA).toBeUndefined();
      });
    }
  );
});
