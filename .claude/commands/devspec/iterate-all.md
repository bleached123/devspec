---
description: Sequential Ralph loop across multiple active changes — picks one change per iteration by least-recently-iterated, runs the same worker + reviewer flow as /devspec:iterate
---

You are running ONE iteration of the Ralph loop, but selecting which change to work on based on fairness (least-recently-iterated wins). This is the single-window alternative to running parallel `/loop /devspec:iterate <slug>` sessions.

- `$ARGUMENTS` empty → consider all active changes
- `$ARGUMENTS` comma-separated slugs → consider only that subset (e.g. `add-bookings,payment-retries`)

## Step 0 — Pick the next slug

1. Run `devspec status --json`. Parse it.

2. Filter to **candidate changes**:
   - `archived === false`
   - `doneStages < totalStages` (some work remaining)
   - `blockingCount === 0` (not blocked on user input — those need `/devspec:review` or `/devspec:coordinate` first)
   - If `$ARGUMENTS` is non-empty, restrict to that subset

3. If no candidates remain:
   - If ALL active changes have `doneStages === totalStages` → print `🎉 All active changes complete — stop the /loop now.` Stop.
   - If some are blocked → print `All actionable changes are blocked. Run /devspec:coordinate or /devspec:review on the blocked ones. Stop the /loop now.` Stop.

4. Read `.devspec/loop-state.yaml` (if it exists). It looks like:
   ```yaml
   last_iterated_slug: add-bookings
   last_iterated_at: 2026-05-15T14:30:00Z
   iterations:
     add-bookings: 12
     payment-retries: 9
   ```

5. For each candidate, look up `iterations[<slug>]` (default 0 if missing).

6. **Pick** the candidate with the **lowest iteration count**. Tiebreak: alphabetical by slug.

7. **Update the state file** before iterating (so a crash mid-iteration doesn't loop forever on the same slug):
   - Increment `iterations[<picked-slug>]` by 1
   - Set `last_iterated_slug` and `last_iterated_at`
   - Use the **Write tool** to save `.devspec/loop-state.yaml`

8. Print one line: `→ iterating ${slug}  (iteration #${count}; candidates: ${candidates_count})`

The rest of the steps treat the picked slug as `SLUG`.

## Step 1 — Spawn the implementer

Use the **Agent tool** with `subagent_type: "general-purpose"`, `description: "DevSpec rotation iteration"`, and this prompt verbatim (substituting `<SLUG>` with the picked slug):

```
You are a DevSpec Ralph loop worker for change "<SLUG>". Do ONE iteration. Do NOT loop. Return exactly one JSON object as your final message — no prose, no markdown fence.

Standards for this workspace are already in your CLAUDE.md context. Do NOT read `.devspec/standards/standards.md` — use what you already have.

CONTEXT BUDGET: stay under ~25K input tokens. Read only files this prompt names.

## Steps

1. `devspec coherence <SLUG> --json`. Parse.

2. If `blockingCount > 0`:
   { "outcome": "needs-input",
     "questions": [{ "summary": <drift.message>, "rule": <drift.rule>,
       "options": <drift.remediations as [{label, description}]> }]   // max 4
   }

3. `devspec next <SLUG> --json`.

4. If exit code 1 (no pending tasks):
   - Read `.devspec/projects/<SLUG>/status.yaml`. Find the lowest-order pending stage.
   - All done: { "outcome": "all-done" }
   - Else: { "outcome": "stage-complete", "stage_advanced": "<stage>" }

5. Read ONLY:
   - `.devspec/projects/<SLUG>/contract.md`  (API + ```yaml tests block)
   - `.devspec/projects/<SLUG>/design.md`    (only if the task is non-trivial; skip for clear test-to-method mappings)

6. From step 1's coherence JSON, find the first test in `tests-implemented` that is missing or stubbed. That's the test to make pass.

7. Implement just enough source to make ONE test pass. Use the standards from your CLAUDE.md context. Do NOT refactor, do NOT touch any spec doc, do NOT modify tests.

   IMPORTANT: when running language-specific commands (`cargo test`, `dotnet build`, `pytest`, `npm test`), invoke them via `devspec run <cmd>` so they run in the workspace container when configured.

8. `devspec check`. On fail, fix and retry. Max 3 retries.

9. On pass:
   - `devspec complete <SLUG> "<exact task text from devspec next>"`
   - { "outcome": "task-done", "task_completed": "<task>", "retries_used": <N> }

10. After 3 failed retries:
    { "outcome": "needs-input",
      "questions": [{
        "summary": "Could not pass `devspec check` after 3 attempts for: <task>. Last error: <one line>",
        "rule": "check-failure",
        "options": [
          {"label": "Skip and mark done", "description": "Force-complete; coherence will flag missing implementation"},
          {"label": "Pause loop, inspect manually", "description": "Stop /loop; user will investigate"},
          {"label": "Try again with hint from user", "description": "User provides context for a fresh retry"}
        ]
      }]
    }
```

## Step 2 — Handle the JSON result

Branch on `outcome`:

- **`task-done`**: print `✓ ${SLUG}: ${task_completed} (retries: <N>)`. Then run Step 2a.
- **`stage-complete`**: `devspec advance ${SLUG} <stage_advanced>`. Print the result. Stop.
- **`all-done`**: print `🎉 ${SLUG}: all stages done`. Stop. The next rotation picks the next-least-iterated slug.
- **`needs-input`**: see Step 3.

## Step 2a — Post-task review

Spawn the reviewer subagent with `subagent_type: "general-purpose"`, `description: "DevSpec rotation post-task review"`, and (substituting `<SLUG>`):

```
You are a strict, fair code reviewer for change "<SLUG>". You have ZERO memory of how the code was written.

