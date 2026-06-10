---
name: devspec-verify
description: Coherence gate before archiving a DevSpec change. Use when the user says "verify", "ready to archive", "any drift?", "check this change", or invokes `/devspec:verify <slug>`. Runs `devspec coherence <slug>` (per-change + workspace-level), reports findings grouped by severity, and suggests `/devspec:archive <slug>` only when zero block-severity drifts remain.
---

You are running the coherence gate for a DevSpec change. Your job is to (a) run the check, (b) present the result in human terms, (c) gate the suggested next action of "archive" on the result.

## Step 0 — Pick the change

If `$ARGUMENTS` is a slug, use it. Otherwise:

1. Run `devspec status --json`. List active changes.
2. If one active, auto-pick. If multiple, ask via `AskUserQuestion`. If zero, say "no active changes to verify" and stop.

Announce: `Verifying "<slug>".`

## Step 1 — Run coherence

Run `devspec coherence <slug> --json`. Parse the result. Capture:

- `blockingCount` (number)
- `warningCount` (number)
- `drifts` (array)
- `ignoredRules` (array)

If the command exits non-zero AND `blockingCount` is zero, something is wrong with the workspace — surface the raw error and stop.

## Step 2 — Report findings grouped by severity

For each drift, group by severity (block first, then warn). Print:

```
[BLOCK]  <rule> — <message>
  hint: <hint>
  remediations:
    1. <option>
    2. <option>
```

If `ignoredRules` is non-empty, print at the end:

```
Suppressed via doc markers: <comma-separated rule names>
```

Print a one-line summary: `<N> blocking, <M> warning, <K> ignored.`

## Step 3 — Decide what to suggest

Three cases:

- **Zero blocks, zero warnings**: clean. Print `✓ Change "<slug>" is coherence-clean.` and suggest `/devspec:archive <slug>` as the next action.
- **Zero blocks, non-zero warnings**: shippable but flagged. Print `Change "<slug>" has <M> warning(s) — review before archive.` and suggest the user either address the warnings or proceed (warnings don't block archive unless in production phase).
- **Non-zero blocks**: blocked. Print `Change "<slug>" has <N> blocking drift(s). Cannot archive yet.` and list specific next actions per drift (use the `remediations` array from the JSON when present). Suggest `/devspec:triage` if more than 5 findings total.

## Step 4 — Hand off, don't act

This skill REPORTS. It does not run `devspec archive`, modify any files, or suppress drift markers. The user takes the next action.

## Guardrails

- **Do NOT auto-invoke `/devspec:archive`** even when verification is clean. The archive flow has its own confirmation; the user explicitly decides.
- **Do NOT suppress drifts** as part of verify. If the user wants suppression, that's a separate action via `/devspec:triage`.
- **Do NOT re-run coherence** in a loop. One verify invocation = one coherence run.
- **Workspace-level findings are real findings**. If `requirement-conflict` shows up, report it like any other block-severity drift — the cross-change context is informative but the action is "fix the conflict", same as a per-change block.
- If the workspace is in production phase (strict mode), warnings show as blocks in the JSON output already; report them as such.
