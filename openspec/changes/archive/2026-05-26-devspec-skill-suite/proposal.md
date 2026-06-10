## Why

DevSpec today exposes a mixed surface for Claude Code users: five slash commands (`/devspec-iterate`, `/devspec-iterate-all`, `/devspec-review`, `/devspec-coordinate`, `/devspec-refresh-standards`, plus `/devspec-sync` added in Slice 2 of delta-specs) cover specific high-leverage operations, and five skills (`devspec-onboard`, `devspec-grill`, `devspec-triage`, `devspec-uat-design`, `devspec-sync`) cover interactive workflows. The remaining lifecycle operations — exploring before a change, starting a new change, advancing to the next stage/scaffolding step, verifying coherence before archive, and closing out via archive — are available only via the `devspec` CLI. A user inside Claude Code cannot drive DevSpec end-to-end without context-switching to a terminal.

OpenSpec, which ships alongside DevSpec in this repo's `.claude/commands/opsx/`, has 1:1 slash-command coverage of its whole lifecycle (`/opsx:explore`, `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:apply`, `/opsx:verify`, `/opsx:archive`, `/opsx:sync`, `/opsx:onboard`, `/opsx:bulk-archive`). Reaching parity would let any agent or Claude Code user drive DevSpec entirely from slash commands. The user has explicitly identified this as the next concrete step: every DevSpec lifecycle action should be invokable as a slash command with the same explicit-execution model as OpenSpec.

In addition, four existing DevSpec skills (`devspec-onboard`, `devspec-grill`, `devspec-triage`, `devspec-uat-design`) lack matching slash commands — they auto-invoke based on description match but cannot be triggered explicitly. This change closes that gap too, and migrates all DevSpec commands to a namespaced layout (`.claude/commands/devspec/<verb>.md` → `/devspec:<verb>`) to mirror OpenSpec's `/opsx:<verb>` convention and reduce visual noise as the command count grows.

## What Changes

- **Five new skill+command pairs**, each invokable as `/devspec:<verb>`:
  - `/devspec:explore` — thinking-partner mode for DevSpec (pre-change ideation, lifecycle-aware exploration; mirrors `/opsx:explore`).
  - `/devspec:new` — start a new change (AI-driven interview replaces direct `devspec plan` invocation; asks for title + change type, runs `devspec plan`, optionally chains into `devspec-grill` for the discovery stage).
  - `/devspec:continue` — lifecycle router that figures out what's next for a change (unfilled stage → grill that stage; post-contract → scaffold; post-scaffold → suggest iterate) and acts on it.
  - `/devspec:verify` — at-the-end coherence gate; runs `devspec coherence <slug>` (per-change AND workspace-level after delta-specs-guards lands), reports cleanly, blocks archive if drift remains.
  - `/devspec:archive` — thin wrapper around `devspec archive <slug>` with precondition checks (stages all done, coherence clean, deltas synced or `--no-sync` justified), confirmation prompt, post-archive next-action hint.
- **Four new commands** for existing skill-only entries:
  - `/devspec:onboard`, `/devspec:grill`, `/devspec:triage`, `/devspec:uat-design` — each command file invokes the matching skill explicitly, parallel to how the existing five commands work.
- **Namespace layout**: all DevSpec command files live under `.claude/commands/devspec/<verb>.md`, exposed as `/devspec:<verb>`. The pre-existing commands (`iterate`, `iterate-all`, `review`, `coordinate`, `refresh-standards`) and the `devspec-sync` command added in Slice 1 use this layout from this slice onward.
- **`src/core/claude-assets.ts` updates**:
  - `DEVSPEC_COMMANDS` array entries are just verbs (e.g. `iterate`); the asset-sync routine writes them to `.claude/commands/devspec/<verb>.md`.
  - `DEVSPEC_SKILLS` array grows by five new skill directory names (`devspec-explore`, `devspec-new`, `devspec-continue`, `devspec-verify`, `devspec-archive`).
  - The sync logic in `syncClaudeAssets` reads from `.claude/commands/devspec/<verb>.md` in the package source and writes to the matching path in the workspace.