Standards for this workspace are already in your CLAUDE.md context. Do NOT read `.devspec/standards/standards.md`.

CONTEXT BUDGET: stay under ~25K input tokens. Read only what this prompt names.

## Required reads
1. `.devspec/projects/<SLUG>/contract.md`
2. `devspec coherence <SLUG> --json` — to find which test names are in source

## Conditional read
Read `.devspec/projects/<SLUG>/design.md` ONLY if your draft findings include a `design-intent` category comment.

## Find the implementation
For each test in the contract's ```yaml tests block: project the name (snake_case for Rust, PascalCase for .NET), grep source, read the file. Read AT MOST 6 files.

## Review checklist
1. Spec match — does code do what contract specifies?
2. Test integrity — do tests assert `then`, or pass trivially?
3. Standards — naming, layering, error handling (from your CLAUDE.md context)
4. Coverage gaps — uncovered cases the contract called out
5. Design intent — only if you read design.md
6. Coding principles — KISS, DRY (3+ places), YAGNI, Boy Scout
7. Philosophy (CLAUDE.md):
   - Walking skeleton — if this is the FIRST change in the workspace, does it ship a thin end-to-end slice or dive into feature depth?
   - Dep cost — every new dep documented in `design.md` with license + last release + alternatives; paid commercial deps without explicit user escalation are `block`.
8. Security — hardcoded secrets, SQL/shell concatenation, Math.random() for tokens, custom crypto, weak password hashing, missing input validation, secrets in logs
9. Warnings-as-errors hygiene — new suppression annotations without justification + issue link

Hardcoded secrets, SQL concatenation, custom crypto, weak password hashing, AND undocumented paid commercial deps are ALWAYS `block` regardless of phase.

## Return one JSON object (no prose):
{
  "summary": "<2-3 sentences>",
  "files_reviewed": ["<paths>"],
  "comments": [
    {"file": "<path>", "line": <number|null>, "severity": "block"|"warn"|"info",
     "category": "spec-match"|"test-integrity"|"standards"|"coverage"|"design-intent"|"principles"|"security",
     "message": "<actionable feedback>"}
  ],
  "verdict": "approve" | "request-changes" | "comment"
}

DO NOT modify files. DO NOT propose patches inline.
```

After the reviewer returns:

- **`approve`** — print `   ✓ review: approved · ${summary}`. Stop.
- **`comment`** — print summary + warn/info comments. Stop.
- **`request-changes`** — escalate. Call `AskUserQuestion` with up to 4 block comments:
  - `question`: "Reviewer blocked: <comment.message>"
  - `header`: `review`
  - `options`:
    - `{"label": "Roll back and retry next rotation", "description": "Worker will revisit ${SLUG} when it cycles back"}`
    - `{"label": "Accept and continue rotation", "description": "Override reviewer; block stays as known issue; next rotation picks another change"}`
    - `{"label": "Pause loop, inspect manually", "description": "Stop /loop; user fixes and resumes"}`

  Record via `devspec log ${SLUG} "<chosen label>" --rule review-blocked`. Stop.

## Step 3 — Escalation handling (for `needs-input`)

Same as `/devspec:iterate`'s Step 3:

1. Call `AskUserQuestion` with up to 4 questions batched. For each: rephrase `summary` as a question, header = `<rule>` (≤12 chars), options as-is.

2. For each answered question: `devspec log ${SLUG} "<chosen label>" --rule <rule>`.

3. Spawn a fresh Agent (`subagent_type: "general-purpose"`, `description: "Apply DevSpec remediation"`):

   ```
   Apply chosen remediations for change "${SLUG}". For each item, edit the relevant doc/source to implement the choice exactly. Do NOT do other work. Do NOT run tests or coherence.

   Remediations:
   - rule: <rule>, drift: <summary>
     chosen: <label>
     do: <description>

   Reply with: { "applied": <count> }
   ```

4. Stop. Next rotation picks the next-least-iterated slug.

## Step 4 — Rotation footer

After the iteration finishes (regardless of outcome), print one summary line:

```
↻ rotation: ${this_slug} (#${this_count}) → next likely: ${next_slug} (#${next_count})
```

Where `next_slug` is the OTHER candidate with the lowest iteration count after this run. This tells the user (and the loop) what's coming next, so they can decide to keep going or interrupt.

## Guardrails

- ONE iteration per invocation, ONE slug per invocation. The "rotation" emerges from `/loop` re-firing.
- Never modify spec docs outside the explicit Step 3 remediation flow.
- The worker must never modify test source files. Only implementation files.
- The state file (`.devspec/loop-state.yaml`) is the rotation's only memory. Don't put anything else in it.
- If you find yourself reading more than ~5 files in the worker, you're exploring — stop and re-read this prompt.

## Prerequisites

- `devspec` on PATH (`npm link` from the DevSpec repo after `npm run build`)
- Target workspace has `.devspec/` and at least one active change
- **CLAUDE.md exists** — `devspec init` auto-generates it; re-run `devspec claude` if it's gone

## How to use

```
/loop /devspec:iterate-all                            # rotate across all active changes
/loop /devspec:iterate-all add-bookings,payment-retries  # rotate across a subset
```

Interrupt `/loop` when you see `🎉 All active changes complete` or whenever you want to pause.

## When to use this vs `/devspec:iterate`

- `/devspec:iterate <slug>` — focused work on ONE change. Use when you want to drive a single change to completion.
- `/devspec:iterate-all` — fair rotation across many changes. Use when several are in flight and you want to make balanced progress without managing multiple windows.
- **Parallel `/devspec:iterate` sessions in multiple windows** — fastest wall-clock progress, but watch for file conflicts on shared infrastructure (run `/devspec:coordinate` periodically to catch them).
