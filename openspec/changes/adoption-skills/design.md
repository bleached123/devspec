## Context

The existing skill suite covers per-change work well (`/devspec:new` → `/devspec:grill` → `/devspec:iterate` → `/devspec:verify` → `/devspec:archive`) and one greenfield entry point (`/devspec:onboard`). It does not cover the case a user with an existing platform + design doc arrives in: they need to (a) decide workspace shape, (b) init DevSpec without walking-skeleton enforcement, (c) seed capability specs with EXISTING behaviour as baselines, then (d) plan changes that delta against those baselines. None of this is hard — it's the playbook I wrote out in conversation — but currently there is no skill that walks the user through it. They have to read documentation and assemble the steps themselves.

This change adds two skills purpose-built for that flow: `/devspec:adopt` as the orchestrating playbook (works for greenfield too, with one phase skipped) and `/devspec:seed-capability` as the interview-based drafting tool for capability spec baselines (the step with no current support — `/devspec:grill` fills per-change stage docs, not capability specs). Both compose existing skills where possible (via the suggest-next-slash-command pattern) rather than re-implementing their content.

## Goals / Non-Goals

**Goals:**

- Close the brownfield-adoption gap by providing a single entry-point skill that knows the full playbook.
- Provide the missing capability-baseline-drafting skill so users don't have to write `### Requirement:` blocks from scratch with no scaffold.
- Compose existing skills (`/devspec:onboard`, `/devspec:new`, `/devspec:grill`, `/devspec:seed-capability`) at the right phase boundaries — don't duplicate their content.
- Make `/devspec:adopt` general enough to also work for greenfield-with-a-design-doc (just skips the baseline-seed phase).
- Keep `/devspec:onboard` as a first-class entry for users who explicitly want the greenfield-walking-skeleton journey.

**Non-Goals:**

- Automated reverse-engineering of source code into capability specs without user input. The interview model is v1; pure automation is a research project.
- A structured-doc parser (OpenAPI, RFC, JIRA epic, etc.). The skills accept a prose design doc and read it as text.
- A persistent "design doc path" in `devspec.yaml`. Each adopt session takes the path as an argument; no cross-session state.
- VS Code extension copy buttons for the new skills (`copyAdopt` / `copySeedCapability`). Defer — users invoke via `/devspec:adopt` directly. Add later if friction emerges.
- Deprecating `/devspec:onboard`. Both entry points coexist; documentation explains the relationship.

## Decisions

### D1. Orchestration via suggest-next-slash-command, not Skill-tool invocation

`/devspec:adopt` walks the user through phases. At phase boundaries where another skill is the right tool, it ENDS its own session and suggests the next slash command:

```
End of Phase 3 (capability baselines done):
  "Capability baselines seeded. Next: plan your first change with
  /devspec:new <title>. After /devspec:new, run /devspec:adopt again
  to continue with Phase 4–5."
```

The user invokes the next skill themselves. This matches the existing pattern in `/devspec:continue` and `/devspec:new` (which suggests `/devspec:grill` rather than invoking it).

**Alternative considered:** `/devspec:adopt` invokes other skills via the Skill tool, treating itself as a meta-skill that drives a session through multiple sub-skills. Rejected: this would be a new architectural pattern (no current skill invokes another skill), it complicates context budgets (each sub-skill needs its own ~25K window), and it makes the user's mental model harder ("am I still inside adopt? did adopt finish?"). Suggest-next is cleaner.

**Implication:** `/devspec:adopt` is re-entrant. The user can run it multiple times during adoption — each invocation detects current state and continues from the appropriate phase. A workspace already past Phase 1 won't re-run init; one with baselines already seeded won't re-prompt for them.

### D2. Source-file reading is path-argument-based, opt-in

`/devspec:seed-capability` takes the capability name as a positional argument and optionally accepts file paths via subsequent arguments:

```
/devspec:seed-capability user-auth
/devspec:seed-capability user-auth src/auth/login.ts src/auth/session.ts
```

When file paths are provided, the skill reads them (Read tool) and uses their content as context for the interview ("looking at `login.ts`, I see the system creates a session token after credential check; should I draft a requirement like `### Requirement: Credential-based session creation` with body ..."). When no paths are provided, the skill interviews based purely on user-supplied descriptions.

**Why path-arg, not auto-detection from capability name:**

- Auto-detection (`user-auth` → glob `**/auth/**`) is unreliable — naming conventions vary wildly. False positives waste prompt budget.
- Path-arg is explicit and lets the user steer.
- The skill CAN suggest paths it might want to read ("Do you want me to look at any specific source files? e.g. you might point me at the relevant auth module") and the user replies with paths.

**Alternative considered:** Skill auto-globs based on common naming patterns per backend. Rejected — too much per-backend variation; brittle.

### D3. Design doc path is session-scoped, not persisted

`/devspec:adopt` takes the design doc path as an argument:

```
/devspec:adopt docs/PLATFORM_SPEC.md
/devspec:adopt /absolute/path/to/spec.md
/devspec:adopt    # no arg — skill prompts for path
```

