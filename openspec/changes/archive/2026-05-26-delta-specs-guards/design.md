## Context

`delta-specs-foundational` (Slice 1) shipped the capability-spec system as a working end-to-end pipeline: users create capability specs, scaffold per-change deltas, sync the deltas into living capability specs, archive changes with auto-sync. The system is correct as long as users edit files via the CLI and keep deltas well-formed — but it fails silently under common edit-time mistakes (typo'd block headers parse to empty, frontmatter mismatches go unflagged, two changes can clobber the same requirement). It is also invisible to four of DevSpec's downstream surfaces: the reviewer subagent (reads only `contract.md`), the map visualisation system (knows about changes, not capabilities), the `/devspec-coordinate` skill (scans for file overlap, not capability collisions), and the documentation surfaces that AI agents and humans read (CLAUDE.md and `common/standards.md` have no mention of the capability layer).

Coherence rules in DevSpec today are per-change — each rule receives a `ChangeState` and returns drift findings scoped to that change. Three of the new rules in this slice are per-change in shape (`capability-exists`, `delta-format`, `delta-capability-match`). The fourth (`requirement-conflict`) is fundamentally workspace-level: it can only fire by inspecting *every* active change's deltas in aggregate, which the current rule contract does not support. This drives the largest architectural decision in this slice — introducing a parallel `WorkspaceRule` type alongside the existing per-change `CoherenceRule`.

The reviewer integration is a skill-level change, not a code change: the `devspec-review` skill already reads `contract.md`; this slice adds an instruction in the skill markdown to also invoke `devspec specs sync <slug> --dry-run --json` when the change has deltas, and to treat that merged preview as the spec of record. The map and coordinate integrations are code changes to `src/commands/map.ts` and the `devspec-coordinate` skill respectively.

## Goals / Non-Goals

**Goals:**

- Catch every silent-failure class identified in Slice 1: typo'd block headers, orphaned delta directories, frontmatter↔deltas mismatch, cross-change MODIFY/REMOVE clobber.
- Introduce a clean `WorkspaceRule` extension to the coherence model that future cross-change rules (not just `requirement-conflict`) can reuse.
- Make the capability layer visible everywhere DevSpec already surfaces system state — reviewer, map, coordinator, AI agent context, pack standards.
- Keep all four coherence rules suppressible via the existing `<!-- devspec:ignore <rule-name> -->` mechanism, including the workspace-level rule (suppressed by markers in any active change).
- Preserve the additive contract from Slice 1: workspaces with no capabilities defined incur no new behaviour from this slice.
- Ship the v1 documentation: capability specs explained in CLAUDE.md (AI agent context) and `common/standards.md` (pack-level conceptual model) so agents proactively maintain them.

**Non-Goals:**

- Schema versioning of capability spec files (still v0; future migration command remains future work).
- Renaming requirements with continuity across deltas (still REMOVED + ADDED).
- VS Code extension surfaces for capabilities — separate sibling-repo change once this slice lands the data it surfaces.
- Auto-resolution of `requirement-conflict` (the rule flags; humans decide which change rebases).
- Capability-level archive policies (when to retire a capability, what to do with deltas referencing an archived capability — out of scope; future concern).
- `devspec-skill-suite` (the missing slash commands) — separate change.

## Decisions

### D1. Introduce a `WorkspaceRule` type alongside `CoherenceRule`

The existing `CoherenceRule.check(state: ChangeState)` returns drifts for one change. `requirement-conflict` needs to see all active changes. Three architectural options:

**Chosen — A. Parallel `WorkspaceRule` type with its own runner pass.**

```ts
// src/core/coherence/types.ts (additions)
export interface WorkspaceContext {
  root: string;
  activeSlugs: string[];
  loadChangeState: (slug: string) => Promise<ChangeState>;
}

export interface WorkspaceDrift extends Drift {
  /** Which change(s) the drift applies to. Empty = workspace-wide. */
  slugs: string[];
}

export interface WorkspaceRule {
  name: string;
  description: string;
  check: (ctx: WorkspaceContext) => Promise<WorkspaceDrift[]>;
}
```

The coherence runner gains a separate workspace-pass entry point (`runWorkspaceCoherence(root, workspaceRules?)`) that collects findings tagged with affected slugs. `devspec coherence <slug>` filters workspace-level drifts to those naming `<slug>`. `devspec check` and `devspec status` aggregate both per-change and workspace findings.

**Alternatives considered:**

- **B. Cross-change visibility added to `CoherenceRule.check`** — pass a sibling-loader function in `state.workspace`. Rejected: every existing rule receives a shape it doesn't need, increasing coupling. Per-change rules are simpler and more testable when scoped to one change.
- **C. Single "post-pass" function instead of typed workspace rules** — one function runs after all per-change rules. Rejected: no extensibility model — adding a second workspace rule means editing a monolithic function, and findings have no rule identity for ignore-marker support.

**Suppression semantics for workspace rules**: a workspace rule's findings can be suppressed by `<!-- devspec:ignore <rule-name> -->` in **any** of the involved changes' docs. If suppressed in *all* affected changes, the drift is silenced; if suppressed in some but not all, the drift remains but lists only the non-suppressing changes. Simple OR-of-changes semantics keeps the existing ignore mechanism intact.

### D2. Coherence rule semantics — four rules

**`capability-exists`** (severity: `warn`)

- Scans each change's `deltas/<cap>/` subdirectories.
- For each `<cap>` directory, checks that `.devspec/specs/<cap>/spec.md` exists.
- If not, emits one drift per orphaned delta with rule name `capability-exists`, message `Delta references unknown capability "<cap>". Run \`devspec specs init <cap>\` or delete the orphaned delta.`, and a remediation option list.
- Early-returns when the change has no `deltas/` directory.

**`delta-format`** (severity: `warn`; escalates to `block` automatically in `production` phase via existing strict mode)

- For each delta file (`deltas/<cap>/spec.md` or `.synced` variant), parses and reports:
  - Unrecognised `## ` block headers (anything not in `{ADDED Requirements, MODIFIED Requirements, REMOVED Requirements}`). Heuristic: heading text matches `^## [A-Z]+ Requirements$` but lowercased label doesn't match the canonical three.
  - Requirement headings (`### Requirement: ...`) appearing outside any recognised block.
  - Empty `### Requirement:` body in `ADDED` and `MODIFIED` blocks (body length zero after trimming whitespace). REMOVED is allowed to have empty body.
  - Duplicate `### Requirement:` headings within the same block (within the same delta file).
- One drift per finding, scoped to the change containing the delta.

**`delta-capability-match`** (severity: `warn`)

- Reads `contract.md` and extracts `capability:` frontmatter via the Slice 1 `readContractCapabilities` helper.
- Scans `deltas/` subdirectories for the change.
- Flags:
  - Capabilities in frontmatter with no matching `deltas/<cap>/spec.md` (or `.synced`).
  - `deltas/<cap>/` subdirectories not listed in frontmatter (when frontmatter is present).
- Suppressed entirely if the change has no `capability:` frontmatter — the frontmatter is opt-in, so absence does not flag.

**`requirement-conflict`** (severity: `block`; **workspace-level**)

- For every active change, collects its parsed delta entries by `(capability, block, requirement-name)`.
- A conflict exists when two or more active changes name the same `(capability, requirement-name)` in `MODIFIED` or `REMOVED` blocks, OR when two changes `ADD` the same `(capability, requirement-name)`.
- Emits one workspace drift per conflict tuple, listing all affected slugs and the conflict kind (`modify-modify`, `modify-remove`, `remove-remove`, `add-add`).
- Suppression: ignore marker `<!-- devspec:ignore requirement-conflict -->` in any of the affected changes' docs removes that change from the conflict set; conflict is dropped if fewer than two unsuppressed changes remain.

### D3. Reviewer subagent integration is a skill-level edit, not code

The reviewer (`devspec-review` skill + `/devspec-iterate` reviewer step) runs in a fresh subagent and reads files named in its prompt. Capability awareness is added as a prompt-level instruction, not by changing TypeScript code:

```
(addition to .claude/skills/devspec-review/SKILL.md, in the "Required reads" section)

## Capability-spec awareness (if the change has deltas)

If the change has a `deltas/` subdirectory (check with `ls .devspec/projects/<SLUG>/deltas`), run:

  devspec specs sync <SLUG> --dry-run --json

For each capability in the result, the `preview` field is the post-merge content
of `.devspec/specs/<capability>/spec.md`. Treat THIS as the source of truth for
"what the capability promises after this change lands" — NOT the current
content of the file.

When reviewing the implementation, compare against the merged preview, not the
current pre-merge spec. A change that MODIFIES `### Requirement: Session storage`
should have implementation matching the NEW body, not the OLD.

If the dry-run returns errors (capability-deltas validation failure), do NOT
review — emit one finding `category: spec-match, severity: block, message:
"Capability deltas fail validation — fix deltas before review"`.
```

Same instructions are added to the `devspec-iterate` slash command's reviewer step. No TypeScript code in the reviewer changes; we leverage that the reviewer is an LLM with bash access.

**Alternative considered:**

- Generate a merged preview file (e.g. `.devspec/projects/<slug>/.capability-preview.md`) and instruct the reviewer to read it. Rejected: introduces a generated cache file with its own staleness problems, and `devspec specs sync --dry-run --json` is already cheap enough to run on demand.

### D4. Map L1.5 capability layer

`devspec map` today emits L0 (`workspace.md`), L1 (`change-<slug>.md`), L2 (`contract-<slug>.md`), L3 (`arch.md`, `deps-<slug>.md`). L1.5 sits between change and contract layers — it's about the SYSTEM-WIDE capability surface, not a single change.

**File structure:**

```
.devspec/maps/
├── workspace.md                    (L0 — existing)
├── change-<slug>.md                (L1 — existing)
├── contract-<slug>.md              (L2 — existing)
├── arch.md                         (L3 — existing)
├── deps-<slug>.md                  (L3 — existing)
└── capabilities/                   ← NEW
    ├── index.md                    (L1.5 — list all capabilities)
    └── <capability>.md             (L1.5 drill-down — one per capability)
```

**`maps/capabilities/index.md` contents:**

- "How to read" intro paragraph.
- Mermaid graph: each capability as a node, edges from changes (active + recent archive) to the capabilities they touch.
- Table: capability name, requirement count, dirty/clean status, drill-down link.
- Workspace breadcrumb back to `workspace.md`.

**`maps/capabilities/<capability>.md` contents:**

- Capability summary (first paragraph of the main spec).
- Requirements list (each `### Requirement:` heading) with source link to the main spec.
- "Active changes touching this capability" table with pending ADD/MOD/REMOVE counts (one row per change).
- "Archived contributors" list with timestamps (from `.devspec/archive/<slug>/deltas/<cap>/spec.md.synced`).
- Breadcrumb back to capabilities/index.md → workspace.md.

**`workspace.md` (L0) gains a "Capabilities" subsection** linking to `capabilities/index.md` so it's discoverable from the top.

**`devspec map --watch` glob extension**: add `.devspec/specs/**` and `.devspec/projects/*/deltas/**` to the watched paths. On a change there, regenerate `capabilities/index.md` and the affected `capabilities/<cap>.md`.

### D5. `/devspec-coordinate` extension

The coordinator skill today scans for shared files, API overlap, domain collisions, test contradictions, and dependencies across active changes. Adding capability awareness is a skill markdown edit:

```
(addition to .claude/skills/devspec-coordinate/SKILL.md)

## Capability-delta scan

After the existing file/API/domain scans, run:

  for each active change <slug>:
    devspec specs status <slug> --json
  → collect (slug, capability, pending-set)

Group by capability. Within each group, if two or more changes have any of:
  - same MODIFIED requirement name
  - same REMOVED requirement name
  - same ADDED requirement name
  - one MODIFY/REMOVE and another MODIFY/REMOVE of the same heading

emit a finding:
  - severity: block (always — semantic conflict)
  - category: capability-conflict
  - message: "<slug-a> and <slug-b> both touch \"### Requirement: <name>\"
    in capability <cap>. Propose: rebase the second change against the
    first's resulting spec after sync."
```

The coordinator skill's findings format is unchanged; capability-conflict is a new `category` value alongside existing categories. The underlying coherence rule `requirement-conflict` (D2) is the deterministic enforcement; the coordinate skill is the *interactive* surface that explains and proposes resolutions.

### D6. CLAUDE.md generator section

`src/commands/claude.ts` writes content between `<!-- devspec:claude:start -->` and `<!-- devspec:claude:end -->` markers. Slice 2 adds a new subsection:

```markdown
## Capability specs (v1)

DevSpec workspaces maintain living **capability specs** at `.devspec/specs/<capability>/spec.md`. Each is the accumulated, current truth of what the system promises for one capability (e.g. `user-auth`, `billing`). Per-change deltas at `.devspec/projects/<slug>/deltas/<capability>/spec.md` use `## ADDED Requirements`, `## MODIFIED Requirements`, and `## REMOVED Requirements` blocks. Sync merges deltas into the capability spec; archive auto-syncs.

When working on a change:
- If `contract.md` has `capability: [<name>]` frontmatter, the change deltas that capability — write `deltas/<name>/spec.md`.
- Use `devspec specs init <name>` before referencing a new capability.
- Run `devspec specs sync <slug> --dry-run` to preview the merge before applying.
- Use `### Requirement: <name>` for each requirement (exact text matching across deltas).

Coherence rules (`capability-exists`, `delta-format`, `delta-capability-match`, `requirement-conflict`) catch silent failures; review them via `devspec coherence <slug>`.

When reviewing implementation, the merged-preview of the capability spec is the source of truth for "what the capability promises post-change", not the pre-merge file.
```

The content is generated as part of the existing managed-block render. Tests in `test/cli/claude-sync.test.ts` (already added in Slice 1 for the new sync command) extend to assert the new section's headings are present.

### D7. `common/standards.md` "Living capability specs vs contracts" section

`src/packs/common/standards.md` gains a new top-level section (probably under the existing "Philosophy" section since this is a conceptual stance, not a methodology fragment). Content:

```markdown
## Capability specs vs contracts

DevSpec has two distinct spec layers, each with a single responsibility:

- **`contract.md`** lives in each change directory and is the source of truth for **what THIS change ships** — TS-flavored API pseudocode and the ```yaml tests block that becomes failing tests via `devspec scaffold`. Scoped to one change, frozen on archive.
- **`.devspec/specs/<capability>/spec.md`** lives at the workspace level and is the source of truth for **what the system PROMISES** for one capability — accumulated requirements written as `### Requirement: <name>` headings with SHALL/MUST normative bodies. Living across changes, edited via per-change deltas.

When to introduce a NEW capability:
- The system gains a new bounded behaviour (auth, billing, data export) that didn't exist before.
- A non-engineer would name it as a "thing the product does" in plain English.
- Capability names are kebab-case nouns or short noun-phrases.

When to MODIFY an existing capability:
- A change adjusts the shape of an existing requirement (body change) — use MODIFIED.
- A change adds a new dimension to an existing capability (new requirement) — use ADDED.
- A change removes obsolete behaviour — use REMOVED + record rationale in alignment.md.

The contract and the capability spec are **complementary, not redundant**: the contract enumerates what THIS change builds + tests; the capability spec enumerates what the SYSTEM promises after this change merges. Reviewer subagents read both — the contract for code-level verification, the merged capability spec for system-level verification.
```

This section gets propagated into every workspace's merged `.devspec/standards/standards.md` at `devspec init` time, and is read by both the implementer and reviewer subagents on every iteration.

### D8. Production-phase escalation for `delta-format`

The proposal marks `delta-format` as `warn → block in production`. Mechanically this happens for free via the existing `strict` flag in `runCoherence` — `production` phase sets `strict: true`, which promotes all `warn` drifts to `block`. No special handling needed; the rule simply emits `warn` and the runner does the escalation.

The other three new rules use their declared severity unchanged: `capability-exists` and `delta-capability-match` stay `warn` (workspaces can ship with a known-orphan or known-mismatch in development); `requirement-conflict` is `block` always (semantic conflict has no productive non-resolved state).

### D9. CLI flag stability for `--json` outputs

Slice 2's new coherence rules and the workspace runner output their findings via the existing `devspec coherence <slug> --json` shape. The shape is **additive**: the `drifts: Drift[]` array grows new entries with `rule` field values matching the four new rule names. No existing field is renamed or removed. The map and coordinate skills consume capability data via `devspec specs status --json` and `devspec specs list --json` (Slice 1 outputs); their JSON shapes are locked-in for this slice (any future changes require an additive-only path or a new flag).

## Risks / Trade-offs

- **Workspace-level rule architecture is new** → Mitigation: keep the `WorkspaceRule` shape minimal and parallel to `CoherenceRule`. Only one workspace rule ships in this slice (`requirement-conflict`), so the API stays small and easy to revise if the shape turns out wrong. Future workspace rules (`unused-capability`, `capability-drift-vs-archive`) can be added incrementally.
- **Reviewer integration relies on the LLM following prompt instructions** → Mitigation: the dry-run JSON shape includes structured `errors` and `preview` fields; the instruction tells the reviewer to short-circuit on validation errors. If the reviewer hallucinates, the existing per-finding human review catches it.
- **Map regeneration on every delta edit could be expensive** → Mitigation: only regenerate the affected `capabilities/<cap>.md` and `capabilities/index.md` on a watched file change. The expensive per-file Mermaid generation already exists in `map.ts` and is debounced via the existing watch infrastructure.
- **`requirement-conflict` may false-positive on intentional sequential changes** → Mitigation: two changes that *intentionally* edit the same requirement (e.g. one renames it, the next refines the renamed version) can suppress the rule via the ignore marker in alignment.md with a rationale. The conflict rule is a default-on safety net, not a hard wall.
- **Adding capability awareness to coordinate skill makes the skill prompt longer** → Mitigation: the existing skill is already ~150 lines; ~30 more for capability scanning is acceptable. If the skill becomes unwieldy, factor the capability-scan section into a sub-skill the coordinator calls.
- **CLAUDE.md gets longer; managed block could become unwieldy** → Mitigation: the managed block already has sections; adding one more is in-pattern. If the file approaches a context-window concern (~10K tokens), introduce a "concise" mode flag to the generator (future work, not this slice).
- **`common/standards.md` change propagates to every workspace's merged standards file** → Mitigation: existing `devspec doctor` flags merged-standards drift; users who customised their merged copy will see the warning on next run and decide whether to re-merge. Tests cover the merge path.

## Migration Plan

This slice is additive. No data migration is required.

- Workspaces with no capabilities defined: zero behaviour change. All four rules early-return; reviewer instruction triggers only when `deltas/` exists; map emits empty `capabilities/index.md` (or skips the file entirely); coordinate finds zero capability findings.
- Workspaces with capabilities from Slice 1: gain new coherence findings on existing deltas. Any pre-existing typos, orphaned directories, or mismatches surface as `warn` drifts on next `devspec coherence` run. The user remediates or suppresses.
- CLAUDE.md and `common/standards.md` updates: users re-run `devspec claude` (or it runs automatically on init) and the managed block updates with the new section. Custom content outside the markers is preserved by the existing managed-block mechanism.
- Map updates: `devspec map` emits `maps/capabilities/` directory on next run. Existing map files are not touched.

Rollback: removing the new rules from the BUILTIN_RULES list, removing the workspace runner pass, removing the new map directory generation, and reverting the skill markdown changes restores Slice 1 behaviour. No persisted state is affected.

## Open Questions

- **Should `requirement-conflict` also fire across archived changes?** Today it scans active changes only. An archived change that already merged should not conflict with an in-flight change (the merge is done) — but if the in-flight change MODIFY's a requirement that an archived change ADDED *and was later removed in a third change*, the heading no longer exists. The Slice 1 `validateMerge` already catches this at sync time. Probably no — but worth confirming in implementation.
- **Should the merged-preview be cached?** If the reviewer subagent and the coordinator skill both call `devspec specs sync <slug> --dry-run --json` close in time, we recompute. Caching could be a `.devspec/cache/` file invalidated on delta file mtime. Defer the optimisation unless real workflows show it as a bottleneck.
- **Should map regeneration debounce window be configurable?** Currently the map watcher uses a fixed debounce. Capability files change less frequently than source files, but in active editing a delta gets saved multiple times per minute. A separate (longer) debounce for capability maps could be useful. Defer until observed.
- **Does the `delta-format` rule need to parse comment blocks?** The Slice 1 starter delta scaffold contains commented-out examples inside `<!-- -->`. The parser should ignore content inside HTML comments to avoid false-positive "empty body" or "unrecognised block" findings. Confirm by inspection of the scaffold output; add a comment-stripping pass before parsing if needed.
- **Should `common/standards.md` content go above or below the existing Philosophy section?** The capability-specs concept is foundational enough to warrant top placement, but Philosophy is itself foundational ([[feedback-devspec-philosophy-layer]]). Probably below Philosophy, above the methodology-specific sections.
