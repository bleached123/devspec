---
name: devspec-archive
description: Archive a completed DevSpec change with precondition checks. Use when the user says "archive", "close out", "this change is done", or invokes `/devspec:archive <slug>`. Thin wrapper around `devspec archive <slug>` — verifies all stages done, coherence clean, and pending capability deltas are addressed (synced or `--no-sync` consented). Asks for explicit confirmation; does NOT auto-archive.
---

You are archiving a DevSpec change. Your job is mechanical: check preconditions, get one explicit confirmation, run the CLI, report. No interview, no rumination — this is not an interactive workflow.

## Step 0 — Pick the change

If `$ARGUMENTS` is a slug, use it. Otherwise:

1. Run `devspec status --json`. List active changes.
2. If one is active, auto-pick. If multiple, prompt via `AskUserQuestion`. If zero, say "no active changes" and stop.

## Step 1 — Check preconditions

Run these checks in order. On the FIRST failure, surface it and stop (do not chain to subsequent checks):

1. **Stages all done** — parse `devspec status --json` for the slug. If any stage is not `"done"`, list which ones and stop with: `Cannot archive — incomplete stages: <list>. Run /devspec:continue <slug> to advance them.`

2. **Coherence clean** — run `devspec coherence <slug> --json`. If `blockingCount > 0`, list the blocking findings and stop with: `Cannot archive — <N> blocking drift(s). Run /devspec:verify <slug> to see details.`

3. **Capability deltas** — run `devspec specs status <slug> --json`. If the change has any `pending` deltas (not yet synced):
   - Use **AskUserQuestion** to ask: "This change has pending capability deltas (`<list>`). Sync them into the main capability specs as part of archive, or pass `--no-sync` to discard them?"
   - Options:
     - **Sync and archive** (default) — invoke archive without `--no-sync`; deltas merge into main specs.
     - **Discard deltas (--no-sync)** — invoke archive with `--no-sync`; deltas are archived alongside the change but never merged.
   - Record the choice for Step 3.

## Step 2 — Confirm

Use **AskUserQuestion** for one final yes/no:

> "Archive change `<slug>`? <state summary>"

State summary should be one line, e.g.:
- "All stages done, coherence clean, 0 deltas."
- "All stages done, coherence clean, 2 deltas will be synced."
- "All stages done, coherence clean, 2 deltas will be discarded (--no-sync)."

If the user declines, print `Archive cancelled.` and stop.

## Step 3 — Run the CLI

Run:

```
devspec archive <slug>           # default
devspec archive <slug> --no-sync  # if user chose discard
```

Report the result verbatim. If non-zero exit, surface the error.

## Step 4 — Suggest next action

After successful archive:

```
✓ Archived "<slug>" → .devspec/archive/<slug>/
```

If there are other active changes, suggest one based on `devspec status --json` (the one with highest doneStages count, or the most recently modified). If none, suggest `/devspec:new` to start the next one.

## Guardrails

- **Do NOT skip precondition checks**. Even if the user is impatient, the checks exist to prevent silent data loss.
- **Do NOT use `--force` on archive** to bypass the incomplete-stages check unless the user explicitly asks for it AND understands the consequence (the archived change will be missing stage content).
- **Do NOT auto-pick `--no-sync`**. The default behaviour is sync; `--no-sync` requires explicit user consent.
- **Do NOT loop**. One archive = one invocation.
- **Do not chain into `/devspec:new`**. Suggest it; let the user decide.
