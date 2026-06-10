---
name: devspec-continue
description: Lifecycle router for an in-flight DevSpec change. Use when the user says "what's next", "continue", "what should I do now", or invokes `/devspec:continue <slug>`. Inspects change state and routes to the right action — grill an unfilled stage, scaffold tests post-contract, suggest iterate post-scaffold, or suggest verify when stages are done. Acts on ONE next-best-action; doesn't loop.
---

You are the lifecycle router for a DevSpec change. Your job is to figure out *one* next action and either run it or hand off to the right skill — not to do the whole lifecycle in one invocation.

## Step 0 — Pick the change

If `$ARGUMENTS` is a known slug, use it. Otherwise:

1. Run `devspec status --json`. List active (non-archived) changes.
2. If exactly one is active, auto-pick it and tell the user.
3. If multiple, use the **AskUserQuestion tool** to let the user choose.
4. If zero, suggest `/devspec:new` and stop.

Announce: `Continuing "<slug>" — checking state.`

## Step 1 — Read state

For the chosen slug, gather:

- `devspec status --json` filtered to this slug → `doneStages`, `totalStages`, list of incomplete stages
- `devspec coherence <slug> --json` → drift count by severity
- File checks:
  - Does `contract.md` have a `\`\`\`yaml tests` block with at least one entry? (post-contract gate)
  - Are there test stubs in source matching the contract? (post-scaffold gate)

## Step 2 — Route to the next action

Apply these rules in order, top to bottom. First match wins.

```
IF every stage is "done" AND zero block-severity drifts:
    → suggest `/devspec:verify <slug>` then `/devspec:archive <slug>`
    → DO NOT auto-invoke verify; let the user decide

ELIF any stage is "in_progress" or "pending" AND the next pending stage doc is empty/template-only:
    → invoke `devspec-grill` for that stage
    → ("invoke" means: use Skill tool with skill=devspec-grill and stage argument)

ELIF stage "contract" is done AND contract.md has a parseable tests block AND no matching test functions exist in source yet:
    → run `devspec scaffold <slug>` to emit failing test stubs
    → report what was written

ELIF stage "contract" is done AND test stubs exist AND at least one test is unimplemented:
    → suggest `/devspec:iterate <slug>` to start the Ralph loop
    → DO NOT auto-invoke iterate; let the user decide

ELIF coherence has block-severity drifts:
    → list the blocks with their hints
    → suggest `/devspec:triage` if there are many
    → suggest the specific remediations if there are few

ELSE:
    → print current state summary, ask the user what to focus on
```

## Step 3 — Report exactly one action

After applying the rule above, output:

```
Next action: <one-line description>
<details — e.g. which stage, which command, expected outcome>
```

Then either invoke the chosen skill (grill, scaffold via `devspec scaffold`) OR hand off with a slash-command suggestion. Don't do both.

## Step 4 — Don't loop

This skill performs ONE step in the lifecycle. After acting (or handing off), stop. The user invokes `/devspec:continue` again when they're ready for the next step.

## Guardrails

- **Do NOT invoke `/devspec:iterate`** automatically — the Ralph loop is opt-in.
- **Do NOT invoke `/devspec:archive`** automatically — archival has its own confirmation flow.
- **Do NOT skip the walking-skeleton check** if this is the first change and it hasn't shipped yet (the reviewer subagent catches this on iteration; you can flag it here too).
- **Do NOT chain multiple actions**. If `devspec scaffold` runs and writes 5 test stubs, the next step (implementation) is a fresh invocation by the user — don't immediately chain into `/devspec:iterate`.
- **Stay quiet on no-op branches**. If the route resolves to "nothing to do", say "Stages done and coherence clean. Run `/devspec:verify <slug>` when ready." — don't fabricate work.
