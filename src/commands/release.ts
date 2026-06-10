import path from "node:path";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import YAML from "yaml";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { nextStep } from "../core/hints.js";

const execFileAsync = promisify(execFile);

type Bump = "major" | "minor" | "patch";

interface CommitEntry {
  sha: string;
  subject: string;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  bump: Bump;
}

interface ReleaseConfig {
  conventionalCommits: boolean;
  tagFormat: string;
  autoPushTag: boolean;
}

export const releaseCommand = new Command("release")
  .description(
    "Cut a release — analyse conventional commits since the last tag, compute the next semver, write a changelog, tag, and (optionally) push"
  )
  .option(
    "--bump <kind>",
    "Override the computed bump (major | minor | patch). Skips commit analysis."
  )
  .option("--yes", "Skip the confirmation prompt", false)
  .option("--push", "Push the tag to origin after creating it (overrides config)", false)
  .option("--no-push", "Do not push the tag (overrides config)")
  .option("--dry-run", "Show what would happen without writing or tagging", false)
  .action(
    async (options: {
      bump?: string;
      yes: boolean;
      push: boolean;
      dryRun: boolean;
    }) => {
      const root = await requireWorkspaceRoot();
      const cfg = await loadReleaseConfig(root);

      // 1. Make sure git is here + tree is clean
      const gitOk = await gitAvailable(root);
      if (!gitOk) {
        console.error(chalk.red("Not a git repository, or git is not on PATH."));
        process.exitCode = 1;
        return;
      }
      if (!options.dryRun) {
        const dirty = await gitDirty(root);
        if (dirty) {
          console.error(
            chalk.red(
              "Working tree has uncommitted changes. Commit or stash before cutting a release."
            )
          );
          process.exitCode = 1;
          return;
        }
      }

      // 2. Find the last tag (or default to v0.0.0)
      const lastTag = await findLastTag(root, cfg.tagFormat);
      const currentVersion = lastTag ? parseVersion(lastTag, cfg.tagFormat) : "0.0.0";
      const range = lastTag ? `${lastTag}..HEAD` : "HEAD";

      // 3. Collect commits in the range
      const commits = await collectCommits(root, range);
      if (commits.length === 0) {
        console.log(chalk.yellow(`No commits since ${lastTag ?? "the beginning of the repo"}. Nothing to release.`));
        return;
      }

      // 4. Compute bump
      const computedBump = computeBump(commits);
      const bumpKind: Bump | null = options.bump
        ? (parseBumpFlag(options.bump) ?? null)
        : computedBump;
      if (!bumpKind) {
        console.log(
          chalk.yellow(
            `${commits.length} commit(s) since ${lastTag ?? "first commit"}, but none match the Conventional Commits spec (feat:, fix:, chore:, etc.).`
          )
        );
        console.log(
          chalk.dim(
            `Run with --bump <major|minor|patch> to release anyway, or use Conventional Commit messages going forward.`
          )
        );
        return;
      }

      const nextVersion = applyBump(currentVersion, bumpKind);
      const nextTag = cfg.tagFormat.replace("{version}", nextVersion);
      const changelog = buildChangelog(commits, nextVersion, nextTag);

      console.log(chalk.bold(`\nRelease ${chalk.cyan(nextTag)}`));
      console.log(
        `  ${currentVersion} → ${chalk.cyan(nextVersion)}  (${bumpKind} bump · ${commits.length} commit(s) since ${lastTag ?? "first commit"})`
      );
      console.log("");
      console.log(chalk.dim("Changelog preview:"));
      console.log("");
      for (const line of changelog.split("\n").slice(0, 30)) {
        console.log("  " + line);
      }
      if (changelog.split("\n").length > 30) {
        console.log(chalk.dim("  …"));
      }
      console.log("");

      if (options.dryRun) {
        console.log(chalk.dim("--dry-run: stopping before tagging."));
        return;
      }

      if (!options.yes) {
        const confirm = await promptYesNo(`Tag and create release ${nextTag}?`);
        if (!confirm) {
          console.log(chalk.dim("Aborted."));
          return;
        }
      }

      // 5. Write changelog to CHANGELOG.md (prepend to existing)
      await prependChangelog(root, changelog);

      // 6. Commit the changelog and create annotated tag
      await execFileAsync("git", ["add", "CHANGELOG.md"], { cwd: root });
      const hasChanges = await gitDirty(root);
      if (hasChanges) {
        await execFileAsync(
          "git",
          ["commit", "-m", `chore(release): ${nextTag}`],
          { cwd: root }
        );
      }
      await execFileAsync(
        "git",
        ["tag", "-a", nextTag, "-m", changelog],
        { cwd: root }
      );

      console.log(chalk.green(`✓ Tagged ${nextTag} and updated CHANGELOG.md`));

      // 7. Push if asked / configured
      const shouldPush = options.push || (cfg.autoPushTag && options.push !== false);
      if (shouldPush) {
        try {
          await execFileAsync("git", ["push", "--follow-tags"], { cwd: root });
          console.log(chalk.green(`✓ Pushed tag ${nextTag} to origin`));
          nextStep(
            `the release.yml workflow now picks up tag \`${nextTag}\` and deploys to production (after manual approval if configured)`
          );
        } catch (err) {
          console.error(
            chalk.yellow(`push failed: ${(err as Error).message}. Push manually with \`git push --follow-tags\`.`)
          );
        }
      } else {
        nextStep(`\`git push --follow-tags\` to ship the tag, then the release.yml workflow deploys to production`);
      }
    }
  );

// ─── helpers ───────────────────────────────────────────────────────────────

