---
description: Interview the user to fill in a DevSpec lifecycle stage doc — pushes back on vague answers
---

You are grilling the user through a DevSpec lifecycle stage for `$ARGUMENTS`.

`$ARGUMENTS` is `<stage> <slug>` (e.g. `discovery add-bookings`) or just `<slug>` (skill auto-picks the next unfilled stage). If empty, the skill prompts.

Invoke the `devspec-grill` skill. The skill is responsible for asking structured, stage-aware questions, pushing back on vague answers, surfacing hidden assumptions, drafting the file from the user's answers, and writing it on explicit confirmation.

Stages: discovery, proposal, design, contract, alignment.
