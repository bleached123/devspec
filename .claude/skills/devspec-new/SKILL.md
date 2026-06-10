---
name: devspec-new
description: Start a new DevSpec change interactively. Use when the user says "start a change", "new feature", "new fix", "create a change", or invokes `/devspec:new`. Interviews for title and change type, scaffolds via `devspec plan`, and offers to chain into `/devspec:grill` for the discovery stage. Enforces the walking-skeleton check — if no walking-skeleton change exists yet, suggests scoping the first change as a thin end-to-end slice.
---

You are guiding the user through creating a new DevSpec change. Your job is to scaffold the change *with* them — not to mechanically run `devspec plan`. Catch obvious problems (vague titles, walking-skeleton violations, unclear scope) before the change exists.

## Step 0 — Confirm workspace state

Run `devspec status --json` (or check via Read against `.devspec/devspec.yaml`). Three branches:

- **No workspace** → tell the user, suggest `/devspec:onboard` instead, stop.
- **Workspace exists, no changes yet** → this is the *walking-skeleton* slot. Set expectation in Step 1: the first change must be a thin end-to-end slice (infra → data → backend → frontend if any → CI → deploy), not feature depth.
- **Workspace exists, ≥1 change** → check whether the walking skeleton has shipped (any change deployed, or the first change marked done? `devspec status --json` shows phase). If still in `sketch` and no walking-skeleton change exists, flag the philosophy gate before continuing.

## Step 1 — Get the title

If `$ARGUMENTS` (from the slash command) is non-empty, use it as the proposed title. Otherwise ask:

> "What's this change about? Short title in plain English."

Derive a kebab-case slug from the title. Show the user: "Title: `<title>`, slug: `<slug>`. Look right?" If they push back, ask for an override slug.

**Reject vague titles**: "improvements", "fixes", "updates", "refactor", "cleanup" with no qualifier. Ask for what specifically changes. A good title says *what becomes possible* or *what stops being broken*.

## Step 2 — Get the change type

Use the **AskUserQuestion tool** with single-select:

- **Feature** — adds new capability or behaviour
- **Fix** — corrects broken behaviour
- **Refactor** — changes structure without changing behaviour
- **Chore** — non-product work (docs, infra, deps, tooling)

The type doesn't affect file scaffolding — `devspec plan` produces the same six docs either way — but it pre-shapes the discovery-stage interview when `/devspec:grill` runs next.

## Step 3 — Walking-skeleton gate (only when applicable)

If this is the workspace's first change AND it's not in the walking-skeleton-shape per [[feedback-devspec-philosophy-layer]]:

Ask the user explicitly:

> "This is the first change in the workspace. Is it a thin end-to-end slice (infra → data → backend → CI → deploy with minimal features), or is it a feature?"

If they say "feature", flag it: "The DevSpec philosophy says ship the skeleton first. Do you want to start a `walking-skeleton` change first and queue this feature as the second change?"

Don't block — offer the option. The user decides.

## Step 4 — Scaffold

Run `devspec plan "<title>"`. If a `--name` override was specified, pass `--name <slug>`.

If the command fails (duplicate slug, etc.), surface the error to the user and ask what to do.

On success, list what was written:

```
Created change "<slug>" with 6 lifecycle docs:
  .devspec/projects/<slug>/discovery.md
  .devspec/projects/<slug>/proposal.md
  .devspec/projects/<slug>/design.md
  .devspec/projects/<slug>/contract.md
  .devspec/projects/<slug>/alignment.md
  .devspec/projects/<slug>/tasks.md
```

## Step 5 — Offer the grill chain

Ask:

> "Discovery is the first stage. Want me to grill you through it now via `/devspec:grill discovery <slug>`?"

If yes — invoke the `devspec-grill` skill explicitly with the discovery stage as the target. If no — print the natural next step: "Edit `.devspec/projects/<slug>/discovery.md` in your editor, then run `devspec advance <slug> discovery` or `/devspec:continue <slug>`."

## Guardrails

- **Do NOT run `devspec plan`** without confirming the title and slug with the user first.
- **Do NOT skip the walking-skeleton gate** on a workspace's first change — the philosophy is locked.
- **Do NOT scaffold multiple changes** in one invocation. One change per invocation. If the user wants two, run the skill twice.
- **Do not auto-invoke `/devspec:grill`** without asking first.
- If `$ARGUMENTS` looks like a slug (kebab-case, no spaces), still confirm the human-readable title with the user before running plan.
