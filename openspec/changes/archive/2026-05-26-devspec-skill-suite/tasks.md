## 1. Source layout migration

- [x] 1.1 Create the new directory `.claude/commands/devspec/` in the DevSpec repo
- [x] 1.2 Move existing `.claude/commands/devspec-iterate.md` → `.claude/commands/devspec/iterate.md`
- [x] 1.3 Move `.claude/commands/devspec-iterate-all.md` → `.claude/commands/devspec/iterate-all.md`
- [x] 1.4 Move `.claude/commands/devspec-review.md` → `.claude/commands/devspec/review.md`
- [x] 1.5 Move `.claude/commands/devspec-coordinate.md` → `.claude/commands/devspec/coordinate.md`
- [x] 1.6 Move `.claude/commands/devspec-refresh-standards.md` → `.claude/commands/devspec/refresh-standards.md`
- [x] 1.7 Move `.claude/commands/devspec-sync.md` → `.claude/commands/devspec/sync.md`
- [x] 1.8 Update internal cross-references inside the moved files (e.g. the iterate command mentions `/devspec-review`; update to `/devspec:review`)
- [x] 1.9 Verify the moved files render correctly via `cat` or Read

## 2. New skill: devspec-explore

- [x] 2.1 Write `.claude/skills/devspec-explore/SKILL.md` — frontmatter with `name: devspec-explore` and a description matching auto-invocation triggers ("let me think about", "explore", "before I commit", `/devspec:explore`); body covers Step 0 detect state, Step 1 identify exploration shape (new change idea? lifecycle decision? architectural?), Step 2..N interactive guidance, final-step hand-off ("create the change with `/devspec:new`" / "no commits needed; continue exploring")
- [x] 2.2 Write `.claude/commands/devspec/explore.md` — frontmatter `description: Enter exploration mode for DevSpec — thinking partner before committing to a change`; body invokes the skill explicitly and accepts an optional topic argument
- [x] 2.3 Add `devspec-explore` to `DEVSPEC_SKILLS` and `explore` to `DEVSPEC_COMMANDS` in `src/core/claude-assets.ts`

## 3. New skill: devspec-new

- [x] 3.1 Write `.claude/skills/devspec-new/SKILL.md` — frontmatter with discovery cues ("start a new change", "new feature", `/devspec:new`); body Step 0 confirm workspace + check for walking-skeleton violation, Step 1 ask for title (interview, derive kebab slug), Step 2 ask for change type (feature/fix/refactor — affects what discovery questions grill will ask), Step 3 run `devspec plan <title>`, Step 4 offer to chain into `devspec-grill` for discovery stage
- [x] 3.2 Write `.claude/commands/devspec/new.md` — frontmatter description, body invokes the skill with the user's argument (title or empty); skill prompts if no title given
- [x] 3.3 Add `devspec-new` to `DEVSPEC_SKILLS` and `new` to `DEVSPEC_COMMANDS`

## 4. New skill: devspec-continue

- [x] 4.1 Write `.claude/skills/devspec-continue/SKILL.md` — frontmatter cues ("what's next", "continue", `/devspec:continue`); body Step 0 gather state (`devspec status --json`, list deltas if any), Step 1 route: (a) any unfilled stage → invoke `devspec-grill` for that stage; (b) contract done but no test stubs in source → run `devspec scaffold <slug>`; (c) scaffold done but tests not implemented → suggest `/devspec:iterate`; (d) all done → suggest `/devspec:verify`; Step N reflect and stop after one action
- [x] 4.2 Write `.claude/commands/devspec/continue.md` — frontmatter description, body invokes the skill with the change slug argument (or prompts if missing)
- [x] 4.3 Add `devspec-continue` to `DEVSPEC_SKILLS` and `continue` to `DEVSPEC_COMMANDS`

## 5. New skill: devspec-verify

- [x] 5.1 Write `.claude/skills/devspec-verify/SKILL.md` — frontmatter cues ("ready to archive", "verify", "any drift", `/devspec:verify`); body Step 0 receive slug argument or auto-pick the only-in-flight, Step 1 run `devspec coherence <slug> --json`, Step 2 report findings grouped by severity (block first, then warn); Step 3 if zero blocks AND zero warnings → suggest `/devspec:archive <slug>`; if blocks present → list with remediation hints, do NOT suggest archive
- [x] 5.2 Write `.claude/commands/devspec/verify.md` — frontmatter description, body invokes the skill
- [x] 5.3 Add `devspec-verify` to `DEVSPEC_SKILLS` and `verify` to `DEVSPEC_COMMANDS`

## 6. New skill: devspec-archive (thin wrapper)

- [x] 6.1 Write `.claude/skills/devspec-archive/SKILL.md` — frontmatter cues ("archive", "close out", "this change is done", `/devspec:archive`); body Step 0 receive slug or auto-pick single-active-change, Step 1 check preconditions (all stages done? coherence clean? deltas synced or willing to `--no-sync`?), Step 2 ask user to confirm — explicit prompt mentioning the change name and any pending deltas, Step 3 invoke `devspec archive <slug>` (with `--no-sync` if user explicitly chose to discard pending deltas), Step 4 report result + suggest next action
- [x] 6.2 Write `.claude/commands/devspec/archive.md` — frontmatter description, body invokes the skill
- [x] 6.3 Add `devspec-archive` to `DEVSPEC_SKILLS` and `archive` to `DEVSPEC_COMMANDS`

