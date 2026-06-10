---
description: Run ONE iteration of the DevSpec Ralph loop for a change (use with /loop)
---

You are running ONE iteration of the DevSpec Ralph loop for change `$ARGUMENTS`.

If `$ARGUMENTS` is empty, ask the user which change to iterate on (run `ls .devspec/projects/`) and stop.

One iteration = pick the next pending task, implement just enough to pass it, mark it complete, then run a separate reviewer subagent for a PR-style verification.

Each subagent runs in isolated context. Workspace standards are preloaded via CLAUDE.md, so subagents must NOT re-read `standards.md`.

## Step 1 — Spawn the implementer

Use the **Agent tool** with `subagent_type: "general-purpose"`, `description: "DevSpec iteration"`, and the prompt below (substitute `<SLUG>` with `$ARGUMENTS`).

The prompt is intentionally stable across iterations so that automatic prompt caching kicks in within the 5-minute TTL — keep it byte-identical on each fire.

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

   IMPORTANT: when running language-specific build or test commands (e.g. `cargo test`, `dotnet build`, `pytest`, `npm test`), invoke them via `devspec run <cmd>`. This auto-containerizes if the workspace has a Dockerfile + docker-compose.yml (created by `devspec env generate`) and falls back to local execution otherwise — ensuring "works on my machine" cannot happen between iterations.

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

- **`task-done`**: print `✓ <task_completed> (retries: <N>)`. Then run **Step 2a**.
- **`stage-complete`**: `devspec advance $ARGUMENTS <stage_advanced>`. Stop.
- **`all-done`**: print `🎉 All stages done for $ARGUMENTS — stop the /loop.` Stop.
- **`needs-input`**: see Step 3.

## Step 2a — Post-task review

A separate reviewer subagent verifies what was just written. Same caching rule: keep the prompt byte-identical across iterations.

Use the **Agent tool** with `subagent_type: "general-purpose"`, `description: "DevSpec post-task review"`, and (substitute `<SLUG>`):

```
You are a strict, fair code reviewer for change "<SLUG>". You have ZERO memory of how the code was written.

Standards for this workspace are already in your CLAUDE.md context. Do NOT read `.devspec/standards/standards.md`.

CONTEXT BUDGET: stay under ~25K input tokens. Read only what this prompt names.

## Required reads
1. `.devspec/projects/<SLUG>/contract.md`
2. `devspec coherence <SLUG> --json` — to find which test names are in source

## Capability-spec awareness (when the change has deltas)

If `ls .devspec/projects/<SLUG>/deltas` shows any subdirectories, this change deltas one or more living capability specs:

3. Run `devspec specs sync <SLUG> --dry-run --json`. Parse.
4. For each `results[]` entry with `status: "validated"`, the `preview` field is the post-merge content of `.devspec/specs/<capability>/spec.md`. Use that as the source of truth for "what the capability promises after this change merges" — NOT the pre-merge file on disk.
5. If ANY entry has `status: "error"`, do NOT proceed with the review. Return exactly one finding: `{"file": null, "line": null, "severity": "block", "category": "spec-match", "message": "Capability deltas fail validation: <errors>"}` with verdict `request-changes`.

When checking spec-match, compare implementation against the merged preview's MODIFIED requirements bodies, not the pre-merge bodies.

Skip this section if there is no `deltas/` subdirectory.

## Conditional read
Read `.devspec/projects/<SLUG>/design.md` ONLY if your draft findings include a `design-intent` category comment. Most reviews don't need it.

## Find the implementation
For each test in the contract's ```yaml tests block: project the name (snake_case for Rust, PascalCase for .NET), grep source, read the file. Read AT MOST 6 files.

