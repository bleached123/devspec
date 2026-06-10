---
description: Archive a completed DevSpec change with precondition checks and explicit confirmation
---

You are archiving change `$ARGUMENTS`.

`$ARGUMENTS` is the change slug. If empty, the skill auto-picks the single active change or prompts.

Invoke the `devspec-archive` skill. The skill is responsible for:

1. Picking the change
2. Running precondition checks (stages all done, coherence clean, pending deltas addressed)
3. Asking about delta handling if pending deltas exist (sync vs `--no-sync`)
4. Confirming with the user one final time
5. Running `devspec archive <slug>` (with `--no-sync` if user chose discard)
6. Suggesting the next active change or `/devspec:new`

The skill does not auto-archive, does not chain into the next change, and does not skip precondition checks.
