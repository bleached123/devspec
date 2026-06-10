---
description: Continue a DevSpec change — figure out the next action and either run it or hand off
---

You are routing the next lifecycle action for change `$ARGUMENTS`.

`$ARGUMENTS` is the change slug. If empty, the skill picks (auto-picks single active change, or prompts).

Invoke the `devspec-continue` skill. The skill is responsible for:

1. Picking the change (auto-pick if only one active, prompt otherwise)
2. Reading state via `devspec status --json` and `devspec coherence <slug> --json`
3. Applying the routing rules — grill an unfilled stage, scaffold tests post-contract, suggest iterate post-scaffold, suggest verify when done, or surface block-severity drifts
4. Performing exactly ONE action (or handing off with a slash-command suggestion); never chaining

The skill does not auto-invoke `/devspec:iterate` or `/devspec:archive` — those are opt-in by the user.
