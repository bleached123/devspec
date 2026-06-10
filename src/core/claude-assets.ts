import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Locate the `.claude/` source directory shipped with this DevSpec install.
 * Mirrors the strategy used by {@link packsRoot}:
 *   1. `<package-root>/.claude/` — works for `npm link`, `npm install -g`,
 *      and the dev tree (`src/core/claude-assets.ts` compiles to
 *      `dist/core/claude-assets.js`, two levels up is the repo root).
 *   2. `<repo>/.claude/` walking up from `src/`. Defensive fallback.
 * Returns the first match. If none exists, returns the first candidate so
 * callers can produce a clear "missing source" error.
 */
export function claudeAssetsRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", ".claude"),
    path.resolve(__dirname, "..", "..", "..", ".claude"),
  ];
  for (const c of candidates) {
    if (fs.pathExistsSync(c)) return c;
  }
  return candidates[0];
}

/**
 * Verbs of slash commands DevSpec ships into every workspace.
 * Layout on disk: `.claude/commands/devspec/<verb>.md`, exposed as `/devspec:<verb>`.
 */
const DEVSPEC_COMMANDS = [
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

/** Names of skills DevSpec ships into every workspace. */
const DEVSPEC_SKILLS = [
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

export interface SyncReport {
  commandsWritten: string[];
  commandsSkipped: string[];
  skillsWritten: string[];
  skillsSkipped: string[];
  sourceMissing: string[];
}

/**
 * Copy the DevSpec slash commands and skills into the user's workspace at
 * `<workspaceRoot>/.claude/commands/` and `<workspaceRoot>/.claude/skills/`.
 *
 * Files that already exist are skipped (so user modifications survive); pass
 * `{ overwrite: true }` to force-replace. Skill directories that exist are
 * also skipped wholesale unless `overwrite: true`.
 */
export async function syncClaudeAssets(
  workspaceRoot: string,
  options: { overwrite?: boolean } = {}
): Promise<SyncReport> {
  const overwrite = options.overwrite === true;
  const sourceRoot = claudeAssetsRoot();
  const report: SyncReport = {
    commandsWritten: [],
    commandsSkipped: [],
    skillsWritten: [],
    skillsSkipped: [],
    sourceMissing: [],
  };

  const targetCommandsDevspec = path.join(workspaceRoot, ".claude", "commands", "devspec");
  const targetSkills = path.join(workspaceRoot, ".claude", "skills");
  await fs.ensureDir(targetCommandsDevspec);
  await fs.ensureDir(targetSkills);

  for (const verb of DEVSPEC_COMMANDS) {
    const src = path.join(sourceRoot, "commands", "devspec", `${verb}.md`);
    const dest = path.join(targetCommandsDevspec, `${verb}.md`);
    if (!(await fs.pathExists(src))) {
      report.sourceMissing.push(`commands/devspec/${verb}.md`);
      continue;
    }
    if ((await fs.pathExists(dest)) && !overwrite) {
      report.commandsSkipped.push(`devspec/${verb}.md`);
      continue;
    }
    await fs.copy(src, dest, { overwrite: true });
    report.commandsWritten.push(`devspec/${verb}.md`);
  }

  for (const name of DEVSPEC_SKILLS) {
    const src = path.join(sourceRoot, "skills", name);
    const dest = path.join(targetSkills, name);
    if (!(await fs.pathExists(src))) {
      report.sourceMissing.push(`skills/${name}/`);
      continue;
    }
    if ((await fs.pathExists(dest)) && !overwrite) {
      report.skillsSkipped.push(`${name}/`);
      continue;
    }
    await fs.copy(src, dest, { overwrite: true });
    report.skillsWritten.push(`${name}/`);
  }

  return report;
}
