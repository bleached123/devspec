---
description: Cross-change coordinator — reviews all active changes in a workspace and surfaces conflicts (shared files, API overlap, domain collisions, test contradictions, dependencies) with proposed resolutions
---

You are running a workspace-wide coordination review for `$ARGUMENTS`.

- `$ARGUMENTS` empty → coordinate all active (non-archived) changes
- `$ARGUMENTS` is a comma-separated list of slugs → coordinate only those

Unlike `/devspec:iterate` and `/devspec:review` which look at ONE change, this command looks across multiple changes and asks: *do these changes step on each other?*

## Step 1 — Discover active changes

Run `devspec status --json`. Parse it. "Active" means:
- `archived === false`
- `doneStages < totalStages`

If `$ARGUMENTS` is non-empty, filter to that subset.

**If only one change is active, print `Nothing to coordinate — only one active change.` and stop.** Coordination has no meaning for a single change; use `/devspec:review` instead.

## Step 2 — Spawn the coordinator subagent

Use the **Agent tool** with `subagent_type: "general-purpose"`, `description: "DevSpec cross-change coordinator"`, and this prompt verbatim (substituting `<SLUGS>` with the comma-separated list of slugs to coordinate):

```
You are the DevSpec coordinator subagent. Your job: find conflicts and dependencies BETWEEN multiple active changes in this workspace. You are NOT verifying any single change in isolation — that's the reviewer's job. You are looking for ways the changes step on each other.

Standards for this workspace are already in your CLAUDE.md context. Do NOT read `.devspec/standards/standards.md` again.

CONTEXT BUDGET: stay under ~40K input tokens. Read sparingly — only the files this prompt names.

The active change slugs are: <SLUGS>

## Required reads (per slug)

1. `.devspec/projects/<slug>/contract.md` — API surface + tests YAML
2. `.devspec/projects/<slug>/design.md` — high-level approach

Skip discovery/proposal/alignment/tasks. They're not load-bearing for cross-change conflict.

Run `devspec coherence <slug> --json` for each. This gives you the source-implementation map (which files contain which test/API functions) needed to detect file-level overlap.

## What to look for

1. **Shared files** — for each pair of changes (A, B), check the `tests-implemented` and `api-method-implemented` data: do any source files appear in both changes' implementations? Especially common offenders: `lib.rs`, `mod.rs`, `Cargo.toml`, `package.json`, `pyproject.toml`, EF migrations, global router setup.

2. **API overlap** — if changes A and B both declare interfaces/methods with the same names, or methods that do similar things on different interfaces, flag. Use the API method extraction from contract.md's TS pseudocode.

3. **Domain collision** — for projects using DDD/BDD, if two changes both touch the same aggregate or bounded context, check that their changes compose. Example: change A adds `BookingConfirmed` event, change B handles `BookingConfirmed` — that's a dependency, not a conflict, but worth flagging.

4. **Test contradictions** — if change A's contract tests assert outcome X for input Y, and change B's contract tests assert outcome Z for input Y, that's a real contradiction. Read each contract's ```yaml tests block.

5. **Dependencies** — if change A's contract references a type/method/event introduced by change B (or vice versa), one must land before the other. Identify the direction.

6. **Capability conflicts** — for each active slug, run `devspec specs status <slug> --json` and collect its pending deltas. Group by `(capability, requirement-name)`. If two or more slugs touch the same tuple:
   - both MODIFY same requirement → `capability-conflict` block (last sync silently clobbers the other)
   - one MODIFY and another REMOVE → `capability-conflict` block
   - both ADD same requirement → `capability-conflict` block
   - both REMOVE same requirement → `capability-conflict` warn (redundant but not destructive)
   Each conflict's `description` should name the capability and the requirement (e.g. `user-auth :: ### Requirement: Session storage`). Proposed resolutions for `capability-conflict`:
   - "Rebase B against A's resulting spec" — A syncs first, B updates its delta to match the new state
   - "Combine into one MODIFY in one change" — discard one delta, merge intent
   - "Split — A modifies one aspect, B another" — split the requirement into two distinct entries

## Severity rules

- **block** — changes contradict each other (e.g. test contradiction, incompatible API definitions). Cannot land both.
- **warn** — changes touch the same file or interact in a way that needs reconciliation but isn't impossible (e.g. shared lib.rs registration, sequencing dependency).
- **info** — changes are related (shared bounded context, related domain events) but don't conflict — just visibility.

## Proposals per conflict

