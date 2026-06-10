---
name: devspec-uat-design
description: Interview the user to write workspace-level UAT (user acceptance test) criteria. Use when the user is approaching the `ready` phase and needs to define what "production ready" actually means, runs `devspec uat init` and stares at a blank file, or asks for help writing acceptance criteria. Produces criteria that are user-observable, testable manually, and tied to real changes — not vague "system works correctly" placeholders.
---

You are helping the user design UAT criteria for `.devspec/uat.yaml`. UAT criteria are the FINAL gate before declaring `phase: production`. Bad criteria mean shipping broken software. Good criteria mean a non-engineer stakeholder can validate the system works.

## Step 0 — Detect state

Read `.devspec/devspec.yaml` to confirm a workspace exists. If not, stop and direct the user to `devspec-onboard` first.

Check if `.devspec/uat.yaml` exists:
- **Doesn't exist** → run `devspec uat init` to scaffold it, then proceed.
- **Exists** → read it. If it has only the starter placeholder criterion (name "Replace with a user-facing outcome"), proceed. Otherwise, ask the user: "uat.yaml already has N real criteria. Want to add more, or revise the existing ones?"

## Step 1 — Set the bar

UAT criteria must be:

1. **User-observable** — describes what a user/stakeholder would see, not what the code does internally
2. **Manually validatable** — a human could test it without writing more code
3. **Specific** — names a concrete outcome, not "system works"
4. **Tied to a change (or explicitly cross-cutting)** — links to one or more change slugs from `.devspec/projects/`

A bad criterion: `"All endpoints return 200"` (not user-observable, vague, not tied to a change)

A good criterion: `"A customer can create a booking, receive a confirmation email, and see it in their bookings list within 30 seconds of submitting"` (user-observable, validatable manually, specific, ties to add-bookings)

State this up front so the user knows what we're aiming for.

## Step 2 — Discover the user-observable outcomes

Run `devspec status --json` and list the active changes back to the user:

> "Your workspace has these changes in flight: [list]. For each, what's the user-observable outcome that would tell you it's working in production?"

Wait. Let them answer change by change. If they say "all of them work" — push back: name ONE outcome per change.

## Step 3 — For each change, ask the four UAT questions

Once they name an outcome, ask in turn:

1. **What action does the user take?** (the precise interaction that triggers the behaviour)
2. **What do they see, in their own terms?** (the observable result — UI, email, response)
3. **How would you validate this RIGHT NOW, with no code?** (the test recipe)
4. **What's the smallest thing that could go wrong but still pass a unit test?** (the failure case UAT catches)

If the user's answer to Q3 is "I'd write a test", that's not UAT — that's a contract test. Push back: "I mean a human, no test runner, manually validating. How?"

If Q4 has no answer, the criterion may be redundant with contract tests. Note it but don't reject — sometimes redundancy is intentional.

## Step 4 — Optional: cross-cutting criteria

After all changes have outcomes, ask:

> "Anything that ISN'T tied to a single change but matters for production? Examples: performance under load, response times, security checks, accessibility, data integrity after restart."

Capture as cross-cutting criteria with `linked_changes: []`.

Cap at 2–3 cross-cutting criteria. Past that, you're scope-creeping.

## Step 5 — Draft uat.yaml

Build the YAML structure. For each criterion:

```yaml
- name: <one-line user-facing outcome>
  description: |
    <2–4 sentences from the user's answers to questions 1–3>
    Failure mode caught: <answer to Q4 if any>
  linked_changes: [<slug>, ...]
  status: pending
  signed_off_by: ""
  signed_off_at: ""
  notes: ""
```

Show the full proposed `criteria:` list to the user. Ask for refinements before writing.

## Step 6 — Write the file

Use the **Write tool** to save `.devspec/uat.yaml` with the criteria array.

Print:
```
Wrote .devspec/uat.yaml with N criteria.

Next:
  devspec uat list                              # see them rendered
  devspec uat pass "<name>" --by <user>         # mark passed when validated
  devspec phase                                 # check what's needed for `uat → production`
```

## Don't do this

- Don't write criteria the user couldn't validate manually — those are contract tests, they belong in contract.md instead
- Don't accept "the system works correctly" or any equivalent vague answer — push for specifics
- Don't produce more than ~5 criteria per change — UAT is the *final* gate, not a full regression suite
- Don't link a criterion to changes the user hasn't named (don't invent ties)
- Don't fill `signed_off_by` or `signed_off_at` — those are for `devspec uat pass`/`fail` to record

## What you write

`.devspec/uat.yaml` — replacing the existing file (or starter content) with the structured criteria.

## When to stop

When you have ≤5 criteria per active change + ≤3 cross-cutting criteria, AND each one passes the four questions above, you're done. Past that you're overengineering the gate.
