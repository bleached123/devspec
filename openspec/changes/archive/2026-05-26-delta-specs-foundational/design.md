## Context

DevSpec workspaces today track per-change specifications in `contract.md`. Each change is self-contained: its discovery, proposal, design, contract, alignment, and tasks live in `.devspec/projects/<slug>/`, and `devspec archive <slug>` freezes the change into `.devspec/archive/<slug>/`. Nothing in the workspace accumulates a current, capability-level view of system behaviour. The reviewer subagent has no aggregated spec to compare implementations against; new contributors have no overview spec to read; cross-change coordination relies on file-system heuristics rather than a shared spec contract.

OpenSpec — already shipped alongside DevSpec in `.claude/commands/opsx/` and used as the experimental workflow for some projects — solves this with a delta model: each change ships per-capability deltas (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`) that merge into living main specs (`specs/<capability>/spec.md`). This design ports that model into DevSpec proper as the first slice of the `delta-specs-foundational` capability.

This slice is intentionally walking-skeleton-clean: file model + full CLI surface + sync engine + archive integration + slash-command skill. Coherence rules, reviewer awareness, map visualisation, and cross-change conflict detection are deferred to a follow-up change (`delta-specs-guards`). The system must be end-to-end functional after this slice — a user can init a capability, scaffold a delta in a change, sync it (manually or via archive), and the main spec accumulates correctly.

## Goals / Non-Goals

**Goals:**
- Land a living capability-spec system that DevSpec users (and the dogfooded DevSpec repo itself) can opt into immediately.
- Mirror OpenSpec's delta block structure so users familiar with `/opsx:*` find the model recognisable.
- Make the integration additive: existing changes without `capability:` frontmatter and without `deltas/` keep working unchanged.
- Provide a single explicit-execution slash command (`/devspec:sync`) so the workflow can be driven entirely from Claude Code without the user typing CLI commands.
- Fail loudly on common errors (unknown capability referenced, MODIFIED heading not found in main spec, ADDED heading collides with existing requirement) — silence is worse than friction at this stage.

**Non-Goals:**
- Coherence rules that enforce delta correctness, capability-match, or cross-change conflict — deferred to `delta-specs-guards`.
- Reviewer subagent reading the merged preview of capability specs when reviewing implementations — deferred to `delta-specs-guards`.
- `devspec map` capability layer — deferred to `delta-specs-guards`.
- `/devspec:coordinate` learning about capability conflicts — deferred to `delta-specs-guards`.
- The broader skill-suite (`/devspec:explore`, `/devspec:new`, `/devspec:continue`, `/devspec:verify`, `/devspec:archive`) — separate change (`devspec-skill-suite`) that depends on this one.
- Pluggable pipeline axis or any other unrelated refactoring — separate parked change.
- Schema versioning for capability specs (e.g. v1 → v2 migration). At v0 we accept that a future schema bump may require a migration command.
- Renaming requirements with continuity (i.e. tracking that `### Old` became `### New` across deltas). Renames are modelled as `REMOVED` + `ADDED` at this stage.

## Decisions

### D1. File layout

```
.devspec/
├── specs/<capability>/spec.md             ← living capability spec (one file)
└── projects/<slug>/
    └── deltas/<capability>/spec.md        ← per-change delta to that capability
```

- One `spec.md` file per capability, no nested capabilities.
- One delta per (change × capability) pair. A change may delta multiple capabilities by creating multiple subdirectories under `deltas/`.
- Capability names are kebab-case (`user-auth`, `data-export`), enforced by `devspec specs init`.

**Alternatives considered:**
- *Single workspace-wide `spec.md`*: rejected. Doesn't scale; reviewer agent context size blows up.
- *Capability spec lives inside the change directory until archive*: rejected. The point is to have a *living* file outside any individual change.
- *Deltas live as sections inside `contract.md`*: rejected. Mixes per-change implementation contract with per-capability behaviour spec — conflates two distinct concerns and makes parsing harder.

### D2. Delta block structure

```markdown
## ADDED Requirements

### <Heading exactly as it will appear in main spec>

<body content — paragraphs, lists, examples — written as it should appear post-merge>

### <next added heading>

...

## MODIFIED Requirements

### <Heading — must match an existing requirement in main spec exactly>

<NEW body content — REPLACES the existing body in main spec post-merge>

## REMOVED Requirements

### <Heading — must match an existing requirement in main spec exactly>

<optional rationale — discarded during merge, present for human readers of the delta>
```

- `## <BLOCK>` line uses fixed labels: `ADDED Requirements`, `MODIFIED Requirements`, `REMOVED Requirements`. Case-sensitive.
- `### Heading` matches the main spec's requirement headings by **exact text equality** (whitespace-normalised).
- For MODIFIED, the body in the delta IS the new body post-merge. The author writes the requirement as it should appear, not as a diff.
- For REMOVED, the body is rationale-only and is discarded by the merger.
- The "WAS / NOW" diff style sometimes seen in informal proposals belongs in `alignment.md` (for audit trail) or `proposal.md` (for human review). It does not live in deltas.

**Alternatives considered:**
- *Diff-style MODIFIED body (`- WAS: ... / - NOW: ...`)*: rejected. Requires the merger to parse a diff format, and chained MODIFIEDs across changes would leave `WAS/NOW` markers embedded in the main spec.
- *Stable IDs in spec.md (HTML comments like `<!-- id: req-001 -->`)*: rejected at v0. Robust against renames but adds ceremony to every requirement. Can be added in a future schema bump if needed.
- *Allow `### Heading [renamed-from: <old>]` for rename continuity*: rejected for this slice. Adds parser complexity; renames are rare; `REMOVED + ADDED` works.

### D3. Capability declaration site

`contract.md` grows a YAML frontmatter block:

```markdown
---
capability:
  - user-auth
  - data-export
---

## API
...
```

- Frontmatter is optional. A change with no `capability:` field and no `deltas/` subdirectory continues to work (additive, opt-in).
- A change with `capability:` declared MUST have a matching subdirectory under `deltas/` for each entry — enforced by `delta-capability-match` coherence rule in Slice 2.
- For this slice, the frontmatter is informational only — `devspec specs delta` reads the contract to suggest the right `<slug>` and `<capability>` pair, but does not enforce strict matching yet.

**Alternatives considered:**
- *Declare in `proposal.md` as a heading*: rejected. Less machine-friendly than frontmatter; humans tend to forget to update headings.
- *Implicit from `deltas/` directory contents*: rejected. No way to declare intent before writing the delta, and easy to forget a capability.

### D4. Strict capability resolution

`devspec specs delta <slug> <capability>` errors if `.devspec/specs/<capability>/spec.md` does not exist. The user must call `devspec specs init <capability>` first.

Reasoning: silent file creation on first reference invites typos to multiply capabilities (`user-auth` vs `user_auth` vs `userauth`). Init-first makes the capability set explicit.

`devspec specs init` itself is idempotent: re-running on an existing capability is a no-op (returns the existing path), not an error.

### D5. Archive integration

`devspec archive <slug>` grows two behaviours:

1. **Pre-archive sync**: if the change has any deltas under `deltas/`, run `devspec specs sync <slug>` as the first step of archive. Equivalent to the user having run `devspec specs sync <slug>` manually beforehand.
2. **`--no-sync` escape**: if the user passes `--no-sync`, deltas are discarded with the archive (no merge attempt). Used for changes that were never merged into the codebase (abandoned changes).

Default behaviour is sync-on-archive. The user-confirmation pattern from `/devspec:archive` (Slice 3 / `devspec-skill-suite`) is where interactive confirmation lives; the CLI itself just performs the action.

If sync fails (e.g. MODIFIED heading not found in main spec), archive aborts with the sync error. The user fixes the delta and retries, or uses `--no-sync` to force the archive.

**Alternative considered:**
- *Require explicit `devspec specs sync` before archive, never auto-sync*: rejected. Adds a step that the user will forget. Auto-sync with `--no-sync` escape preserves user control without adding ceremony.

### D6. Sync algorithm

`devspec specs sync <slug>` for each subdirectory under `.devspec/projects/<slug>/deltas/<capability>/`:

```
1. Read .devspec/projects/<slug>/deltas/<capability>/spec.md
2. Parse three blocks: ADDED, MODIFIED, REMOVED
3. Read .devspec/specs/<capability>/spec.md (target main spec)
4. Validate:
   - Every MODIFIED ### heading exists in main spec → else error
   - Every REMOVED ### heading exists in main spec → else error
   - Every ADDED ### heading does NOT exist in main spec → else error
5. If --dry-run: render the would-be result, print, exit
6. Apply:
   - REMOVED: delete matching heading + body from main spec
   - MODIFIED: replace body of matching heading
   - ADDED: append new heading + body to ## Requirements section
7. Write main spec atomically (tmp file + rename)
8. Move delta file aside to .devspec/projects/<slug>/deltas/<capability>/.synced
   (preserves the delta for audit; renames so future syncs are no-ops)
```

- Atomic write: each capability's main spec is written in full to a temp file, then `fs.rename`'d over the target.
- Multiple capabilities: each capability's sync is independent. If one fails, the others still apply (best-effort), and the failing capabilities are reported. Future hardening can add all-or-nothing transaction mode if needed.
- `.synced` rename strategy lets `devspec specs status` distinguish unsynced from synced deltas without re-parsing every file.

**Alternative considered:**
- *Delete the delta file after sync*: rejected. Losing the delta loses the audit trail. Renaming with `.synced` preserves it while still letting `status` see it's been merged.
- *Move delta into archive at sync time*: rejected. The delta belongs with the change until the change itself is archived. Moving it early splits the change across two locations.

### D7. Slash command + skill: `/devspec:sync`

- Skill directory: `.claude/skills/devspec-sync/SKILL.md`
- Slash command: `.claude/commands/devspec-sync.md` (flat name for this change; namespace migration to `.claude/commands/devspec/sync.md` is part of the follow-up `devspec-skill-suite` change)
- Skill behaviour:
  1. Run `devspec specs status` to find changes with unsynced deltas
  2. If multiple, ask the user which change to sync
  3. Run `devspec specs sync <slug> --dry-run` and show preview
  4. Ask for confirmation, especially if MODIFIED/REMOVED blocks are present
  5. Run `devspec specs sync <slug>` for real
  6. Report results and suggest next action (continue working, or archive if change is done)
- Registered in `src/core/claude-assets.ts` under `DEVSPEC_SKILLS` (`devspec-sync`) and `DEVSPEC_COMMANDS` (`devspec-sync`).

### D8. CLI tree shape

`devspec specs` is implemented as a subcommand group (Commander's `Command.command(...)` chain), parallel to `devspec uat`:

```
devspec specs init <capability>
devspec specs list
devspec specs status [<slug>]
devspec specs delta <slug> <capability>
devspec specs sync <slug> [--dry-run] [--capability <name>]
```

- `--capability <name>` on `sync` lets the user sync one capability at a time within a change (rare but useful for debugging).
- All subcommands share the standard `requireWorkspaceRoot()` boot path.
- Output formatting follows existing DevSpec conventions (chalk colours, terse summaries, `nextStep()` hints).

## Risks / Trade-offs

- **MODIFIED heading match is fragile to wording changes** → Mitigation: document explicitly that requirement headings are stable identifiers; renames must be modelled as REMOVED + ADDED. A future schema bump can introduce stable IDs if real users hit this often.
- **Two in-flight changes MODIFY the same requirement** → Mitigation: Slice 2 (`delta-specs-guards`) adds the `requirement-conflict` coherence rule that flags this at coordinate-time. In this slice the latter-to-archive sync will error because the first archive already changed the heading, prompting a manual rebase.
- **CLI surface grows another verb tree (`specs`)** → Mitigation: it mirrors `uat`, an existing pattern. The user mental model is "another subcommand group", not a new paradigm.
- **User confusion between `contract.md` (per-change) and capability `spec.md` (per-capability)** → Mitigation: `standards.md` (updated in Slice 2 with the rest of the documentation) draws the line clearly: contract = "what THIS change ships", capability spec = "what the system PROMISES". For this slice, the proposal references the distinction.
- **Auto-sync at archive can fail mid-archive** → Mitigation: archive aborts on first sync error and the workspace is left in a clean state (no partial archive). User fixes the delta and retries.
- **`.synced` rename leaves clutter in `deltas/`** → Mitigation: when the change is archived, the entire change directory (including `.synced` files) moves to `.devspec/archive/<slug>/`, preserving the audit trail. They are not deleted.

## Migration Plan

This is an additive feature. No migration is required for existing workspaces or existing changes.

- Existing changes without `capability:` frontmatter and without a `deltas/` subdirectory continue to work — `devspec archive` skips the sync step when there are no deltas.
- The first call to `devspec specs init <capability>` lazily creates `.devspec/specs/`. No workspace upgrade step.
- `devspec doctor` does not regress: capability specs are optional infrastructure, not required state.

Rollback: removing `.devspec/specs/` and the new commands from a future build leaves existing changes intact — no data is mutated outside the new directory tree.

## Open Questions

- **Should `devspec specs init <capability>` accept an initial body (e.g. read from stdin or a `--from <file>` flag)?** Reading from stdin is the more flexible option but adds a flag. Decision: start without it; add `--from` later if users frequently scaffold from existing prose.
- **What scope of `devspec specs list`?** Just capabilities, or capabilities + recent change activity? Start minimal (capabilities + dirty status), expand if needed.
- **Does `devspec sync-contract` (existing command) need to know about deltas?** That command syncs implementation renames back to `contract.md`. It does not currently touch capability specs and need not in this slice. Revisit if Slice 2 reviewer changes surface a need.
- **Should the merger preserve trailing newlines, blank lines between requirements, etc.?** Yes — normalise on read (strip trailing whitespace per line), preserve structure on write (one blank line between requirements). Lock this in the parser implementation; refine if real specs hit edge cases.
