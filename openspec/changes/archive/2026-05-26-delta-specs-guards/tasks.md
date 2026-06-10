## 1. Workspace rule architecture

- [x] 1.1 Add `WorkspaceContext`, `WorkspaceDrift`, and `WorkspaceRule` types to `src/core/coherence/types.ts` (WorkspaceContext exposes root, activeSlugs, and a loadChangeState function; WorkspaceDrift extends Drift with a `slugs: string[]` field)
- [x] 1.2 Add `runWorkspaceCoherence(root, opts)` to `src/core/coherence/runner.ts` that loads workspace context, invokes registered workspace rules, and returns aggregated `WorkspaceDrift[]`
- [x] 1.3 Implement workspace-rule suppression: collect ignored rules from each affected change's docs (existing `collectIgnoredRules`), drop a change from a drift's `slugs` if it suppresses the rule, drop the drift entirely if fewer than two unsuppressed slugs remain (configurable for rules that fire on a single slug)
- [x] 1.4 Add `BUILTIN_WORKSPACE_RULES` export alongside `BUILTIN_RULES`
- [x] 1.5 Vitest unit tests in `test/coherence/workspace-runner.test.ts`: registered rules invoked once with correct context, drifts include affected slugs, suppression collapses correctly when one or all changes suppress

## 2. Coherence rule: capability-exists

- [x] 2.1 Implement `src/core/coherence/rules/capability-exists.ts` — per-change rule that lists `deltas/` subdirectories via `listDeltas`, checks each capability's main spec exists via `capabilitySpecPath`, emits warn-severity drift per orphan with remediation hint
- [x] 2.2 Register in `BUILTIN_RULES` in `src/core/coherence/runner.ts`
- [x] 2.3 Tests in `test/coherence/capability-exists.test.ts`: orphan flagged, no deltas no findings, ignore marker suppresses

## 3. Coherence rule: delta-format

