---
description: Merge a change's pending capability-spec deltas into the workspace's living capability specs, with preview and confirmation
---

You are running an explicit sync of capability-spec deltas for `$ARGUMENTS`.

Invoke the `devspec-sync` skill. Pass the slug (the first whitespace-delimited token of `$ARGUMENTS`) to the skill if non-empty. If `$ARGUMENTS` is empty, let the skill pick the change interactively (it will check `devspec specs status --json` for changes with pending deltas).

The skill is responsible for:

1. Choosing the change (from argument, single-candidate auto-pick, or user prompt)
2. Running `devspec specs sync <slug> --dry-run --json` for validation + preview
3. Aborting if any capability returns errors (and showing them to the user)
4. Summarising the delta shape (added / modified / removed counts per capability)
5. Asking for confirmation — extra emphasis when MODIFIED or REMOVED blocks are present
6. Running `devspec specs sync <slug>` to apply the merge
7. Reporting per-capability results
8. Suggesting a next action (continue work, archive when done)

The skill never edits delta files. The user owns delta content.

If the workspace has no pending deltas at all, the skill prints a "nothing to sync" message and stops.