## Review checklist
1. Spec match — does code do what contract specifies?
2. Test integrity — do tests assert `then`, or pass trivially (`assert!(true)`, etc.)?
3. Standards — naming, layering, error handling (from your CLAUDE.md context)
4. Coverage gaps — uncovered cases the contract called out
5. Design intent — only if you read design.md
6. Coding principles — KISS (unnecessary complexity), DRY (duplication in 3+ places), YAGNI (speculative code), Boy Scout Rule
7. Philosophy (from your CLAUDE.md context):
   - **Walking skeleton** — if this is the FIRST change in the workspace (check `ls .devspec/projects/`), does the change ship a thin end-to-end slice (infra → data → backend → frontend if any → CI → deploy), or does it dive into feature depth before the skeleton exists? Flag the latter.
   - **Dependency cost** — does the diff add new dependencies (package.json, *.csproj `PackageReference`, Cargo.toml, requirements/uv.lock, go.mod)? Each must be documented in `design.md` with license + last-release + why-over-alternatives. Paid/commercial deps without explicit user escalation are `block`.
8. Security — hardcoded secrets, concatenated SQL/shell, `Math.random()` for tokens, custom crypto, MD5/SHA-1 for passwords, missing input validation, secrets in logs
9. Warnings-as-errors hygiene — code introducing `#pragma warning disable`, `#[allow]`, `eslint-disable`, `# noqa`, `// @ts-ignore`, or `<!-- svelte-ignore -->` without a `// reason:` comment AND an issue link

Findings under 6 and 7 use category `principles`. Findings under 8 use category `security`. Hardcoded secrets, SQL concatenation, custom crypto, weak password hashing, AND undocumented paid commercial dependencies are ALWAYS `block` regardless of phase.

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

`verdict`: `approve` (no block/warn), `request-changes` (≥1 block), else `comment`.

DO NOT modify files. DO NOT run tests. DO NOT propose patches inline.
```

After the reviewer returns:

- **`approve`** — print `   ✓ review: approved · ${summary}`. Stop.
- **`comment`** — print summary + warn/info comments. Stop.
- **`request-changes`** — escalate. Call `AskUserQuestion` with ONE question per block comment (max 4):
  - `question`: "Reviewer blocked: <comment.message>"
  - `header`: `review`
  - `options`:
    - `{"label": "Roll back and let next iteration retry", "description": "Worker tries this task again with review feedback as context"}`
    - `{"label": "Accept and continue anyway", "description": "Override reviewer; block stays as known issue"}`
    - `{"label": "Pause loop, inspect manually", "description": "Stop /loop; user will fix and resume"}`

  Record via `devspec log $ARGUMENTS "<chosen label>" --rule review-blocked`. Stop.

## Step 3 — Escalation handling (for `needs-input`)

The result has a `questions` array.

1. Call `AskUserQuestion` with up to 4 questions batched. For each: rephrase `summary` as a question, header = `<rule>` (≤12 chars), options as-is.

2. For each answered question: `devspec log $ARGUMENTS "<chosen label>" --rule <rule>`.

3. Spawn a fresh Agent (`subagent_type: "general-purpose"`, `description: "Apply DevSpec remediation"`):

   ```
   Apply chosen remediations for change "$ARGUMENTS". For each item, edit the relevant doc/source to implement the choice exactly. Do NOT do other work. Do NOT run tests or coherence.

   Remediations:
   - rule: <rule>, drift: <summary>
     chosen: <label>
     do: <description>
   - (...)

   Reply with: { "applied": <count> }
   ```

4. Stop. /loop fires the next iteration with corrections applied.

## Guardrails

- ONE iteration per invocation. Never loop here — `/loop` is the loop.
- Never modify spec docs (`contract.md`, `tests` YAML block, `design.md`) outside Step 3 remediations.
- The worker must never modify test source files. Only implementation files.

## Prerequisites

- `devspec` on PATH (`npm link` from the DevSpec repo).
- Target workspace has `.devspec/` and at least one change.
- **CLAUDE.md exists** — run `devspec claude` to generate it. This is what preloads standards for subagents and saves tokens.

## How to use

```
/loop /devspec:iterate add-bookings
```

Interrupt `/loop` when you see `🎉 All stages done`.