- [x] 3.1 Implement `src/core/coherence/rules/delta-format.ts`:
  - strip HTML comments (`<!-- ... -->`) before parsing to ignore commented-out scaffolds
  - detect malformed `## ... Requirements` headers (anything matching `^## \S+ Requirements$` whose label isn't `ADDED`/`MODIFIED`/`REMOVED`)
  - detect `### Requirement:` headings outside any recognised block
  - detect empty bodies (whitespace-only) in `ADDED` and `MODIFIED` requirements (REMOVED allowed empty)
  - detect duplicate `### Requirement: <name>` within the same block of the same file
- [x] 3.2 Register in `BUILTIN_RULES`
- [x] 3.3 Tests in `test/coherence/delta-format.test.ts`: each finding type triggers, HTML comments ignored, production-phase strict escalation works via existing `strict: true` path

## 4. Coherence rule: delta-capability-match

- [x] 4.1 Implement `src/core/coherence/rules/delta-capability-match.ts` — read `contract.md` via `readContractCapabilities`, list `deltas/` subdirectories, emit warn-severity drift for declared-but-missing and undeclared-but-present mismatches; early-return when frontmatter is absent
- [x] 4.2 Register in `BUILTIN_RULES`
- [x] 4.3 Tests in `test/coherence/delta-capability-match.test.ts`: missing delta for declared cap, extra delta not declared, no frontmatter no findings

## 5. Coherence rule: requirement-conflict (workspace-level)

- [x] 5.1 Implement `src/core/coherence/rules/requirement-conflict.ts` as a `WorkspaceRule`:
  - for each active slug, list pending deltas and parse each delta file's ADDED/MODIFIED/REMOVED entries
  - build a map `(capability, requirement-name)` → `[(slug, operation)]`
  - emit block-severity workspace drift per tuple with ≥2 entries, conflict-kind label (`add-add`, `modify-modify`, `modify-remove`, `remove-remove`)
- [x] 5.2 Register in `BUILTIN_WORKSPACE_RULES`
- [x] 5.3 Update `src/commands/coherence.ts` to also run workspace rules and merge findings; per-slug invocation filters workspace drifts to those naming the slug
- [x] 5.4 Update `src/commands/check.ts` to surface workspace findings in workspace-wide reports
- [x] 5.5 Tests in `test/coherence/requirement-conflict.test.ts`: each conflict kind (modify-modify, modify-remove, remove-remove, add-add) detected; different-requirements no finding; ignore marker in one change excludes it from the set; single-change-after-suppression drops the finding

## 6. Reviewer subagent capability awareness

- [x] 6.1 Update `.claude/skills/devspec-review/SKILL.md` — add "Capability-spec awareness" section in Required reads instructing the reviewer subagent to run `devspec specs sync <SLUG> --dry-run --json` when `deltas/` exists, read each capability's `preview` field as source of truth, short-circuit with a block-severity finding if validation returns errors
- [x] 6.2 Update `.claude/commands/devspec-review.md` reviewer prompt to mirror the SKILL.md addition
- [x] 6.3 Update `.claude/commands/devspec-iterate.md` reviewer step to inherit the same capability-awareness instruction
- [x] 6.4 Re-run existing `test/cli/claude-sync.test.ts` to verify the updated skill content propagates into workspaces on init/sync

## 7. devspec map L1.5 capability layer

- [x] 7.1 Add capability index generator in `src/commands/map.ts` — write `.devspec/maps/capabilities/index.md` with Mermaid graph of (change → capability) edges, requirements table per capability, drill-down links
- [x] 7.2 Add per-capability drill-down generator — write `.devspec/maps/capabilities/<cap>.md` containing current requirements list with source links, active changes table with pending +N ~M -K counts, archived contributors with timestamps from `.devspec/archive/<slug>/deltas/<cap>/spec.md.synced` mtime
- [x] 7.3 Update L0 workspace map (`maps/workspace.md`) — add a "Capabilities" section linking to `capabilities/index.md` when any capability exists; omit section entirely when none exist
- [x] 7.4 Extend `devspec map --watch` watcher glob to include `.devspec/specs/**` and `.devspec/projects/*/deltas/**`; on change, regenerate only the affected `capabilities/<cap>.md` and `capabilities/index.md`
- [x] 7.5 Tests in `test/cli/map-capabilities.test.ts`: index includes all capabilities, drill-down lists current requirements, drill-down lists active changes with correct delta counts, drill-down lists archived contributors, no `capabilities/` directory when no capabilities exist
- [x] 7.6 Verify watch test (existing `test/cli/map.test.ts` likely has a watch test) — extend to assert delta-edit triggers regeneration

## 8. /devspec-coordinate capability scan

- [x] 8.1 Update `.claude/skills/devspec-coordinate/SKILL.md` — add "Capability-delta scan" section instructing the coordinator to query `devspec specs status <slug> --json` per active change, group by `(capability, requirement-name)`, surface conflicts under category `capability-conflict` with severity `block` and resolution proposal (rebase the later change)
- [x] 8.2 Update `.claude/commands/devspec-coordinate.md` if it duplicates skill content
- [x] 8.3 Add a regression test to `test/cli/claude-sync.test.ts` (or a sibling) verifying the updated skill content propagates with the new section heading

## 9. CLAUDE.md generator: capability specs subsection

- [x] 9.1 Update `src/commands/claude.ts` to emit a "Capability specs (v1)" subsection inside the managed `<!-- devspec:claude:start -->` block, with body explaining: per-change deltas at `.devspec/projects/<slug>/deltas/<cap>/spec.md`, living main spec at `.devspec/specs/<cap>/spec.md`, the four CLI commands (init/list/status/delta/sync), the `capability:` frontmatter convention, and the four new coherence rules
- [x] 9.2 Update `test/cli/archive.test.ts` (which already has CLAUDE.md tests) or extend `test/cli/claude-sync.test.ts` to assert the new section appears after generation
- [x] 9.3 Test that user content outside the markers is preserved on re-run (existing test pattern; add a case targeting the new section's stability)

## 10. common/standards.md: capability specs vs contracts

- [x] 10.1 Add "Capability specs vs contracts" section to `src/packs/common/standards.md` — placed below the Philosophy section, above methodology-specific content. Content distinguishes per-change `contract.md` (what THIS ships) from per-capability `.devspec/specs/<cap>/spec.md` (what the SYSTEM promises), with guidance on when to introduce new vs MODIFIED capability
- [x] 10.2 Verify the section content propagates into the merged `.devspec/standards/standards.md` on `devspec init` (existing init test, extend to assert the new section heading is present)
- [x] 10.3 Confirm doctor command does not regress (new section in common doesn't break the merge check)

## 11. Smoke and integration

- [x] 11.1 Add end-to-end smoke in `test/cli/guards-smoke.test.ts`: workspace with two changes both modifying the same requirement in the same capability — `devspec coherence` for each slug surfaces the workspace `requirement-conflict` finding; `devspec check` aggregates it
- [x] 11.2 Add end-to-end smoke: workspace with one orphaned delta + one malformed delta + one frontmatter mismatch — all three per-change rules fire with correct severities; workspace rule does not fire (single-change workspace)
- [x] 11.3 Add end-to-end smoke: `devspec map` against a workspace with two capabilities and one in-flight delta produces correct `capabilities/index.md` and per-capability drill-downs with delta counts
- [x] 11.4 Run full vitest suite locally on Windows and confirm no regression in Slice 1 tests (must still pass without modification)

## 12. Documentation: README

- [x] 12.1 Promote the existing v0 "Capability specs" paragraph in `README.md` (added in Slice 1) to a fuller section under "Mental model" — add the four coherence rules, the reviewer's merged-preview awareness, the new map layer link, the coordinator's capability-conflict surfacing, and a one-line note that CLAUDE.md and standards.md propagate the model to AI agents
- [x] 12.2 Update the `## Project status` section's "What's stable" list to mention coherence-guarded capability specs (v1) replacing the v0 mention
- [x] 12.3 Update the coherence rules table to include the four new rules with their severities

## 13. Wiring + verification

- [x] 13.1 Verify all coherence rule names appear in JSON output by running `devspec coherence <slug> --json` against a populated test workspace and asserting the new rule names appear in the `drifts` array entries (shape stability check)
- [x] 13.2 Run `npm run typecheck` and confirm zero errors
- [x] 13.3 Run full vitest suite; expect ~30-50 additional tests on top of Slice 1's 182; total ≈ 215-235 tests, all green
- [x] 13.4 Self-dogfood: from inside the DevSpec repo (which uses OpenSpec, not DevSpec, but the rules apply universally) — manually invoke a test workspace with `devspec specs init`, scaffold a delta with a deliberate typo, confirm `devspec coherence` surfaces the `delta-format` finding
