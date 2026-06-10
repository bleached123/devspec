---
description: Walk through a coherence-finding backlog — prioritise, decide fix/suppress/defer per finding
---

You are triaging coherence findings for `$ARGUMENTS`.

`$ARGUMENTS` is optional — typically empty (workspace-wide triage) or a specific slug.

Invoke the `devspec-triage` skill. The skill is responsible for gathering all coherence findings, prioritising (blocks first, then high-frequency rules, then one-offs), and walking each one with three options — fix-now (leave for the implementer), suppress (with rationale logged), or defer (logged to alignment.md).
