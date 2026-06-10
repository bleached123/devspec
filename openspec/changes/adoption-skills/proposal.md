## Why

DevSpec's existing 10 skills are greenfield-shaped: `/devspec:onboard` assumes a fresh repo and the walking-skeleton-first philosophy; `/devspec:new` assumes one change at a time from scratch; `/devspec:grill` fills lifecycle stage docs but doesn't speak to capability specs. None of them handle the most common adoption pattern in practice — a user with an existing platform (or platforms), a fully-formed design document for new functionality + adjustments, and a need to seed DevSpec's capability layer with what the system already promises before any change deltas can modify it.

The brownfield adoption workflow has a distinct shape from greenfield: workspace-shape decision up front (one workspace vs per-app), `devspec init` without walking-skeleton enforcement, capability decomposition from prose, **baseline-seeding** of each capability spec with current-state requirements (the step that has no current skill support), then change-by-change planning where each change deltas the baseline. This change adds two skills purpose-built for that flow, while keeping `/devspec:adopt` general enough to also handle greenfield-with-a-design-doc as a degenerate case (just skips the baseline-seed phase since there's no existing behaviour to baseline).

## What Changes

- **New skill `/devspec:adopt`** — orchestrates the brownfield (or greenfield) adoption workflow. Composes existing skills (`/devspec:onboard` patterns for init, `/devspec:new` for change creation, `/devspec:grill` for stage filling, `/devspec:seed-capability` from this change for capability baselines). Walks the user through six phases:
  - Phase 0: workspace shape decision (single vs per-app)
  - Phase 1: `devspec init` with stack-from-existing-code (skips walking-skeleton enforcement when code is already deployed end-to-end)
  - Phase 2: design-doc reading + capability decomposition proposal
  - Phase 3: per-capability baseline seeding (hands off to `/devspec:seed-capability`)
  - Phase 4: change slicing from the design doc
  - Phase 5: per-change planning (hands off to `/devspec:new` + `/devspec:grill`)
  - End state: workspace initialised, first 1–2 capabilities baselined, first change planned with a delta scaffolded, ready for `/devspec:iterate`.
- **New skill `/devspec:seed-capability`** — interview-style drafting of a single capability's BASELINE requirements (what the system promises TODAY, before any change deltas). Takes the capability name as argument; optionally accepts a list of source file paths to read for "current behaviour" context. Walks the user through structured questions, drafts `### Requirement:` blocks, writes the result to `.devspec/specs/<capability>/spec.md` on confirmation. Distinct from `/devspec:grill` (which fills lifecycle stage docs per change, not capability specs).
- **Slash command pair for each** — `.claude/commands/devspec/adopt.md` and `.claude/commands/devspec/seed-capability.md`, following the existing pattern.
- **Both skills registered in `src/core/claude-assets.ts`** — added to `DEVSPEC_SKILLS` (`devspec-adopt`, `devspec-seed-capability`) and `DEVSPEC_COMMANDS` (`adopt`, `seed-capability`).
- **README updates** — promote `/devspec:adopt` as the recommended entry point for ANY user starting with DevSpec (replacing or supplementing the current "open `/devspec:onboard`" pointer); add a brief "Adoption workflows" section explaining the brownfield-vs-greenfield branch.
- **`/devspec:onboard` reframed**, not deprecated. The existing onboard skill is greenfield-walking-skeleton-flavoured. After this change, `/devspec:onboard` stays for users who explicitly want the walking-skeleton-first journey; `/devspec:adopt` is the more general entry point. Documentation calls out the relationship.

## Capabilities

### New Capabilities

- `adoption-workflow`: the guided adoption surface that brings a user from "I have a codebase / design doc" to "I'm iterating on my first DevSpec change." Covers the `/devspec:adopt` orchestration skill, the `/devspec:seed-capability` baseline-drafting skill, and the documentation framing that distinguishes adoption from per-change iteration. Workflow-scoped, not file-scoped: it doesn't introduce new file formats or persisted data, only new agent-driven interaction patterns over the existing CLI + capability-spec surface.

### Modified Capabilities

None. The new skills are orthogonal to `capability-deltas` (file format + sync engine) and `skill-suite` (the general lifecycle skill set). The two new skills are coupled to but do not modify those capabilities' requirements.

## Impact

**New source files**
- `.claude/skills/devspec-adopt/SKILL.md` — the orchestrating skill body
- `.claude/skills/devspec-seed-capability/SKILL.md` — the baseline-drafting skill body
- `.claude/commands/devspec/adopt.md` — slash command file
- `.claude/commands/devspec/seed-capability.md` — slash command file

**Modified source files**
- `src/core/claude-assets.ts` — add `devspec-adopt` and `devspec-seed-capability` to `DEVSPEC_SKILLS`; add `adopt` and `seed-capability` to `DEVSPEC_COMMANDS`
- `README.md` — promote `/devspec:adopt` as the entry point; add an "Adoption" subsection; note the relationship to `/devspec:onboard`
- `src/packs/common/standards.md` — possibly add a line in the philosophy section noting that adoption is a distinct phase from per-change work (only if it improves clarity; defer if it bloats the standards)

**Tests**
- The repo's existing tests don't cover skill content (skills are AI-driven markdown). Continue the precedent: add path-pattern / asset-sync tests where they fit (e.g. extending `test/cli/claude-sync.test.ts` `EXPECTED_*` lists). No new test files for skill bodies.

**Backward compatibility**
- Purely additive. `/devspec:onboard` keeps its current behaviour. `/devspec:adopt` is a NEW slash command, not a rename. Users who type the old form continue to land on the old skill.
- vscode-devspec extension picks up the new skills automatically once `claude-assets.ts` ships them — `syncClaudeAssets` copies whatever's in `DEVSPEC_SKILLS` into the workspace. The extension's copy-button surface could grow `copyAdopt` / `copySeedCapability` in a follow-up extension change, but it's not required (users can invoke the skills via `/devspec:adopt` directly).

**Pre-ship note**: DevSpec hasn't been published, so no shipped-workspace migration concern. The two new skills appear in any workspace as soon as it runs `devspec claude` or `devspec init` against a build that includes them.

**Out of scope** (genuinely separate work)
- Reverse-engineering existing code into capability specs WITHOUT user interview (a fully-automated `/devspec:reverse-engineer` from source). The interview-based `/devspec:seed-capability` is the v1; full automation is a future research project.
- A "design doc parser" that extracts capabilities + changes mechanically from a structured document format. The current scope expects the AI to read prose and propose; structured-doc support could come later if real users converge on a format (markdown headings, OpenAPI, etc.).
- A `/devspec:onboard`-deprecation path. The greenfield-walking-skeleton workflow stays as a first-class entry point; we're adding a second one, not removing the first.
- VS Code extension copy buttons for the new skills (`copyAdopt`, `copySeedCapability`) — defer to a follow-up extension change if friction emerges.
