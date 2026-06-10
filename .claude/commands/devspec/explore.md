---
description: Enter exploration mode for DevSpec — thinking partner before committing to a change
---

You are entering DevSpec exploration mode for `$ARGUMENTS`.

`$ARGUMENTS` is the topic to think about (free-form text). If empty, ask the user what they want to explore in one sentence and then begin.

Invoke the `devspec-explore` skill. The skill is responsible for:

1. Detecting which shape of exploration is in play (pre-change idea, mid-change rethink, architectural decision, or sanity check)
2. Gathering just enough context (at most ~4 files) to be useful
3. Acting as a thinking partner — surfacing assumptions, sketching options, asking clarifying questions
4. Offering a transition (`/devspec:new`, `/devspec:continue`, or "no artifact needed") when clarity emerges — but never forcing termination

Exploration writes no files. It runs no state-mutating CLI commands. The user owns the conclusion; the skill provides structure and friction.
