## Why

The `delta-specs-foundational` change (Slice 1) shipped the file model, CLI, sync engine, archive integration, and the `/devspec-sync` skill. The system works end-to-end — but it works **only as long as users edit files correctly**, only the per-change reviewer reads the contract (not the merged capability spec), only `devspec map` shows changes (not capabilities), only the `/devspec-coordinate` skill knows about file overlap (not capability MODIFY collisions), and only the README mentions capability specs (not CLAUDE.md or `common/standards.md`).

Concretely, four classes of silent failure exist today: (1) a typo in a delta block header (`## ADDDED Requirements`) parses to zero entries with no warning; (2) `capability:` frontmatter in `contract.md` is purely advisory — nothing enforces that the listed capabilities have matching `deltas/` directories; (3) two in-flight changes can MODIFY the same requirement and the last sync silently wins; (4) a hand-edited delta directory referring to a nonexistent capability sits unflagged until sync time. Slice 2 closes these gaps with coherence rules, extends the reviewer and map systems to read the capability layer, surfaces conflicts in `/devspec-coordinate`, and propagates the documentation into the surfaces AI agents and humans read every iteration.

## What Changes

- **Four new coherence rules** under `src/core/coherence/rules/`:
  - `capability-exists` (**warn**) — flags `deltas/<cap>/` subdirectories where `.devspec/specs/<cap>/spec.md` does not exist. Catches orphaned deltas left by reverts or filesystem edits.
  - `delta-format` (**warn**, escalates to **block** in production phase) — parses each delta file and flags malformed block headers (`## ADDDED Requirements`, missing space, lowercase keywords), `### Requirement:` headings without bodies, and headings under unrecognised blocks.
  - `delta-capability-match` (**warn**) — when `contract.md` has a `capability:` frontmatter list, flag mismatches between the declared list and the subdirectories actually present under `deltas/`. Misses, extras, and case-typos all flagged.
  - `requirement-conflict` (**block**) — workspace-level rule: scans every active change's deltas and flags when two or more changes propose `MODIFY` or `REMOVE` for the same `### Requirement:` heading in the same capability. Last-sync-wins silent clobber prevention.
- **Reviewer subagent capability awareness** — the `devspec-review` skill and `/devspec-iterate` reviewer step compute the merged-preview of the capability spec (`devspec specs sync <slug> --dry-run --json`) and read it as ground truth for "what does the capability promise after this change?". The reviewer can now answer "does this implementation match the *post-merge* spec?" instead of just "does it match the contract?".
- **`devspec map` L1.5 capability layer** — a new map file `maps/capabilities/index.md` lists every capability with link to its drill-down. Each capability drill-down (`maps/capabilities/<cap>.md`) shows: current requirements, in-flight changes touching it (with pending ADDED/MODIFIED/REMOVED counts), and archived contributors with timestamps. Renders as Mermaid where applicable. `devspec map --watch` regenerates capability maps on edits to `.devspec/specs/` and `.devspec/projects/*/deltas/`.
- **`/devspec-coordinate` cross-capability conflict detection** — the coordinator skill (and the underlying `src/commands/coordinate.ts` if present, otherwise the skill alone) scans active changes for capability collisions: same MODIFY/REMOVE target heading, ADD that names a heading another change is also ADDing, two changes touching the same capability. Surfaces these alongside existing file-overlap and API-overlap findings.
- **CLAUDE.md generator section** — `devspec claude` writes a "Capability specs (v1)" subsection into the managed block explaining the model (per-change deltas merging into living `.devspec/specs/<cap>/spec.md`), the relevant commands (`devspec specs init|list|status|delta|sync`), and the convention that the `capability:` frontmatter in `contract.md` declares the change's scope. Agents reading CLAUDE.md on every iteration learn to maintain capability specs proactively.
- **`common/standards.md` "Living capability specs vs contracts" section** — universal pack content explaining the conceptual distinction: contract = "what THIS change ships" (per-change source of truth for tests + API); capability spec = "what the system PROMISES" (per-capability accumulated truth, edited via deltas). Includes when to introduce a new capability (when the system gains a new bounded behaviour) versus modifying an existing one (when behaviour changes shape).
- **Capability commands grow `--json` flags** where missing — `devspec specs list --json`, `devspec specs status --json`, and `devspec specs sync --json` already exist (added in Slice 1); this slice confirms shape stability and adds machine-readable output to any commands the new coherence rules need to read.
- **Documentation diff in README.md** — the v0 paragraph promoted to a fuller "Capability specs" subsection under "Mental model" referencing the now-enforced contract.