- **`devspec claude` regeneration**: re-running the command (without `--force`) preserves user-customized files via the existing skip-on-exists logic; with `--force`, overwrites the managed files.
- **Skill behaviour distinction**: the five new skills are AI-driven (interactive, structured questions, drafting output) for `explore`, `new`, `continue`, `verify`; `archive` is a thin wrapper with precondition checks because the operation itself is mechanical. Existing skills retain their behaviour.
- **No CLI changes**: `devspec plan`, `devspec advance`, `devspec scaffold`, `devspec coherence`, `devspec archive` continue to exist and behave identically. The new skills wrap them; they don't replace them.

## Capabilities

### New Capabilities

- `skill-suite`: the explicit-execution slash command + skill surface that lets Claude Code users drive every DevSpec lifecycle operation without leaving the editor. Covers the five new skill+command pairs, the four command counterparts, the namespaced subfolder layout, and the `claude-assets.ts` registration.

### Modified Capabilities

None. The skill suite is a distinct surface from the file/sync model in `capability-deltas` — it shares no requirements.

## Impact

**New source files**
- `.claude/skills/devspec-explore/SKILL.md`
- `.claude/skills/devspec-new/SKILL.md`
- `.claude/skills/devspec-continue/SKILL.md`
- `.claude/skills/devspec-verify/SKILL.md`
- `.claude/skills/devspec-archive/SKILL.md`
- `.claude/commands/devspec/explore.md`
- `.claude/commands/devspec/new.md`
- `.claude/commands/devspec/continue.md`
- `.claude/commands/devspec/verify.md`
- `.claude/commands/devspec/archive.md`
- `.claude/commands/devspec/onboard.md`
- `.claude/commands/devspec/grill.md`
- `.claude/commands/devspec/triage.md`
- `.claude/commands/devspec/uat-design.md`
- (`devspec/iterate.md`, `devspec/iterate-all.md`, `devspec/review.md`, `devspec/coordinate.md`, `devspec/refresh-standards.md`, `devspec/sync.md` — moved from flat layout)

**Modified source files**
- `src/core/claude-assets.ts` — update `DEVSPEC_COMMANDS` and `DEVSPEC_SKILLS` arrays; adjust file resolution for subfolder layout
- `src/commands/init.ts` — update slash-command references in user-facing output to `/devspec:<verb>` syntax
- `src/commands/claude.ts` (CLAUDE.md generator) — references to slash commands in the managed block use `/devspec:<verb>` syntax
- `src/commands/guide.ts`, `src/commands/worktree.ts`, `src/cli.ts` — same syntax update for user-facing slash-command references
- `src/packs/*/*/standards.md` — pack standards that reference `/devspec:refresh-standards` updated to the namespaced form
- `README.md` — every slash-command reference uses `/devspec:<verb>` form

**Test files**
- New: `test/cli/skill-suite.test.ts` — verify all 15 commands and 10 skills land in the right directories after `devspec init`
- Updated: `test/cli/claude-sync.test.ts` — `EXPECTED_COMMANDS` updates to use subfolder paths; `EXPECTED_SKILLS` grows by 5

**Pre-ship note**: DevSpec has not been published or shipped beyond local dogfooding, so no workspaces with an old flat-layout exist in the wild. The namespaced layout is the only layout the system has ever supported in distributed form. The `devspec` CLI itself (file commands like `devspec plan`, `devspec coherence`, etc.) is unchanged — only the Claude Code slash-command surface gets the namespace.

**Out of scope** (parked, separate work)
- VS Code extension delta-spec support (separate sibling-repo change — `vscode-extension-delta-support`).
- Pluggable pipeline axis refactor (`pluggable-pipeline-axis`, still parked).
- Skills beyond the five identified (e.g. `/devspec:bulk-archive`, `/devspec:sync-contract`, `/devspec:uat-verify`) — could be added in a follow-up if friction surfaces.
