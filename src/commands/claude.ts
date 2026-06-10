import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import { requireWorkspaceRoot, devspecPath } from "../core/workspace.js";
import { loadWorkspaceState, testsInSourceCount, type WorkspaceState } from "../core/phase.js";
import { LIFECYCLE_STAGES, PHASES } from "../core/coherence/types.js";
import { syncClaudeAssets } from "../core/claude-assets.js";

const MARK_START = "<!-- devspec:claude:start -->";
const MARK_END = "<!-- devspec:claude:end -->";

export const claudeCommand = new Command("claude")
  .description(
    "Generate or update CLAUDE.md with a DevSpec-managed context block, and sync .claude/ slash commands + skills into the workspace"
  )
  .option("--path <file>", "Output path for CLAUDE.md (default: CLAUDE.md at workspace root)")
  .option("--print", "Print the managed block to stdout instead of writing", false)
  .option("--no-sync", "Skip copying .claude/ slash commands and skills into the workspace")
  .option(
    "--force",
    "Overwrite existing .claude/ slash commands and skills (default: skip files that already exist)",
    false
  )
  .action(
    async (options: { path?: string; print: boolean; sync: boolean; force: boolean }) => {
      const root = await requireWorkspaceRoot();
      const workspace = await loadWorkspaceState(root);
      const standards = await readStandards(root);
      const managed = renderManagedBlock(workspace, standards);

      if (options.print) {
        process.stdout.write(managed);
        return;
      }

      const result = await writeClaudeMd(root, options.path, managed);
      const rel = path.relative(root, result.target) || result.target;
      if (result.outcome === "created") {
        console.log(chalk.green(`Created ${rel}`));
      } else if (result.outcome === "updated") {
        console.log(chalk.green(`Updated DevSpec block in ${rel}`));
      } else {
        console.log(chalk.green(`Appended DevSpec block to ${rel}`));
      }

      // Sync .claude/ assets unless the user explicitly opted out. Default-on
      // matches user expectation: "claude" command should make the workspace
      // fully Claude-ready, not just write one file.
      if (options.sync !== false) {
        const sync = await syncClaudeAssets(root, { overwrite: options.force });
        if (sync.commandsWritten.length > 0) {
          console.log(
            chalk.green(
              `Wrote ${sync.commandsWritten.length} slash command(s) to .claude/commands/`
            )
          );
        }
        if (sync.skillsWritten.length > 0) {
          console.log(
            chalk.green(`Wrote ${sync.skillsWritten.length} skill(s) to .claude/skills/`)
          );
        }
        const skipped = sync.commandsSkipped.length + sync.skillsSkipped.length;
        if (skipped > 0) {
          console.log(
            chalk.dim(
              `Skipped ${skipped} existing file(s); pass --force to overwrite.`
            )
          );
        }
        if (sync.sourceMissing.length > 0) {
          console.warn(
            chalk.yellow(`warn: missing in package: ${sync.sourceMissing.join(", ")}`)
          );
        }
      }

      console.log(
        chalk.dim(
          "Re-run `devspec claude` whenever workspace state changes — only the managed block is rewritten."
        )
      );
    }
  );

/**
 * Generate CLAUDE.md for the workspace at `root`. Used by `devspec claude`
 * and called automatically at the end of `devspec init`.
 */
export async function generateClaudeMd(root: string): Promise<{
  outcome: "created" | "updated" | "appended";
  target: string;
}> {
  const workspace = await loadWorkspaceState(root);
  const standards = await readStandards(root);
  const managed = renderManagedBlock(workspace, standards);
  return writeClaudeMd(root, undefined, managed);
}

async function writeClaudeMd(
  root: string,
  outputPath: string | undefined,
  managed: string
): Promise<{ outcome: "created" | "updated" | "appended"; target: string }> {
  const target = outputPath
    ? path.resolve(root, outputPath)
    : path.join(root, "CLAUDE.md");
  const existing = (await fs.pathExists(target))
    ? await fs.readFile(target, "utf8")
    : null;
  const updated = mergeIntoFile(existing, managed);
  await fs.writeFile(target, updated);
  if (existing === null) return { outcome: "created", target };
  if (existing.includes(MARK_START)) return { outcome: "updated", target };
  return { outcome: "appended", target };
}

