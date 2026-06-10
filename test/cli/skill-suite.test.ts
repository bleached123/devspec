import path from "node:path";
import fs from "fs-extra";
import { describe, it, expect } from "vitest";
import { runCli, setupWorkspace, withTempWorkspace } from "./helpers.js";

const ALL_COMMANDS = [
  "iterate",
  "iterate-all",
  "review",
  "coordinate",
  "refresh-standards",
  "sync",
  "explore",
  "new",
  "continue",
  "verify",
  "archive",
  "onboard",
  "grill",
  "triage",
  "uat-design",
];

const ALL_SKILLS = [
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

describe("devspec skill suite (15 commands, 10 skills)", () => {
  it(
    "init lands all 15 commands under .claude/commands/devspec/",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        for (const verb of ALL_COMMANDS) {
          const p = path.join(root, ".claude", "commands", "devspec", `${verb}.md`);
          expect(await fs.pathExists(p), `missing devspec/${verb}.md`).toBe(true);
        }
      });
    }
  );

  it(
    "init lands all 10 skills under .claude/skills/",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        for (const skill of ALL_SKILLS) {
          const p = path.join(root, ".claude", "skills", skill, "SKILL.md");
          expect(await fs.pathExists(p), `missing skills/${skill}/SKILL.md`).toBe(true);
        }
      });
    }
  );

  it(
    "no flat-layout devspec-*.md files exist at the top level after init",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const cmdRoot = path.join(root, ".claude", "commands");
        const entries = await fs.readdir(cmdRoot);
        const legacyAtRoot = entries.filter((e) => /^devspec-[a-z]/.test(e));
        expect(legacyAtRoot).toEqual([]);
      });
    }
  );

  it(
    "each new skill's SKILL.md has a frontmatter name + description",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        for (const skillName of [
          "devspec-explore",
          "devspec-new",
          "devspec-continue",
          "devspec-verify",
          "devspec-archive",
        ]) {
          const p = path.join(root, ".claude", "skills", skillName, "SKILL.md");
          const content = await fs.readFile(p, "utf8");
          expect(content.startsWith("---"), `${skillName} missing frontmatter`).toBe(true);
          expect(content).toMatch(new RegExp(`name:\\s*${skillName}`));
          expect(content).toMatch(/description:/);
        }
      });
    }
  );

  it(
    "moved commands retain their content (iterate still has Ralph loop language)",
    { timeout: 60000 },
    async () => {
      await withTempWorkspace(async (root) => {
        await setupWorkspace(root);
        const iter = await fs.readFile(
          path.join(root, ".claude", "commands", "devspec", "iterate.md"),
          "utf8"
        );
        expect(iter).toContain("Ralph loop");
      });
    }
  );
});
