---
description: Verify a DevSpec change is coherence-clean before archive
---

You are verifying the coherence of change `$ARGUMENTS`.

`$ARGUMENTS` is the change slug. If empty, the skill auto-picks (single active change) or prompts.

Invoke the `devspec-verify` skill. The skill is responsible for:

1. Picking the change
2. Running `devspec coherence <slug> --json` (which includes per-change AND workspace-level rules)
3. Grouping drifts by severity, listing remediations
4. Suggesting `/devspec:archive <slug>` only when zero block-severity drifts remain — otherwise blocking the archive suggestion and listing specific remediations

The skill reports; it does NOT auto-archive, does NOT suppress drifts, does NOT loop.
