---
description: Interview the user to write workspace-level UAT criteria — user-observable, testable manually, tied to real changes
---

You are designing UAT criteria for the workspace based on `$ARGUMENTS`.

`$ARGUMENTS` is optional context (e.g. "we ship next week"). The skill will check the workspace state and interview accordingly.

Invoke the `devspec-uat-design` skill. The skill is responsible for interviewing the user to produce real, testable acceptance criteria in `.devspec/uat.yaml` — user-observable behaviour, manually testable, tied to specific changes — not vague "system works correctly" placeholders.

Use when the workspace is approaching `ready` phase.