## Capabilities

### New Capabilities
None. Slice 2 modifies the existing `capability-deltas` capability rather than introducing a new one.

### Modified Capabilities
- `capability-deltas`: adds coherence enforcement (four new rules), reviewer-subagent awareness (reads merged-preview), map visualisation (L1.5 layer + drill-downs), cross-change conflict detection in `/devspec-coordinate`, and documentation propagation into CLAUDE.md and `common/standards.md`. Capability commands gain stable `--json` shape contracts.

## Impact

**New source files**
- `src/core/coherence/rules/capability-exists.ts`
- `src/core/coherence/rules/delta-format.ts`
- `src/core/coherence/rules/delta-capability-match.ts`
- `src/core/coherence/rules/requirement-conflict.ts` — workspace-level rule (multi-change scan)
- `src/core/coherence/workspace-rules.ts` (or extension of existing runner) — if not already present, the workspace-level rule type may need scaffolding parallel to per-change rules
- New test files in `test/coherence/` for each rule
- New test files in `test/capability/` for reviewer integration and map rendering

**Modified source files**
- `src/core/coherence/runner.ts` — register the new rules
- `src/core/coherence/types.ts` — possibly extend rule types if workspace-scope rules need a new shape
- `src/commands/map.ts` — emit `maps/capabilities/index.md` and `maps/capabilities/<cap>.md`; watch `.devspec/specs/` and `deltas/`
- `src/commands/claude.ts` — write capability specs section into the managed block
- `src/packs/common/standards.md` — add capability specs section
- `.claude/skills/devspec-review/SKILL.md` and `.claude/commands/devspec-review.md` — instruct reviewer subagent to read merged-preview when a change has deltas
- `.claude/skills/devspec-coordinate/SKILL.md` and `.claude/commands/devspec-coordinate.md` — extend to scan capability deltas for cross-change conflicts
- `README.md` — promote the v0 paragraph to a fuller "Capability specs" section

**Schema / output contracts**
- `devspec coherence <slug> --json` grows entries for the new rule names — the JSON shape is additive (new array elements), not breaking.
- `devspec map` adds a new file family under `maps/capabilities/` — additive on the filesystem.

**Backward compatibility**
- Additive across the board. Workspaces without any capabilities defined skip all four coherence rules (each rule early-returns when there are no capabilities). The reviewer falls back to its current behaviour for changes without deltas. The map command emits empty/skipped capability files when no capabilities exist. CLAUDE.md and `common/standards.md` gain new sections that don't replace existing content.
- No CLI breaking changes; no file-format changes; existing changes continue to work unchanged.

**Walking-skeleton check**
- This slice is feature-out, not foundational. The skeleton (file model + sync + archive integration) shipped in Slice 1 and is already deployable end-to-end. Slice 2 adds guards, awareness, and documentation — all on top of a proven foundation. Each rule, the reviewer integration, the map layer, and the documentation additions are independently testable.

**Out of scope** (genuinely separate work, not deferred)
- VS Code extension surface for capabilities — lives in the sibling `vscode-devspec` repo and will be its own change once Slice 2 lands the rules + map data it needs to surface.
- Pluggable pipeline axis refactor — orthogonal, still parked.
- The `devspec-skill-suite` (5 missing slash commands like `/devspec-explore`, `/devspec-new`, etc.) — separate change.
