---
name: devspec-sync
description: Merge a change's pending capability-spec deltas into the workspace's living capability specs. Use when the user runs `/devspec-sync`, mentions "sync the deltas", or finishes editing `.devspec/projects/<slug>/deltas/<cap>/spec.md` and wants the changes reflected in `.devspec/specs/<cap>/spec.md`. Always previews via dry-run, asks for confirmation when MODIFIED/REMOVED blocks are present, then applies.
---

You are running an explicit sync of capability-spec deltas. Your job is to (a) find the pending deltas, (b) preview the merge, (c) confirm with the user when there is destructive risk, (d) apply the merge.

You do NOT edit delta files yourself. The deltas are written by the user (or by another DevSpec skill). You only orchestrate sync.

## Step 0 — Pick the change

If the user gave a slug as an argument, use it.

Otherwise:
1. Run `devspec specs status --json` to get all changes with pending deltas.
2. If exactly one change has pending deltas, use it without asking.
3. If multiple, use the **AskUserQuestion tool** to let the user pick one.
4. If zero changes have pending deltas, print `No pending deltas across the workspace.` and stop.

State the chosen change clearly: `Syncing capability deltas for "<slug>".`

## Step 1 — Preview

Run:

```
devspec specs sync <slug> --dry-run --json
```

Parse the JSON. For each capability result:

- If `status === "validated"`, the preview is in `preview`.
- If `status === "error"`, the errors are in `errors`.

**If any capability has errors**: stop. Show the user the errors verbatim (capability name + each error message). Suggest fixes (edit the delta to match the existing requirement name, or use ADDED/MODIFIED appropriately). Do NOT continue to apply.

**If all capabilities validated cleanly**: continue.

## Step 2 — Show the preview + classify risk

For each capability, parse the corresponding delta file at `.devspec/projects/<slug>/deltas/<capability>/spec.md` and count:

- `addedCount` — number of `### Requirement:` headings under `## ADDED Requirements`
- `modifiedCount` — under `## MODIFIED Requirements`
- `removedCount` — under `## REMOVED Requirements`

Render a summary to the user:

```
Will sync <N> capabilities for <slug>:
  <cap-1>: +<addedCount> ~<modifiedCount> -<removedCount>
  <cap-2>: ...
```

Then print the dry-run preview for each capability (collapsed if very long — show first/last ~20 lines and `...` in the middle, but offer to print full).

## Step 3 — Confirm

Use the **AskUserQuestion tool** to confirm before applying. Tailor the question to the risk:

- **Low risk** (only ADDED across all capabilities): "Apply this sync? (additive only)"
- **Medium risk** (MODIFIED present): "Apply this sync? It will modify existing requirements: <list of MODIFIED requirement names>."
- **High risk** (REMOVED present): "Apply this sync? It will REMOVE existing requirements: <list of REMOVED requirement names>. This is destructive."

Default option label: "Apply the sync". Second option: "Cancel — don't apply yet".

If the user cancels, print `Sync cancelled. Deltas left as-is.` and stop.

## Step 4 — Apply

Run:

```
devspec specs sync <slug> --json
```

Parse the JSON result. Report per capability:

- `synced` → `✓ <capability>`
- `error` → `✗ <capability>: <error.message>` (this should be rare because step 1 already validated; flag as a race condition if it happens)

If any capability errored after step 1 succeeded, suggest the user run `devspec specs status <slug>` to see what's still pending, then try again.

## Step 5 — Next-action hint

After successful apply:

- If the change has any pending work (incomplete stages, drift, etc.), suggest `devspec status <slug>` to see what's next.
- If the change appears complete (all stages done, coherence clean), suggest `/devspec-archive <slug>` (or `devspec archive <slug>` if no slash command yet) to close it out.

You do NOT auto-invoke other skills. You just suggest.

## What you don't do

- Edit delta files (the user owns the content)
- Initialise new capabilities (use `devspec specs init <name>` — separate concern)
- Sync without preview (always dry-run first)
- Apply silently when MODIFIED or REMOVED blocks are present (always confirm)
