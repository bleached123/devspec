---
name: devspec-triage
description: Walk the user through resolving a backlog of coherence findings across one or more changes. Use when `devspec coherence` reports many drifts, the user asks "what should I fix first?", or the workspace has accumulated unaddressed warnings. Prioritises findings (blocks first, then high-frequency rules, then one-offs), proposes a per-finding action (fix / suppress / defer), and applies the chosen actions — adding ignore markers, logging deferrals, leaving fixes to the user.
---

You are triaging coherence findings — turning a noisy report into an ordered, actionable plan. Your job is not to FIX things (the implementer does that). Your job is to (a) prioritise, (b) decide per finding whether to fix-now, suppress, or defer, and (c) record those decisions so the noise becomes signal.

## Step 0 — Gather findings

Run `devspec status --json`. Identify changes with `blockingCount > 0` or `warningCount > 0`.

For each such change, run `devspec coherence <slug> --json` and collect the drifts. Build a flat list of all findings across the workspace, each tagged with its change slug.

If the total is **zero drifts** across all changes: print `No coherence drifts to triage. Workspace is clean.` and stop.

## Step 1 — Categorise

Group findings by severity, then by rule. Compute a summary:

```
N blocking findings, M warning findings across K changes
By rule:
  tests-implemented:         X (blocks)
  api-test-coverage:         Y (warns)
  dry-duplicate-functions:   Z (warns, workspace-wide)
  ...
```

Show this overview to the user up front so they know the shape of the backlog before we dive in.

## Step 2 — Prioritise

Sort findings into three queues, in this order:

1. **Block-severity (always first)** — must be fixed or explicitly forced; suppressing block-level findings without a recorded rationale is a smell. Treat with caution.
2. **High-frequency warnings** — if 1 rule produces ≥5 findings, address it once at the rule level (suppress workspace-wide for *this* change, or commit to fixing all instances).
3. **One-off warnings** — handle individually.

State the order to the user: "I'll walk you through N findings in this order: blocks first (M), then high-frequency rule clusters (P), then individual warns (Q)."

## Step 3 — Walk per finding (or cluster)

For each finding or cluster, present:

```
[SEVERITY]  rule  in <slug>
  message:   <drift.message>
  context:   <drift.hint>
  remediations from the rule:
    1. <option label>
    2. <option label>
    3. <option label>
```

Then ask the user **three options**:

- **Fix now** — leave the finding for the user (or a follow-up agent invocation) to address. Triage doesn't fix code; it organises the queue.
- **Suppress** — add `<!-- devspec:ignore <rule-name> -->` to the most relevant doc of the change. Ask the user WHY before suppressing — record the reason in `alignment.md` via `devspec log`. Don't accept "for now" — push for the actual reason ("intentional design", "scope deferred to next change", "false positive").
- **Defer** — log the finding to alignment.md with a date and note, leave the drift in place. Use this when the user agrees the finding is real but the fix belongs in a later change.

For **block-severity** findings, add a fourth option:
- **Force-acknowledge** — equivalent to suppress, but requires an explicit reason AND adds a `BLOCK ACKNOWLEDGED:` line to alignment.md so it's visible at review time. Only allow this when the user types a justification of ≥10 words.

## Step 4 — Apply actions

For each finding the user marked **Suppress**:
1. Identify which doc in the change is most relevant to the rule (e.g. `task-granularity` → `tasks.md`, `goal-coverage` → `design.md`, `dry-duplicate-functions` → any doc in any affected change — pick the change with the highest finding count).
2. Use the **Edit tool** to add `<!-- devspec:ignore <rule-name> -->` at the top of that doc.
3. Run `devspec log <slug> "Suppressed <rule>: <user's reason>" --rule triage-suppress`.

For each finding the user marked **Defer**:
1. Run `devspec log <slug> "Deferred <rule>: <user's reason>. Re-check by: <user-named milestone or date>" --rule triage-defer`.

For findings marked **Fix now**: do nothing — leave for the user to address. Record at the end (Step 5).

For block-severity **Force-acknowledge**: same as Suppress, but the log entry starts with `BLOCK ACKNOWLEDGED:`.

## Step 5 — Final summary

After walking all findings, print:

```
Triage complete.
  Fixed in this session:   0  (triage doesn't fix; address these next)
  Suppressed:              X  (ignore markers added; reasons logged)
  Deferred:                Y  (logged to alignment.md; drift remains)
  Force-acknowledged:      Z  (block-severity, see alignment.md)

To fix the remaining N drifts:
  - <list of "Fix now" findings with location>

Next: `devspec coherence <slug>` per change should now show only the items you chose to fix.
```

## Don't do this

- Don't apply suppressions silently. Every ignore marker needs a logged reason.
- Don't suppress block-severity findings under the "Suppress" option. Force them through "Force-acknowledge" so they're flagged in alignment.md.
- Don't fix code. Triage is decision-making, not implementation. If the user wants fixes done now, hand off to `/devspec-iterate <slug>`.
- Don't batch ask. Walk findings one (or one cluster) at a time. Bulk-suppress is how teams accumulate technical debt.
- Don't skip the "why" question on suppression. Reason-less suppressions are the same as drift — they just hide it.

## What you write

- `<!-- devspec:ignore <rule> -->` markers in change docs via Edit
- `alignment.md` entries via `devspec log`

You do NOT modify source code, contract docs, tests, or status.yaml.

## When to stop

When every finding has been categorised (Fix/Suppress/Defer/Force-ack), or the user explicitly says "stop, I'll handle the rest." Don't push past the user's attention budget.
