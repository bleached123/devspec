import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, withTempWorkspace, setupWorkspace } from "./helpers.js";

const EXPECTED_COMMANDS = [
  "devspec/iterate.md",
  "devspec/iterate-all.md",
  "devspec/review.md",
  "devspec/coordinate.md",
  "devspec/refresh-standards.md",
  "devspec/sync.md",
  "devspec/explore.md",
  "devspec/new.md",
  "devspec/continue.md",
  "devspec/verify.md",
  "devspec/archive.md",
  "devspec/onboard.md",
  "devspec/grill.md",
  "devspec/triage.md",
  "devspec/uat-design.md",
];

const EXPECTED_SKILLS = [
  "devspec-onboard",
  "devspec-grill",
  "devspec-triage",
  "devspec-uat-design",
  "devspec-sync",
  "devspec-explore",
  "devspec-new",
  "devspec-continue",
  "devspec-verify",
  "devspec-archive",
];

describe("devspec init/claude → .claude assets sync", () => {
  it(
    "init copies all DevSpec slash commands + skills into the workspace",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, {
          backend: "go",
          architecture: "clean-architecture",
          methodology: "tdd",
          pipeline: "github",
        });

        for (const name of EXPECTED_COMMANDS) {
          const p = path.join(root, ".claude", "commands", name);
          expect(await fs.pathExists(p), `missing ${name}`).toBe(true);
        }
        for (const skill of EXPECTED_SKILLS) {
          const p = path.join(root, ".claude", "skills", skill, "SKILL.md");
          expect(await fs.pathExists(p), `missing skills/${skill}/SKILL.md`).toBe(true);
        }
      });
    }
  );

  it(
    "skips already-present slash command files unless --force is passed",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go" });

        const target = path.join(root, ".claude", "commands", "devspec", "iterate.md");
        // User-customized content
        await fs.writeFile(target, "USER_CUSTOM_CONTENT\n");

        // Re-run claude without --force: user content survives
        const noForce = await runCli(["claude"], root);
        expect(noForce.exitCode).toBe(0);
        expect(noForce.stdout).toContain("Skipped");
        expect(await fs.readFile(target, "utf8")).toBe("USER_CUSTOM_CONTENT\n");

        // Re-run with --force: user content overwritten
        const force = await runCli(["claude", "--force"], root);
        expect(force.exitCode).toBe(0);
        expect(force.stdout).toMatch(/Wrote \d+ slash command/);
        const after = await fs.readFile(target, "utf8");
        expect(after).not.toBe("USER_CUSTOM_CONTENT\n");
        expect(after).toContain("DevSpec Ralph loop"); // canary from the real file
      });
    }
  );

  it(
    "--no-sync leaves .claude untouched",
    { timeout: 45000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root, { backend: "go" });
        // Remove a file so we can detect it isn't re-created
        const target = path.join(root, ".claude", "commands", "devspec", "review.md");
        await fs.remove(target);
        expect(await fs.pathExists(target)).toBe(false);

        const r = await runCli(["claude", "--no-sync"], root);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).not.toContain("Wrote");
        expect(await fs.pathExists(target)).toBe(false);
      });
    }
  );
});