## 7. Command counterparts for existing skill-only entries

- [x] 7.1 Write `.claude/commands/devspec/onboard.md` — frontmatter description (mirror the `devspec-onboard` skill description); body explicitly invokes the skill (e.g. "Invoke the `devspec-onboard` skill.")
- [x] 7.2 Write `.claude/commands/devspec/grill.md` — frontmatter description, body invokes `devspec-grill` skill with the stage argument
- [x] 7.3 Write `.claude/commands/devspec/triage.md` — frontmatter description, body invokes `devspec-triage` skill
- [x] 7.4 Write `.claude/commands/devspec/uat-design.md` — frontmatter description, body invokes `devspec-uat-design` skill
- [x] 7.5 Add command entries (`onboard`, `grill`, `triage`, `uat-design`) to `DEVSPEC_COMMANDS` in `src/core/claude-assets.ts`

## 8. claude-assets.ts subfolder support

- [x] 8.1 Update `src/core/claude-assets.ts`:
  - Change `DEVSPEC_COMMANDS` entries from `devspec-<verb>` (or just `<verb>` — pick a representation; recommend storing just `<verb>`)
  - Update the resolution logic in `syncClaudeAssets` to read from `<sourceRoot>/commands/devspec/<verb>.md` and write to `<workspaceRoot>/.claude/commands/devspec/<verb>.md`
  - Ensure parent directory creation before writing
- [x] 8.2 Add `devspec-explore`, `devspec-new`, `devspec-continue`, `devspec-verify`, `devspec-archive` to `DEVSPEC_SKILLS`
- [x] 8.3 Existing skip-on-exists logic continues to work for the new subfolder layout (no changes needed beyond path resolution)

## 9. (removed — no legacy state to migrate)

DevSpec is pre-ship, so no workspaces with the old flat layout exist in the wild. The doctor migration hint and associated detection logic were removed during implementation; the new namespaced layout is the only layout that has ever existed in shipped DevSpec.

## 10. README and docs migration

- [x] 10.1 In `README.md`, replace every `/devspec-<verb>` reference with `/devspec:<verb>` (search-and-replace; ~30 occurrences expected including section anchors that reference command names)
- [x] 10.2 Update the README's "Project status" command-count section if it references command file counts (subfolder layout doesn't change the total but is worth confirming)
- [x] 10.3 Update `src/commands/claude.ts` (CLAUDE.md generator) — every `/devspec-<verb>` reference in the managed block becomes `/devspec:<verb>`
- [x] 10.4 Run `devspec claude` against this repo (if applicable) or simulate via the test workspace to confirm the regenerated CLAUDE.md uses the new syntax
- [x] 10.5 Update `src/packs/common/standards.md` if it references commands by name (search for `devspec-`)
- [x] 10.6 Update any internal references in skill markdown files (`.claude/skills/devspec-*/SKILL.md`) — these may reference each other or slash commands like `/devspec-sync` that need updating

## 11. Tests

- [x] 11.1 Update `test/cli/claude-sync.test.ts`:
  - `EXPECTED_COMMANDS` entries become e.g. `devspec/iterate.md` (subfolder path) rather than `devspec-iterate.md`
  - `EXPECTED_SKILLS` grows from 5 to 10 (add explore, new, continue, verify, archive)
- [x] 11.2 Write `test/cli/skill-suite.test.ts` — verify a fresh `devspec init` produces all 15 commands at `.claude/commands/devspec/<verb>.md` and all 10 skills at `.claude/skills/<skill-name>/SKILL.md`
- [x] 11.3 Run `npm run typecheck` and confirm zero errors
- [x] 11.4 Run the full vitest suite; expect existing tests to still pass and new tests to add coverage; total ≈ 220+ tests

## 12. Wiring + verification

- [x] 12.1 Verify each new SKILL.md is discovered by Claude Code (description appears in the available-skills list when the workspace is opened in Claude Code) — manual smoke check
- [x] 12.2 Verify each new slash command is invokable — `/devspec:explore`, `/devspec:new`, `/devspec:continue`, `/devspec:verify`, `/devspec:archive`, `/devspec:onboard`, `/devspec:grill`, `/devspec:triage`, `/devspec:uat-design`
- [x] 12.3 Self-dogfood (light): in the DevSpec repo (which uses OpenSpec workflow), invoke `/devspec:new test-change` against a throwaway tmp workspace to confirm the AI-driven new skill flow works end-to-end
- [x] 12.4 Confirm the old flat-layout files (`.claude/commands/devspec-*.md`) are deleted from the repo's own source — replaced by subfolder versions
- [x] 12.5 Confirm no references to `/devspec-<verb>` remain in any source file via grep

## 13. Stack readiness

- [x] 13.1 Update the relevant project-status section / changelog draft for the next DevSpec release noting the slash-command rename
- [x] 13.2 Confirm the change is OpenSpec-archive-ready (`/opsx:verify devspec-skill-suite` if invoked) — all artifacts complete, no drift between proposal/design/specs/tasks