The path is not written to `devspec.yaml` or any persistent state. Each session takes the path fresh.

**Why not persist:**

- Design docs change name / location over time. A persistent path goes stale.
- Adding a new field to `devspec.yaml` for one skill's use creates schema sprawl.
- The cost of typing the path each session is trivial.
- If the design doc is conventionally located (`docs/spec.md`, `SPEC.md` at repo root), the skill detects it automatically — see D4.

### D4. Adopt auto-detects conventional design-doc locations when no path given

If `/devspec:adopt` is invoked without a path argument, the skill probes for conventional locations in this order:

1. `docs/spec.md`, `docs/SPEC.md`, `docs/design.md`, `docs/DESIGN.md`
2. `spec.md`, `SPEC.md`, `design.md`, `DESIGN.md` (repo root)
3. `architecture.md`, `ARCHITECTURE.md` (any of the above paths)

When exactly one match is found: use it, tell the user.
When multiple matches: ask the user which one via quick-pick.
When zero matches: ask the user to provide a path, or to continue without a doc (in which case adopt skips Phase 2's "decompose this doc" step and falls back to interview-only capability decomposition).

### D5. Greenfield vs brownfield detection

`/devspec:adopt` detects which branch to take by checking workspace state at session start:

```
Brownfield indicators (treat as brownfield if ANY are true):
  • .devspec/devspec.yaml exists AND any change has been advanced past
    "sketch" phase (= the user has been working in DevSpec already)
  • The project root contains source code matching the chosen backend
    (e.g. *.rs files for rust, *.csproj for dotnet, package.json with
    src/ for node-typescript)
  • The project root contains a deployment artifact (Dockerfile already
    present that wasn't generated by devspec env generate, .github/
    workflows that weren't generated by devspec ci init, etc.)

Greenfield: none of the above
```

When unclear (e.g. greenfield-looking but source files exist that might be vendored deps), the skill ASKS the user: "I see source files but no built artifacts — is this a fresh project with example code, or an existing platform we're adopting DevSpec into?"

**The branch affects two things:**

- **Phase 1 (`devspec init`)**: brownfield path skips the walking-skeleton check; greenfield path enforces it.
- **Phase 3 (capability seeding)**: brownfield walks every relevant capability and seeds baselines; greenfield SKIPS this phase (changes will create the state) and goes straight to Phase 4.

### D6. `/devspec:seed-capability` interview structure

The skill body follows a structured five-step interview pattern, parallel to existing skills like `/devspec:grill`:

```
Step 0  Confirm capability + read optional source files
Step 1  Ask: what does this capability promise the rest of the system?
        (one sentence — used as the capability's preamble)
Step 2  For each promise, generate candidate requirement headings.
        Present 3–5 at a time, ask user to confirm / edit / add / remove.
Step 3  For each confirmed heading, draft the body using SHALL/MUST
        normative language. Present each draft, ask user to confirm or
        revise.
Step 4  Optionally draft scenarios (WHEN/THEN) per requirement if the
        user wants test scaffolds; offer to add `#### Scenario:` blocks
        in the OpenSpec format.
Step 5  Show the full draft spec.md content. Confirm before writing
        to .devspec/specs/<capability>/spec.md.
```

The skill NEVER writes to the file without explicit user confirmation in Step 5.

**Why structured rather than free-form:**

- The output needs to be machine-parseable (`### Requirement: <name>` exact format) so the existing coherence rules and merge engine can read it. A free-form skill could produce well-meaning prose that doesn't parse. Structured questions guide the output into the right shape.
- Brownfield baselining is the user's first encounter with DevSpec's capability-spec model. A guided interview teaches the model along the way; free-form skips that teaching.

### D7. `/devspec:adopt` phase content is suggest-driven, not duplicated

Each phase of the adopt skill body has the same shape:

1. **Detect state** for this phase (workspace exists? capabilities exist? changes planned?)
2. **Show progress** — where in the playbook are we
3. **Either**: run a small CLI command directly (e.g. `devspec init` with assembled flags after user confirms)
4. **Or**: suggest the next slash command and stop ("Now run `/devspec:seed-capability <name>` for each of the capabilities below: ...")

The skill body is short by design — most of the work happens in sub-skills. The body lists the playbook structure, the detection logic per phase, and the suggested next slash commands. It does NOT contain the content of `/devspec:onboard` or `/devspec:seed-capability` etc.

**Implication:** `/devspec:adopt` is mostly orchestration metadata. Estimated body length: ~3–4K tokens. Comparable to `/devspec:continue` and shorter than `/devspec:grill`.

### D8. Walking-skeleton enforcement when brownfield-adopt runs init

The reviewer subagent's walking-skeleton check (from the philosophy) fires when the workspace's first change is non-skeleton-shaped. To bypass this for brownfield adoption:

- `/devspec:adopt` brownfield path runs `devspec init` normally (no special CLI flag needed)
- Adoption-flow doesn't make the first change a walking skeleton — the user's first real change is the first thing they plan from the design doc
- The reviewer's walking-skeleton enforcement currently runs on EVERY first change. After this slice ships, we need a way to mark "this workspace is brownfield-adopted" so the reviewer skips the check

**Two options for the "I'm brownfield" marker:**

A. **Implicit detection**: reviewer checks for source files matching the backend at first-change time. If found, treat as brownfield and skip walking-skeleton enforcement. Same logic as D5.

B. **Explicit flag**: `/devspec:adopt` brownfield path writes a `brownfield: true` field into `devspec.yaml` at init time. Reviewer reads this; if true, skip walking-skeleton check.

**Lean toward A** — implicit, no new config schema. The detection logic from D5 is reusable here. If real-world cases produce false positives, switch to B.

**Implication:** there's a small follow-up to the reviewer skill markdown (`devspec-review` and `devspec-iterate`) to add the brownfield-detection check before flagging walking-skeleton violations. This is a small task to include in this change.

### D9. README framing — `/devspec:adopt` is the new top-level entry

The README's "Quick start" section currently points at `/devspec:onboard`. This change updates it to recommend `/devspec:adopt` as the universal entry point:

```
Quick start (any state):
  Open Claude Code and run /devspec:adopt — it walks you through
  setting up DevSpec for your project, whether it's brand new or
  has existing code with a design doc.

  For greenfield projects where you want the walking-skeleton-first
  workflow specifically, /devspec:onboard remains available.
```

The "Fastest path to a working change" section (which mentions `/devspec:onboard`) gets re-worded to mention both, with `/devspec:adopt` as the primary recommendation.

### D10. CLAUDE.md generator update

The CLAUDE.md generator's "Useful commands" section lists slash commands the user can run. After this change, `/devspec:adopt` is added at the top of that list (above `/devspec:onboard`), with a one-line description.

The generator's "Capability specs (v1)" subsection added in delta-specs-guards gains a new bullet:

```
- To seed an existing capability with current-state requirements (brownfield),
  use `/devspec:seed-capability <name>`. The skill interviews you, optionally
  reads named source files, and drafts the baseline requirements.
```

## Risks / Trade-offs

- **Two more skills in an already-long list** → mitigated: the suite already has 10 skills, two more is ~20% growth. CLAUDE.md's slash-command listing scales fine.
- **`/devspec:adopt`'s phase-detection logic could misdiagnose state** → mitigated: when uncertain (e.g. source files but no built artifacts), the skill asks. Confidence-gated automation only.
- **Suggest-next-slash-command pattern means the user has to manually re-invoke adopt** → mitigated: the skill's final phase prints clear next-step instructions. After the user finishes the suggested sub-step, re-running `/devspec:adopt` resumes from the correct phase via state detection.
- **`/devspec:seed-capability` interview could be slow for capabilities with many requirements** → mitigated: the skill batches 3–5 requirement headings per round. A 20-requirement capability is ~5 rounds, not 20 individual questions.
- **Source-file reading in `/devspec:seed-capability` increases prompt budget** → mitigated: opt-in via explicit paths. The skill warns the user when total file content exceeds a threshold (e.g. 5K tokens) and suggests narrowing.
- **Implicit brownfield detection (D8) could false-positive on greenfield repos with starter source code** → mitigated: skill asks when ambiguous; user override available. If real users hit this often, swap to explicit `brownfield: true` flag in `devspec.yaml`.
- **`/devspec:onboard` vs `/devspec:adopt` confusion** → mitigated: README and CLAUDE.md call out the difference. `/devspec:adopt` is general (works for both); `/devspec:onboard` is specifically the walking-skeleton-first greenfield journey. Most users want adopt.

## Migration Plan

Strictly additive. No existing skill or command changed; both new skills appear in workspaces on next `devspec claude` or `devspec init`. Pre-ship, so no shipped-workspace concern.

Rollback: removing the new skills from `DEVSPEC_SKILLS` / `DEVSPEC_COMMANDS` arrays restores prior behaviour. README + CLAUDE.md updates revert.

## Open Questions

- **Does `/devspec:adopt` need a `--dry-run` mode** that shows the proposed plan (workspace shape, capabilities, changes) without executing any CLI commands? Tempting for high-stakes adoptions. Defer; add later if real users want it.
- **Should `/devspec:seed-capability` produce a draft, then offer to chain into the FIRST change that deltas the capability?** Would create a fast path from "I've baselined auth" to "I'm planning the first auth change." Defer to avoid scope creep on this change.
- **Does `/devspec:adopt` need an `--app <name>` flag for monorepo workspaces** (init into `apps/<name>/.devspec/` rather than repo root)? D1's per-app workspace shape needs this. Add to scope or treat as obvious-from-context (user `cd`s into the app dir before running `/devspec:adopt`)?
- **Brownfield reviewer behaviour beyond walking-skeleton** — should brownfield-adopted workspaces also relax the "every dep documented in design.md" rule for pre-existing deps that already exist in the codebase? Probably yes; out of scope here, follow-up if friction emerges.
- **Does `/devspec:onboard` need a deprecation notice** in its skill body pointing at `/devspec:adopt`? No — they coexist. But a one-line "for general adoption use `/devspec:adopt` instead" mention is friendly.
