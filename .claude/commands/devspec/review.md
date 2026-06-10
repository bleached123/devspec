---
description: PR-review the implementation of a change against its spec, in a fresh subagent
---

You are running a code review for change `$ARGUMENTS`.

If `$ARGUMENTS` is empty, list available changes (`ls .devspec/projects/`) and ask the user which to review. Stop.

The review runs in a **fresh subagent context** so the reviewer has zero memory of how the code was written. Standards are preloaded via CLAUDE.md, so the reviewer must NOT re-read them.

## Step 1 — Spawn the reviewer subagent

Use the **Agent tool** with `subagent_type: "general-purpose"`, `description: "DevSpec code review"`, and the prompt below (substitute `<SLUG>` with `$ARGUMENTS`).

The prompt is byte-stable across invocations so automatic prompt caching can hit within the 5-minute TTL.

```
You are a strict, fair code reviewer for change "<SLUG>". You have ZERO memory of how the implementation was written. Verify the code faithfully realises the spec.

Standards for this workspace are already in your CLAUDE.md context. Do NOT read `.devspec/standards/standards.md`.

CONTEXT BUDGET: stay under ~25K input tokens. Read only what this prompt names.

## Required reads
1. `.devspec/projects/<SLUG>/contract.md`
2. `devspec coherence <SLUG> --json` — to find which test names are in source

## Capability-spec awareness (when the change has deltas)

Check whether the change has a `deltas/` subdirectory by running `ls .devspec/projects/<SLUG>/deltas` (or list via Read tool). If it exists:

3. Run `devspec specs sync <SLUG> --dry-run --json` and parse the JSON.
   - For each entry in `results` with `status: "validated"`, the `preview` field is the post-merge content of `.devspec/specs/<capability>/spec.md`. Treat THIS preview as the spec of record for "what the capability promises after this change merges" — NOT the current on-disk capability spec.
   - If ANY entry has `status: "error"`, do NOT proceed with line-by-line review. Emit exactly one finding: `{"file": null, "line": null, "severity": "block", "category": "spec-match", "message": "Capability deltas fail validation: <errors>"}` and return verdict `request-changes`.
4. When checking spec-match in the review, compare implementation against the merged preview's requirements — a MODIFIED requirement should have implementation reflecting the NEW body.

If the change has no `deltas/` subdirectory, skip this section.

## Conditional read
Read `.devspec/projects/<SLUG>/design.md` ONLY if your draft findings include a `design-intent` category comment. Most reviews don't need it.

## Find the implementation
For each test in the contract's ```yaml tests block: project the name (snake_case for Rust, PascalCase for .NET), grep source, read the file. Read AT MOST 6 files.

If you need to execute any language-specific command (e.g. to verify a finding), invoke it via `devspec run <cmd>` so it runs in the workspace's container when configured.

## Review checklist
1. Spec match — does code do what contract specifies?
2. Test integrity — do tests assert the `then` clause, or pass trivially?
3. Standards — naming, layering, error handling (from your CLAUDE.md context)
4. Coverage gaps — uncovered cases the contract called out
5. Design intent — only if you read design.md
6. Coding principles — KISS (unnecessary complexity), DRY (duplication in 3+ places), YAGNI (speculative code), Boy Scout Rule
7. Security — hardcoded secrets, concatenated SQL/shell, `Math.random()` for tokens, custom crypto, MD5/SHA-1 for passwords, missing input validation, secrets in logs
8. Warnings-as-errors hygiene — code introducing `#pragma warning disable`, `#[allow]`, `eslint-disable`, `# noqa`, `// @ts-ignore`, or `<!-- svelte-ignore -->` without a `// reason:` comment AND an issue link

Findings under 6 use category `principles`. Findings under 7 use category `security`. Hardcoded secrets, SQL concatenation, custom crypto, and weak password hashing are ALWAYS `block` regardless of phase.

## Return one JSON object (no prose, no markdown fence):
{
  "summary": "<2-3 sentences>",
  "files_reviewed": ["<paths>"],
  "comments": [
    {"file": "<path>", "line": <number|null>, "severity": "block"|"warn"|"info",
     "category": "spec-match"|"test-integrity"|"standards"|"coverage"|"design-intent"|"principles"|"security",
     "message": "<actionable feedback citing the contract/standards line that informed it>"}
  ],
  "verdict": "approve" | "request-changes" | "comment"
}

`verdict`: `approve` (no block/warn), `request-changes` (≥1 block), else `comment`.

DO NOT modify any files. DO NOT run tests. DO NOT propose patches inline — describe what needs to change and where.
```

## Step 2 — Render the review

Parse the JSON and print:

1. **Header**: verdict tag + summary
   - `✓ APPROVE` (green) for approve
   - `⚠ REQUEST CHANGES` (red) for request-changes
   - `· COMMENT` (yellow) for comment
2. **Files reviewed**: dim list
3. **Comments grouped by severity** in this order: `block`, `warn`, `info`:
   ```
   [SEVERITY]  category  file:line
              message
   ```
4. **Footer**: count by severity (e.g. `2 block, 1 warn, 3 info — 4 files reviewed`).

If `comments` is empty: print "Review found nothing to flag."

## Guardrails

- ONE review per invocation. Never loop.
- The reviewer subagent must not edit files. If it makes Write/Edit calls on source, report as protocol violation.
- If the reviewer returns invalid JSON, print the raw output and stop.

## Prerequisites

- `devspec` on PATH.
- **CLAUDE.md exists** — run `devspec claude` to generate it. This is what preloads standards for the reviewer and saves tokens per invocation.

## Usage

```
/devspec:review add-bookings
```

Also invoked automatically by `/devspec:iterate` as a post-step after each `task-done`. When run there, blocking comments escalate to a user question rather than being printed.
