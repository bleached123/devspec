## Why

DevSpec tracks each change as a self-contained unit — `discovery.md` through `tasks.md`, with `contract.md` as the source of truth for what that change ships. Once a change is archived, its contract freezes in `.devspec/archive/<slug>/` and the system loses the per-change spec context: there is no aggregated, per-capability view of what the system currently promises.

This forces new contributors and the reviewer subagent to reconstruct system behaviour by reading archived contracts in chronological order, and it leaves no place to express how a new change *modifies* existing system behaviour rather than adding to it. Living capability specs — files that accumulate the current truth of what each capability does, edited by per-change delta files — close this gap and align DevSpec with the OpenSpec mental model already used in the OPSX experimental workflow.

## What Changes

- **Capability spec files** at `.devspec/specs/<capability>/spec.md` — one living, accumulating file per capability the system promises. Format mirrors OpenSpec: a heading-per-requirement structure under `## Requirements`.
- **Per-change delta files** at `.devspec/projects/<slug>/deltas/<capability>/spec.md`. Each delta uses `## ADDED Requirements`, `## MODIFIED Requirements`, and `## REMOVED Requirements` blocks to express how the change edits the matching capability spec.
- **Capability frontmatter** in `contract.md`. A YAML frontmatter block declares which capabilities the change touches (`capability: [auth, billing]`). The set must match the subdirectories present under `deltas/` (enforced by a coherence rule in a follow-up slice).
- **New CLI surface** under `devspec specs`:
  - `devspec specs init <capability>` — scaffold a new capability spec
  - `devspec specs list` — list all capabilities with sync status (clean / dirty deltas)
  - `devspec specs status [<slug>]` — show which changes have pending deltas
  - `devspec specs delta <slug> <capability>` — scaffold a delta file in a change
  - `devspec specs sync <slug>` — merge that change's deltas into the main capability specs
  - `devspec specs sync <slug> --dry-run` — preview the merge without writing
- **Archive integration**: `devspec archive <slug>` auto-syncs any unsynced deltas before archiving. A `--no-sync` flag is available for the rare case where the user explicitly wants to discard the deltas (e.g., a discarded change).
- **`/devspec:sync` slash command + skill** — explicit-execution wrapper around `devspec specs sync`, with precondition checks (clean working tree, deltas validate, dry-run preview, confirmation prompt for MODIFIED/REMOVED blocks).
- **Templates updated**: `contract.md` template grows the `capability:` frontmatter section with inline guidance.
- **Strict capability resolution**: `devspec specs delta <slug> <capability>` errors if the capability does not exist (`devspec specs init` must precede first reference). Prevents typos quietly creating new capability files.

## Capabilities

### New Capabilities
- `capability-deltas`: the file format, CLI surface, archive flow, and skill wrapper that together let a change express edits to living capability specs and merge those edits in.

### Modified Capabilities
None. This is the first capability defined in this workspace.

## Impact

**New source files**
- `src/commands/specs.ts` — the `devspec specs` subcommand tree
- `src/core/capability.ts` — capability spec + delta read / write / merge logic
- `src/core/delta-parser.ts` — parse `## ADDED / MODIFIED / REMOVED` block structure
- New skill directory `.claude/skills/devspec-sync/` and slash command `.claude/commands/devspec-sync.md`

**Modified source files**
- `src/commands/archive.ts` — pre-archive sync hook with `--no-sync` escape
- `src/core/contract.ts` — parse `capability:` frontmatter from contract.md
- `src/core/templates.ts` — contract.md template grows frontmatter section
- `src/core/claude-assets.ts` — register the new skill + command in `DEVSPEC_SKILLS` / `DEVSPEC_COMMANDS`
- `src/cli.ts` — wire up the `specs` command tree

**Generated artefacts in user workspaces**
- New directory tree: `.devspec/specs/<capability>/spec.md`
- New subdirectory in each change: `.devspec/projects/<slug>/deltas/<capability>/spec.md`

**Backward compatibility**
- Additive. Existing changes without `capability:` frontmatter and without a `deltas/` subdirectory continue to work — the new flow is opt-in until coherence rules in the follow-up slice ("delta-specs-guards") enforce it.
- No breaking changes to existing commands or file formats.

**Out of scope** (deferred to follow-up changes)
- Coherence rules (`capability-exists`, `delta-format`, `delta-capability-match`, `requirement-conflict`) — Slice 2: `delta-specs-guards`
- Reviewer subagent reading the merged-preview of capability specs — Slice 2
- `devspec map` L1.5 capability layer — Slice 2
- Cross-change conflict detection in `/devspec:coordinate` — Slice 2
- Skill counterparts for other lifecycle phases (`/devspec:explore`, `/devspec:new`, etc.) — separate change: `devspec-skill-suite`
- The MODIFIED-block matching strategy beyond exact `### <heading>` text match — covered in design.md