async function readStandards(root: string): Promise<string> {
  const file = devspecPath(root, "standards", "standards.md");
  if (!(await fs.pathExists(file))) return "";
  return (await fs.readFile(file, "utf8")).trim();
}

function renderManagedBlock(workspace: WorkspaceState, standards: string): string {
  const { config, effectivePhase, detectedPhase, declaredPhase, strict, gates } = workspace;
  const active = workspace.changes.filter((c) => !c.status.archived);

  const lines: string[] = [];
  lines.push(MARK_START);
  lines.push("");
  lines.push("# DevSpec context");
  lines.push("");
  lines.push(
    "_This block is auto-generated by `devspec claude`. Edit outside the markers; content inside will be overwritten on re-run._"
  );
  lines.push("");
  lines.push(
    "_Subagents spawned by `/devspec:iterate` and `/devspec:review` inherit this content. They are instructed not to re-read `standards.md` because it is already inlined below — keep this file up to date with `devspec claude` to ensure subagents always see current standards._"
  );
  lines.push("");

  lines.push("## Project shape");
  lines.push("");
  lines.push(`- **Backend:** \`${config.backend}\``);
  if (config.frontend) lines.push(`- **Frontend:** \`${config.frontend}\``);
  lines.push(`- **Architecture:** \`${config.architecture}\``);
  lines.push(`- **Methodology:** \`${config.methodology}\``);
  if (config.infrastructure) lines.push(`- **Infrastructure:** \`${config.infrastructure}\``);
  lines.push("");

  lines.push("## Current phase");
  lines.push("");
  lines.push(`- **Effective:** \`${effectivePhase}\`${strict ? " (strict mode — warnings escalate to blocks)" : ""}`);
  if (declaredPhase) {
    lines.push(`- **Declared (in devspec.yaml):** \`${declaredPhase}\``);
    lines.push(`- **Auto-detected:** \`${detectedPhase}\``);
  } else {
    lines.push(`- Auto-detected from workspace state. Override with \`devspec phase --set <phase>\`.`);
  }
  const reachedCount = gates.filter((g) => g.satisfied).length;
  lines.push(
    `- **Gates satisfied:** ${reachedCount} / ${PHASES.length}  (lifecycle: ${PHASES.join(" → ")})`
  );
  const nextGate = gates.find((g) => !g.satisfied);
  if (nextGate) {
    lines.push(`- **To advance to \`${nextGate.phase}\`:** ${nextGate.missing.join("; ")}`);
  }
  lines.push("");

  if (active.length === 0) {
    lines.push("## Active changes");
    lines.push("");
    lines.push("_No active changes. Use `devspec plan \"<title>\"` to start one._");
    lines.push("");
  } else {
    lines.push("## Active changes");
    lines.push("");
    for (const c of active) {
      const doneCount = LIFECYCLE_STAGES.filter((s) => c.status.stages[s] === "done").length;
      const blocking = workspace.changeBlocking.get(c.slug) ?? 0;
      const warning = workspace.changeWarning.get(c.slug) ?? 0;
      const testCounts = testsInSourceCount(c);
      const driftSummary =
        blocking > 0
          ? `**${blocking} blocking**, ${warning} warning`
          : warning > 0
            ? `${warning} warning`
            : "clean";
      lines.push(
        `- **${c.slug}** — ${doneCount}/${LIFECYCLE_STAGES.length} stages, ${driftSummary}` +
          (c.tests.length > 0
            ? ` · tests: ${testCounts.found}/${c.tests.length} in source (${testCounts.stubbed} stubbed)`
            : "")
      );
    }
    lines.push("");
    lines.push("To work on a change, read its `.devspec/projects/<slug>/contract.md` first.");
    lines.push("");
  }

  if (standards) {
    lines.push("## Engineering standards");
    lines.push("");
    lines.push("These are the rules for code in this workspace. Apply them when implementing.");
    lines.push("");
    lines.push(standards);
    lines.push("");
  }

  lines.push("## How to work in this repo");
  lines.push("");
  lines.push("**What each artefact is for:**");
  lines.push("");
  lines.push("- `contract.md` (the ```yaml tests block) is the source of truth for what to build. Each test entry becomes a failing function in source.");
  lines.push("- `tasks.md` is for work that is NOT a contract test: docs, migrations, deployment, configuration, coordination. If you can write it as a test, it goes in contract.md instead.");
  lines.push("- Source code implements what the contract specifies.");
  lines.push("");
  lines.push("**Run language commands via `devspec run`.** When you need to invoke `cargo test`, `dotnet build`, `pytest`, `npm test`, or any other language-specific command, call it as `devspec run <cmd>`. If the workspace has a Dockerfile + docker-compose.yml (generated by `devspec env generate`), the command runs in a container; otherwise it falls back to local execution. This eliminates \"works on my machine\" issues between agent iterations.");
  lines.push("");
  lines.push("When implementing or modifying code:");
  lines.push("");
  lines.push("1. Read `.devspec/projects/<slug>/contract.md` — the API surface and test list");
  lines.push("2. Read `.devspec/projects/<slug>/design.md` — the high-level approach");
  lines.push("3. Use the standards above for naming, layering, file size, error handling");
  lines.push("4. Implement just enough source to make ONE failing test pass — do not refactor unrelated code");
  lines.push("5. Run `devspec check` and `devspec coherence <slug>` before claiming a task is done");
  lines.push("");
  lines.push("Forbidden actions:");
  lines.push("");
  lines.push("- Do NOT modify any spec doc (`discovery.md`, `proposal.md`, `design.md`, `contract.md`, `alignment.md`) unless explicitly asked");
  lines.push("- Do NOT edit the ` ```yaml tests ` block inside `contract.md`");
  lines.push("- Do NOT delete or rename scaffolded test functions (use `devspec sync-contract` for renames)");
  lines.push("- Do NOT skip `devspec check` verification");
  lines.push("");

  lines.push("## Capability specs (v1)");
  lines.push("");
  lines.push("Workspaces maintain **living capability specs** at `.devspec/specs/<capability>/spec.md` — one file per capability (e.g. `user-auth`, `billing`). Each is the accumulated truth of what the system promises for that capability.");
  lines.push("");
  lines.push("Per-change deltas live at `.devspec/projects/<slug>/deltas/<capability>/spec.md` using these block headers:");
  lines.push("");
  lines.push("- `## ADDED Requirements` — append new requirements");
  lines.push("- `## MODIFIED Requirements` — replace existing requirement body (heading must match exactly)");
  lines.push("- `## REMOVED Requirements` — delete an existing requirement");
  lines.push("");
  lines.push("Each requirement: `### Requirement: <name>` followed by a SHALL/MUST body, with at least one `#### Scenario: <name>` (WHEN/THEN) for testability.");
  lines.push("");
  lines.push("When working on a change:");
  lines.push("");
  lines.push("- If `contract.md` has `capability:` frontmatter, the change deltas those capabilities — write `deltas/<name>/spec.md`.");
  lines.push("- Use `devspec specs init <name>` before referencing a new capability (strict resolution: typos fail loudly).");
  lines.push("- Use `devspec specs delta <slug> <name>` to scaffold a delta file.");
  lines.push("- Use `devspec specs sync <slug> --dry-run` to preview the merge before applying.");
  lines.push("- `devspec archive <slug>` auto-syncs any pending deltas; `--no-sync` skips merge.");
  lines.push("");
  lines.push("Coherence rules that catch silent failures: `capability-exists`, `delta-format`, `delta-capability-match`, and the workspace-level `requirement-conflict` (block-severity cross-change collision). Review them via `devspec coherence <slug>`.");
  lines.push("");
  lines.push("When reviewing implementation, the **merged-preview** of a capability spec (via `devspec specs sync <slug> --dry-run --json`) is the source of truth for \"what the capability promises post-change\" — NOT the pre-merge file.");
  lines.push("");

  lines.push("## Useful commands");
  lines.push("");
  lines.push("```");
  lines.push("devspec run <cmd>               # run any command in the workspace container");
  lines.push("devspec status                  # all changes + workspace phase line");
  lines.push("devspec phase                   # phase detail with gates");
  lines.push("devspec coherence <slug>        # drift check for one change");
  lines.push("devspec next <slug>             # first unchecked task");
  lines.push("devspec complete <slug> <text>  # mark a task done");
  lines.push("devspec scaffold <slug>         # emit failing test stubs");
  lines.push("devspec sync-contract <slug>    # reflect implementation renames back");
  lines.push("devspec check                   # workspace + architecture guardrails");
  lines.push("devspec doctor                  # diagnose setup problems");
  lines.push("devspec guide                   # full mental model");
  lines.push("```");
  lines.push("");

  lines.push("For autonomous iteration in Claude Code:");
  lines.push("");
  lines.push("```");
  lines.push("/loop /devspec:iterate <slug>          # implement + review in tight loop, ONE change");
  lines.push("/loop /devspec:iterate-all [slugs]     # rotate across multiple changes (fair, single-window)");
  lines.push("/devspec:review <slug>                 # standalone PR review (fresh subagent)");
  lines.push("/devspec:coordinate [slugs]            # cross-change conflict detection");
  lines.push("/devspec:refresh-standards <fragment>  # refresh pack to current language/security state");
  lines.push("```");
  lines.push("");
  lines.push("Three ways to run the Ralph loop across multiple changes:");
  lines.push("- **Sequential rotation** — `/loop /devspec:iterate-all` cycles through active changes one per iteration, picking the least-recently-iterated. Single window, no file conflicts, predictable.");
  lines.push("- **Parallel agents in shared working tree** — one Claude Code window per change, all in the main checkout. Fastest wall-clock, risks file conflicts on shared infrastructure (`Cargo.toml`, `lib.rs`, migrations). Run `/devspec:coordinate` periodically.");
  lines.push("- **Parallel agents in isolated git worktrees** — `devspec worktree add <slug>` creates `.devspec/worktrees/<slug>/` on branch `devspec/<slug>`. Each agent runs in its own worktree, completely isolated from the others — no file conflicts possible. Merge back with `git merge devspec/<slug>` when the change's stages are all done. This is the cleanest design for serious parallel work.");
  lines.push("");
  lines.push("**Skills available** (invoke conversationally — no slash needed):");
  lines.push("- `devspec-onboard` — first-time walkthrough; picks axes interactively, runs init + env generate, plans the first change");
  lines.push("- `devspec-grill <slug> [stage]` — stage-aware interview that drafts a lifecycle doc and writes it on confirmation");
  lines.push("- `devspec-uat-design` — elicits user-observable, manually-validatable UAT criteria before declaring `phase: production`");
  lines.push("- `devspec-triage` — walks coherence findings one at a time, decides fix/suppress/defer per finding with logged reasons");
  lines.push("");
  lines.push("**Multiple changes in flight?** Run `/devspec:coordinate` to catch cross-change conflicts: shared files, API overlap, domain collisions, test contradictions, dependencies. The coordinator subagent reads each active change's contract + design + source map, surfaces conflicts with severity, and escalates blocking ones via `AskUserQuestion`. Especially important before declaring `phase --set production`, and continuously via `/loop /devspec:coordinate` when parallel Ralph loops run per-change.");
  lines.push("");
  lines.push("");
  lines.push("Each iteration of `/devspec:iterate` spawns TWO subagents in sequence:");
  lines.push("an **implementer** (writes code to make one failing test pass) and a **reviewer** ");
  lines.push("(reads spec + design + standards + the change, returns PR-style comments). The reviewer ");
  lines.push("has zero memory of how the implementer reasoned — pure separation of concerns. ");
  lines.push("Block-severity review comments escalate to the user via question.");
  lines.push("");

  lines.push(MARK_END);
  return lines.join("\n");
}

function mergeIntoFile(existing: string | null, managed: string): string {
  if (existing === null || existing.trim().length === 0) {
    return `# Project notes\n\n${managed}\n`;
  }
  const startIdx = existing.indexOf(MARK_START);
  const endIdx = existing.indexOf(MARK_END);
  if (startIdx >= 0 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + MARK_END.length);
    return `${before}${managed}${after}`;
  }
  // No markers — append
  return existing.trimEnd() + `\n\n${managed}\n`;
}