async function loadReleaseConfig(root: string): Promise<ReleaseConfig> {
  const cfgPath = devspecPath(root, "release.yaml");
  if (!(await fs.pathExists(cfgPath))) {
    return {
      conventionalCommits: true,
      tagFormat: "v{version}",
      autoPushTag: false,
    };
  }
  try {
    const parsed = (YAML.parse(await fs.readFile(cfgPath, "utf8")) ?? {}) as Record<string, unknown>;
    const release = (parsed.release ?? {}) as Record<string, unknown>;
    return {
      conventionalCommits: release.conventional_commits !== false,
      tagFormat: typeof release.tag_format === "string" ? release.tag_format : "v{version}",
      autoPushTag: release.auto_push_tag === true,
    };
  } catch {
    return { conventionalCommits: true, tagFormat: "v{version}", autoPushTag: false };
  }
}

async function gitAvailable(root: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

async function gitDirty(root: string): Promise<boolean> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: root });
  return stdout.trim().length > 0;
}

async function findLastTag(root: string, tagFormat: string): Promise<string | null> {
  // We accept any tag matching the format prefix (everything before {version}).
  const prefix = tagFormat.split("{version}")[0];
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["describe", "--tags", "--abbrev=0", "--match", `${prefix}*`],
      { cwd: root }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseVersion(tag: string, tagFormat: string): string {
  const prefix = tagFormat.split("{version}")[0];
  return tag.startsWith(prefix) ? tag.slice(prefix.length) : tag;
}

interface RawCommit {
  sha: string;
  subject: string;
}

async function collectCommits(root: string, range: string): Promise<CommitEntry[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["log", "--pretty=format:%H%x09%s", range],
    { cwd: root }
  );
  const raw: RawCommit[] = stdout
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => {
      const [sha, ...rest] = l.split("\t");
      return { sha, subject: rest.join("\t") };
    });
  return raw.map((c) => classifyCommit(c));
}

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

function classifyCommit(raw: RawCommit): CommitEntry {
  const m = CONVENTIONAL.exec(raw.subject);
  if (!m) {
    return {
      sha: raw.sha,
      subject: raw.subject,
      type: null,
      scope: null,
      breaking: false,
      bump: "patch",
    };
  }
  const type = m[1].toLowerCase();
  const scope = m[2] ?? null;
  const bangBreaking = Boolean(m[3]);
  const breaking = bangBreaking; // BREAKING CHANGE: footers would need full body — left out for v1
  let bump: Bump = "patch";
  if (breaking) bump = "major";
  else if (type === "feat") bump = "minor";
  else if (type === "fix" || type === "perf") bump = "patch";
  else bump = "patch";
  return {
    sha: raw.sha,
    subject: raw.subject,
    type,
    scope,
    breaking,
    bump,
  };
}

function computeBump(commits: CommitEntry[]): Bump | null {
  const conventional = commits.filter((c) => c.type !== null);
  if (conventional.length === 0) return null;
  if (conventional.some((c) => c.bump === "major")) return "major";
  if (conventional.some((c) => c.bump === "minor")) return "minor";
  return "patch";
}

function parseBumpFlag(s: string): Bump | undefined {
  const v = s.toLowerCase();
  if (v === "major" || v === "minor" || v === "patch") return v;
  return undefined;
}

function applyBump(current: string, bump: Bump): string {
  const [maj, min, pat] = current.split(".").map((p) => parseInt(p, 10) || 0);
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function buildChangelog(commits: CommitEntry[], version: string, tag: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const groups: Record<string, CommitEntry[]> = {
    "Breaking changes": [],
    "Features": [],
    "Fixes": [],
    "Performance": [],
    "Other": [],
  };
  for (const c of commits) {
    if (c.breaking) groups["Breaking changes"].push(c);
    else if (c.type === "feat") groups["Features"].push(c);
    else if (c.type === "fix") groups["Fixes"].push(c);
    else if (c.type === "perf") groups["Performance"].push(c);
    else groups["Other"].push(c);
  }
  const out: string[] = [];
  out.push(`## ${tag} — ${today}`);
  out.push("");
  for (const [name, entries] of Object.entries(groups)) {
    if (entries.length === 0) continue;
    out.push(`### ${name}`);
    out.push("");
    for (const e of entries) {
      const scope = e.scope ? `**${e.scope}**: ` : "";
      const subject = e.type
        ? e.subject.replace(CONVENTIONAL, (_, _t, _s, _b, msg) => msg)
        : e.subject;
      out.push(`- ${scope}${subject}  (\`${e.sha.slice(0, 7)}\`)`);
    }
    out.push("");
  }
  return out.join("\n").trim() + "\n";
}

async function prependChangelog(root: string, entry: string): Promise<void> {
  const p = path.join(root, "CHANGELOG.md");
  let existing = "";
  if (await fs.pathExists(p)) {
    existing = await fs.readFile(p, "utf8");
  } else {
    existing = `# Changelog\n\nAll notable changes to this project are documented here.\n\n`;
  }
  // Insert the new entry just before the first `## ` heading (which is the
  // previous release entry). If there isn't one yet, append after the
  // intro paragraph.
  const h2Match = /^##\s/m.exec(existing);
  if (h2Match) {
    const idx = h2Match.index;
    await fs.writeFile(p, existing.slice(0, idx) + entry + "\n" + existing.slice(idx));
  } else {
    await fs.writeFile(p, existing.replace(/\n*$/, "\n\n") + entry);
  }
}

async function promptYesNo(question: string): Promise<boolean> {
  // Non-TTY (CI / piped) — default to no for safety.
  if (!process.stdin.isTTY) return false;
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
