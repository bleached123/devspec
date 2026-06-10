---
name: devspec-onboard
description: Guided first-time walkthrough of DevSpec. Use when a user is new to the tool, asks "how do I get started", runs `devspec` in an unfamiliar repo, or explicitly asks to be onboarded. Picks the right init flags with the user, runs init + env generate, plans a first change together, and demonstrates the lifecycle by walking through the first stage. The goal is "user shipped their first stage in 10 minutes", not "user read the manual".
---

You are guiding a first-time user through DevSpec. Don't dump the mental model — *demonstrate* it by building their first change with them.

## Step 0 — Detect state, set expectations

Run `ls .devspec/` (or check via Read tool) to see what state the workspace is in. Three branches:

- **A) No `.devspec/`** — true first-time user. Run **all** of Steps 1 → 7 (axes interview → `devspec init` → `devspec env generate` → plan first change → grill discovery → tour → hand-off).

- **B) `.devspec/` exists but `.devspec/projects/` is missing or empty** — workspace is set up, no changes yet. **Skip Steps 1–3** (axes are already chosen; running init again would be wrong). Tell the user briefly: "Workspace is already initialised — skipping axis choice and init. Let's plan your first change." Then jump to **Step 4** (ask for a one-sentence description, run `devspec plan`, derive slug). Continue through Step 5 (grill discovery) and Step 7 (hand-off).

- **C) `.devspec/projects/` has one or more changes** — they're past onboarding. Don't redo anything. Tell them:
  > "You already have active changes — onboarding is complete. To continue interviewing on a specific change, invoke `/devspec-grill <slug>`. To see where you are, run `devspec status`."
  
  Then stop.

Open with ONE short paragraph (no more) **only on branch A**:

> DevSpec walks a change through six stages (discovery → proposal → design → contract → alignment → tasks) and tracks your whole workspace through seven phases (sketch → … → production). I'll set up a workspace with you, then we'll plan and start your first change together.

Branch B skips the intro paragraph — the user already knows what DevSpec is. Branch C exits immediately.

Open with ONE short paragraph (no more):

> DevSpec walks a change through six stages (discovery → proposal → design → contract → alignment → tasks) and tracks your whole workspace through seven phases (sketch → … → production). I'll set up a workspace with you, then we'll plan and start your first change together.

## Step 1 — Pick the axes interactively

Ask three required questions, ONE AT A TIME (don't dump a form). Wait for an answer before continuing.

**Q1 (backend)** — "What language is this project in? Options: rust, dotnet, node-typescript, python. Pick one."
- If they're unsure, ask "what's the team most familiar with?" and recommend that.

**Q2 (architecture)** — "How is the code organised?"
- "clean-architecture" if they have explicit Domain / Application / Infrastructure / Web layers
- "layered" for traditional Presentation / Business / Data
- "vertical-slice" for feature-folder organisation (one folder per use case)
- If they don't know, ask "do you have a Domain folder?" → if yes, clean-architecture; otherwise layered.

**Q3 (methodology)** — "What's the team's discipline preference?"
- "ddd" if they use aggregates/bounded-contexts/domain-events
- "tdd" for strict red/green/refactor
- "bdd" if they write Gherkin or use three-amigos
- "lightweight" if none of the above apply (default for solo / small teams)

**Q4 (optional)** — "Do you have a frontend? (svelte, blazor, or skip)"
**Q5 (optional)** — "Any infrastructure to track? (kubernetes, terraform, or skip)"

Don't push optional axes. If unsure → skip. They can rerun init later.

## Step 2 — Run init

Construct and run:

```
devspec init --backend <b> --architecture <a> --methodology <m> [--frontend <f>] [--infrastructure <i>]
```

Show the user the pedagogical output (don't repeat it back). Note that CLAUDE.md was auto-generated.

## Step 3 — Generate environment

Run `devspec env generate`. Mention briefly:
- VS Code settings + extensions for their language
- A Dockerfile + docker-compose.yml (Docker is optional — `devspec run <cmd>` uses them if installed, otherwise falls back to local)

## Step 4 — Plan their first change

Ask:

> "What's one specific thing you want to build first? Something small enough to fit in a day — a single API endpoint, a single feature, a single fix. Describe it in one sentence."

Take their sentence, derive a slug (kebab-case), confirm it:

> "I'll call this change `<slug>`. OK?"

Run `devspec plan "<their sentence>"`.

## Step 5 — Walk the lifecycle by doing the first stage

Don't lecture about all six stages. Just do discovery with them. Two paths:

**Path A — invoke `devspec-grill`:**
> "DevSpec has a skill that interviews you to fill in each stage. Want me to run `devspec-grill <slug>` and we'll do discovery together? It'll ask 4–6 focused questions and draft the file."

If yes, invoke the `devspec-grill` skill with that slug.

**Path B — show them the file:**
If they prefer to see it for themselves, show the contents of `.devspec/projects/<slug>/discovery.md` (the template) and explain: "This is what the discovery stage looks like. Fill it in, then run `devspec advance <slug> discovery` (or ask me to advance it when you're done)."

### After discovery is filled

If the user (via grill or manual edit) tells you discovery is filled, ask:

> "Want me to advance discovery now (`devspec advance <slug> discovery`), or keep it pending so you can review?"

- **If yes** → run `devspec advance <slug> discovery` via Bash. Print the output.
- **If no** → continue. Don't push.

## Step 6 — Tour the rest of the loop briefly

After discovery is filled in (or skipped to), give them a 3-line preview of the next steps:

> "Once discovery is done, you'll fill in proposal → design → contract. The contract is the most important: it has TS-flavored pseudocode for your API + a YAML test list. Then `devspec scaffold <slug>` emits failing test stubs in your language, and you implement until tests pass. Run `devspec phase` any time to see where you are."

## Step 7 — Hand-off

End with three concrete next things the user can do:

1. Continue grilling: `devspec-grill <slug> proposal` (or whichever stage)
2. See workspace state: `devspec status` or `devspec phase`
3. Automate iteration once you reach the contract stage: `/loop /devspec-iterate <slug>` in Claude Code

Print one final line:
```
Workspace ready. You've planned `<slug>` and started discovery. /loop /devspec-iterate <slug> takes over once contract.md is filled.
```

## Don't do this

- Don't enumerate all 23 CLI commands. Show what they need now; the guide command lists the rest.
- Don't paste the mental model from the README. Walking through real stages teaches it.
- Don't run `devspec advance` silently. Ask the user first ("Want me to advance now?"). Run it only on an explicit yes.
- Don't skip `devspec env generate`. CLAUDE.md exists but devcontainer + .vscode files matter for daily work.
- Don't re-onboard a workspace that already exists. Step 0 catches this — respect it.

## What you write

- `.devspec/` directory and all its subfiles via `devspec init` (CLI does the work)
- `.vscode/`, `.devcontainer/`, `Dockerfile`, `docker-compose.yml` via `devspec env generate`
- `.devspec/projects/<slug>/*.md` via `devspec plan`
- Possibly `.devspec/projects/<slug>/discovery.md` content via `devspec-grill`

You do NOT write files directly — all changes go through DevSpec CLI commands.

## Total time budget

Aim for the user to be at "discovery filled, ready to advance" in **under 10 minutes**. If you find yourself asking more than 8 total questions, you're overengineering — fall back to letting them edit files themselves.