For each conflict, propose 2–4 resolution options. Examples:

- `shared-file` → "merge into one PR" / "sequence A then B" / "extract shared module first"
- `api-overlap` → "rename method in B" / "unify the interface" / "split into two distinct interfaces"
- `domain-collision` → "extract shared aggregate" / "explicit anti-corruption boundary"
- `test-contradiction` → "the changes are mutually exclusive — pick one" / "rewrite tests to match unified behavior"
- `dependency` → "land B first, A rebases" / "land them together" / "split into independent pieces"

Each proposal: short imperative label + one-line description of what would happen.

## Return EXACTLY one JSON object — no prose, no markdown fence:

{
  "summary": "<2-3 sentences>",
  "changes_reviewed": ["<slugs>"],
  "conflicts": [
    {
      "id": "<short-kebab>",
      "type": "shared-file" | "api-overlap" | "domain-collision" | "test-contradiction" | "dependency" | "capability-conflict",
      "severity": "block" | "warn" | "info",
      "changes": ["<slug-a>", "<slug-b>"],
      "description": "<one sentence>",
      "context": "<more detail; cite file paths when relevant>",
      "proposals": [
        { "label": "<short imperative>", "description": "<what would happen if picked>" }
      ]
    }
  ],
  "verdict": "blocking-conflicts" | "warnings-only" | "informational" | "no-conflicts"
}

`verdict` rules:
- `blocking-conflicts` if any conflict has severity `block`
- `warnings-only` if no blocks but any warns
- `informational` if only `info`
- `no-conflicts` if the conflicts array is empty

DO NOT modify any files. DO NOT propose code patches inline.
```

## Step 3 — Render the report

Parse the JSON. Print:

1. **Header line** with verdict tag:
   - `⚠ BLOCKING CONFLICTS` (red) for `blocking-conflicts`
   - `· WARNINGS` (yellow) for `warnings-only`
   - `i  RELATED` (dim) for `informational`
   - `✓ NO CONFLICTS` (green) for `no-conflicts`
2. **Summary** (the subagent's 2–3 sentence overview)
3. **Changes reviewed** — dim list of slugs
4. **Conflicts grouped by severity** in this order: `block`, `warn`, `info`. For each:
   ```
   [SEVERITY]  type  changes: <slug-a> ↔ <slug-b>
              description
              context
              proposals:
                1. label — description
                2. label — description
   ```
5. **Footer**: count by severity

If the conflicts array is empty: print `Coordinator found no conflicts across N changes — they compose cleanly.`

## Step 4 — Escalate blocking conflicts

If `verdict === "blocking-conflicts"`:

1. Pick up to **4** blocking conflicts (queue the rest with a note: "(N more blocking conflicts deferred — re-run /devspec:coordinate to address them)").

2. Call `AskUserQuestion` with one question per conflict:
   - `question`: phrase the conflict's `description` as a question
   - `header`: `<type>` (truncated to 12 chars)
   - `options`: copy the conflict's `proposals` directly (label + description)
   - `multiSelect: false`

3. For each answered question, log the decision against the FIRST change in the conflict's `changes` array (since `devspec log` takes one slug):

   ```
   devspec log <first-slug> "<chosen label> (cross-change with <other-slug>)" --rule cross-change-coordination
   ```

4. Do NOT auto-apply the chosen resolution. The user (or a follow-up agent) implements it manually. The coordinator's role is to surface and record decisions, not to refactor.

## Guardrails

- ONE coordination per invocation. Don't loop.
- The subagent only READS. It must not edit any file or run anything beyond `devspec status` / `devspec coherence`.
- Don't include single-change drift in the report — that's the reviewer's job. The coordinator focuses on conflicts BETWEEN changes.
- If a conflict can't be cleanly characterized, mark it `info` and describe what's odd — don't manufacture severity.

## Usage

```
/devspec:coordinate                                # all active changes
/devspec:coordinate add-bookings,payment-retries   # specific subset
```

Recommended cadence:

- **Manually**: before declaring `phase --set production`, run once to catch latent conflicts
- **Continuously**: `/loop /devspec:coordinate` while multiple agents are running per-change Ralph loops in parallel — this catches conflicts as they emerge instead of at merge time

## Why this exists

`/devspec:review` reviews ONE change against its spec. It catches "did the implementer follow the contract?" but cannot see across changes.

`/devspec:coordinate` is the missing role — the agent with workspace-wide context. Run it whenever multiple changes are in flight, especially if you're running parallel Ralph loops per change.
