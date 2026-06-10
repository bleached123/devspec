## 1. Core types and parsers

- [x] 1.1 Define types in `src/core/capability.ts`: `CapabilityName`, `CapabilitySpec`, `Requirement`, `DeltaBlock`, `DeltaFile` (ADDED/MODIFIED/REMOVED arrays of `Requirement`-like entries)
- [x] 1.2 Implement kebab-case validator (`isValidCapabilityName`) matching `^[a-z][a-z0-9-]*$`
- [x] 1.3 Implement spec parser (`parseCapabilitySpec`): read main `spec.md`, return ordered list of requirements with heading + body
- [x] 1.4 Implement delta parser (`parseDeltaFile`): identify `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` blocks and the `### Requirement: <name>` entries inside each
- [x] 1.5 Write vitest unit tests in `test/capability/parser.test.ts` covering well-formed parsing, malformed input (missing block headers), empty blocks, and whitespace normalisation

## 2. Filesystem layer

- [x] 2.1 Add path helpers to `src/core/capability.ts`: `capabilitySpecPath(root, capability)` → `.devspec/specs/<cap>/spec.md`, `deltaSpecPath(root, slug, capability)` → `.devspec/projects/<slug>/deltas/<cap>/spec.md`
- [x] 2.2 Implement `listCapabilities(root)` — scan `.devspec/specs/` for capability subdirectories
- [x] 2.3 Implement `listDeltas(root, slug)` returning `{ capability, status: "pending" | "synced" }[]`. "synced" = file ends in `.synced`
- [x] 2.4 Implement `atomicWrite(targetPath, content)` — write to `<targetPath>.tmp.<random>`, then `fs.rename` over target
- [x] 2.5 Tests in `test/capability/fs.test.ts` for path helpers, listings, and atomic write (including the interrupt scenario by simulating partial write then verifying original is intact)

## 3. Sync engine

- [x] 3.1 Implement `validateMerge(spec, delta)` — returns `{ ok: true } | { ok: false, errors: MergeError[] }`. Checks: every MODIFIED heading exists in spec, every REMOVED heading exists in spec, every ADDED heading does NOT exist in spec
- [x] 3.2 Implement `applyMerge(spec, delta)` — pure function: applies REMOVED, then MODIFIED, then ADDED, returning the new spec text. Preserves blank-line structure between requirements
- [x] 3.3 Implement `syncChange(root, slug, opts)` — orchestrates: list unsynced deltas → for each, read main spec + delta → validate → apply via atomicWrite → rename delta to `.synced`. Supports `opts.dryRun` (skip write + rename) and `opts.capability` (filter to one capability)
- [x] 3.4 Tests in `test/capability/sync.test.ts`: ADDED appends, MODIFIED replaces, REMOVED deletes, validation failures leave files untouched, dry-run leaves files untouched, multiple capabilities are independent (one failure does not block others)

## 4. Contract frontmatter parsing

- [x] 4.1 Update `src/core/contract.ts` to parse optional YAML frontmatter (between `---\n` lines at top of file) using existing `yaml` dependency
- [x] 4.2 Expose `readContractCapabilities(slug)` returning `string[]` (empty if no frontmatter or no `capability:` key)
- [x] 4.3 Confirm existing callers (scaffold, coherence, contract-coverage rule) are not broken by frontmatter — add regression test in `test/cli/contract-frontmatter.test.ts` exercising scaffold against a contract WITH and WITHOUT frontmatter

## 5. CLI: `devspec specs` subcommands

- [x] 5.1 Create `src/commands/specs.ts` exporting `specsCommand` (Commander group), mirroring the `uat` command pattern
- [x] 5.2 Implement `devspec specs init <capability>`: validate name, idempotent file creation with `## Requirements` placeholder
- [x] 5.3 Implement `devspec specs list`: list capabilities with sync status across all active changes (dirty = at least one pending delta exists)
- [x] 5.4 Implement `devspec specs status [<slug>]`: per-change pending-delta report. Without `<slug>`, report all changes
- [x] 5.5 Implement `devspec specs delta <slug> <capability>`: validate capability exists, scaffold delta with all three block headers (ADDED/MODIFIED/REMOVED) and inline guidance comments
- [x] 5.6 Implement `devspec specs sync <slug> [--dry-run] [--capability <name>]`: delegate to `syncChange()`, print per-capability report
- [x] 5.7 Wire `specsCommand` into `src/cli.ts`
- [x] 5.8 CLI integration tests in `test/cli/specs.test.ts` covering all six commands end-to-end against a temp workspace

## 6. Archive integration

- [x] 6.1 Update `src/commands/archive.ts`: before archiving, call `listDeltas(root, slug)` — if any pending, invoke `syncChange(root, slug, { dryRun: false })`
- [x] 6.2 Add `--no-sync` option to archive command; when set, skip the sync step
- [x] 6.3 Surface sync failure cleanly: print sync errors, exit non-zero, leave change directory untouched
- [x] 6.4 Tests in `test/cli/archive-with-deltas.test.ts`: legacy change (no deltas) archives unchanged, change with valid deltas auto-syncs then archives, change with invalid deltas aborts archive, `--no-sync` archives with deltas intact

## 7. Claude Code skill and slash command

- [x] 7.1 Write `.claude/skills/devspec-sync/SKILL.md` — frontmatter (`name`, `description`, `model: sonnet` or default), body describes the dry-run → preview → confirm → live flow
- [x] 7.2 Write `.claude/commands/devspec-sync.md` — slash-command markdown that invokes the skill and accepts an optional `<slug>` argument
- [x] 7.3 Register both in `src/core/claude-assets.ts`: add `devspec-sync` to `DEVSPEC_SKILLS` and `DEVSPEC_COMMANDS`
- [x] 7.4 Sync-assets test: run `syncClaudeAssets()` against a temp workspace, assert both files land in `.claude/skills/` and `.claude/commands/`

## 8. Templates and contract scaffold

- [x] 8.1 Update `src/core/templates.ts` contract template to include a commented `capability:` frontmatter scaffold at the top with inline explanation
- [x] 8.2 Regenerate any internal test fixtures that snapshot the contract template
- [x] 8.3 Confirm `devspec plan <title>` produces a contract.md with the new frontmatter scaffold (snapshot-style test in `test/cli/plan-template.test.ts`)

## 9. Smoke and integration

- [x] 9.1 Extend `test/cli/smoke.test.ts` (or add a sibling): in a temp workspace, run `init → specs init → plan → specs delta → write delta content → specs sync --dry-run → specs sync → archive`. Assert main spec accumulates correctly and `.synced` markers are in archive.
- [x] 9.2 Run full vitest suite locally and on CI matrix (Ubuntu/macOS/Windows × Node 22/24); fix any platform-specific path or rename issues that surface
- [x] 9.3 Self-dogfood: from inside the DevSpec repo, run `devspec specs init delta-specs` and verify the workspace scaffolds correctly. (Does NOT need to populate the spec content — Slice 2 handles full self-dogfooding.)

## 10. Documentation note (minimal — full docs in Slice 2)

- [x] 10.1 Add a 1-paragraph "Capability specs" section in `README.md` under "Mental model" pointing to the new commands. Full standards.md / CLAUDE.md changes are deferred to Slice 2 (`delta-specs-guards`).
- [x] 10.2 Update the `## Project status` section's command count (was 24, now 24 + 6 = 30 — or however many subcommands count) and the "What's stable" list to mention capability specs at v0
