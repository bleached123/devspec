# DevSpec

**Spec-driven engineering standards and guardrails for AI-collaborated code.**

DevSpec sits between your design docs and your codebase, holding the line so they don't drift apart. It scaffolds a structured lifecycle for every change (discovery → proposal → design → contract → alignment → tasks), tracks the workspace's progression through seven phases (sketch → ... → production), and continuously checks that what you've shipped matches what you said you'd ship.

It is built for the way teams work with AI coding agents in 2026: each change has a machine-readable contract, agents implement against it test-by-test, and a separate reviewer agent verifies the result. When drift is detected, structured questions surface to the human — never silent corrections.

---

## Table of contents

- [Philosophy](#philosophy)
- [Why DevSpec](#why-devspec)
- [From idea to production](#from-idea-to-production)
- [Install](#install)
- [Quick start](#quick-start)
- [Mental model](#mental-model)
- [Commands by task](#commands-by-task)
- [The Ralph loop (Claude Code)](#the-ralph-loop-claude-code)
- [Coherence rules](#coherence-rules)
- [Customizing](#customizing)
- [Project status](#project-status)
- [What DevSpec is not](#what-devspec-is-not)

---

## Philosophy

DevSpec is opinionated. Two principles sit **above** every methodology, architecture, and language choice — they shape how every project is started, reviewed, and shipped.

### 1. Walking skeleton before feature depth

The **first change** in any DevSpec workspace is a **walking skeleton**: a deployable end-to-end slice that traverses every layer the architecture promises — infrastructure, data store, backend, frontend (if any), CI/CD, and production deployment. It does almost nothing in terms of features. It just *exists*, in production, end-to-end.

> **Make it work, then make it fancy.**

This is non-negotiable for greenfield work because:

- **Architecture is theory until it ships.** A clean diagram with no deploy is worth less than a "hello world" that auths, persists, renders, and goes through CI to a real environment. The deploy reveals the lies in the diagram.
- **Iteration speed is set on day one.** The team learns the deploy mechanism, the lint feedback loop, the failure modes — once. Every later change benefits.
- **Stakeholders need something to point at.** A CEO can review a deployed URL; nobody can review three half-written modules.
- **Wrong assumptions are cheaper to find early.** Discovering the database is wrong on day three (one table) beats discovering it on month three (forty interlinked ones).

The skeleton **must include**: infrastructure provisioning, real data layer (≥1 table), backend endpoint round-tripping the data, frontend page (if applicable), CI/CD pipeline, observability (structured logs + health endpoint). Anything beyond that waits. The **second** change adds the first real feature.

The reviewer agent flags any change that adds feature depth before the walking skeleton is deployed and proven.

### 2. Dependency cost discipline

Every dependency is a long-term commitment. DevSpec treats them with the same scrutiny as new code.

- **Prefer free, open-source, well-maintained.** Default to MIT/Apache/BSD-licensed libraries with releases in the last 12 months and a credible maintainer.
- **Check health before adopting.** Download trends, issue closure rate, time-to-merge on PRs, recent advisories.
- **Paid or commercial libraries require an explicit decision.** If the only library that fits is paid (common with some commercial NuGet packages, certain enterprise SDKs), the implementer **must** ask the user — explaining cost, lock-in, and alternatives — before adopting.
- **Document every new dep in `design.md`** with name, license, last release, why over alternatives, cost (if any).
- **Audit in CI.** `npm audit` / `cargo audit` / `dotnet list package --vulnerable` / `pip-audit` / `govulncheck` run on every PR (the pipeline fragment enforces this).

The reviewer flags any new dependency that isn't documented in `design.md`. Paid commercial dependencies without explicit user escalation are **block-severity** in any phase.

These two principles are written into `common/standards.md`, loaded into `CLAUDE.md`, and enforced by the implementer + reviewer subagents on every iteration of the Ralph loop.

---

## Why DevSpec

Three problems it's built to solve:

**1. Spec rot.** Design docs drift from code within weeks. DevSpec makes the contract (TS-flavored pseudocode + a YAML test list) the single source of truth, and runs **continuous coherence checks** that flag drift before it becomes legacy.

**2. AI implementations that look right but aren't.** When a coding agent writes the implementation AND grades its own work, blind spots compound. DevSpec spawns a separate reviewer agent — fresh context, zero memory of how the code was written — that reads the spec and the source independently and returns PR-style findings.

**3. Standards that go stale.** Best practices in .NET, Python, Kubernetes, etc. shift every year. DevSpec ships a `/devspec:refresh-standards` command that re-grounds your pack content against live release notes and authoritative sources, so your engineering bar tracks the language ecosystem.

---

## From idea to production

You have an idea. You want it built — to a high standard, with a codebase that stays clean as it grows, and with confidence that what ships matches what you asked for. DevSpec is the rails for that journey. Here is what each step looks like, what the tool does for you, and what you get out the other end.

### 0. Pick the shape of the codebase — once

Before the first idea even lands, you decide the engineering bar: what language, what architecture style, what discipline (TDD, DDD, etc.), and what platform you deploy to. These are the **standards** the codebase will be held to forever after.

```bash
devspec init --backend go --architecture clean-architecture --methodology tdd --infrastructure kubernetes --pipeline github
```

DevSpec composes those choices into your workspace: linter configs, formatter rules, folder layout, security baselines (OWASP Top 10, no hardcoded secrets, no weak crypto), the universal principles (KISS, DRY, YAGNI), **and the CI/CD pipeline** — a GitHub Actions workflow that enforces secret scanning, dependency review, lint-with-warnings-as-errors, typecheck, three layers of tests (unit, integration, e2e), and spec-to-code coherence on every pull request. It also writes:

- **`CLAUDE.md`** — every AI agent working in this repo reads the same standards your engineers do.
- **`.claude/commands/devspec-*.md`** — the DevSpec slash commands (`/devspec:iterate`, `/devspec:review`, `/devspec:coordinate`, `/devspec:iterate-all`, `/devspec:refresh-standards`) become available in Claude Code from the moment you open the folder.
- **`.claude/skills/devspec-*/`** — the five DevSpec skills (`devspec-onboard`, `devspec-grill`, `devspec-triage`, `devspec-uat-design`, `devspec-sync`) become invokable without any extra install.

**You get**: a workspace where "good code" is defined, machine-checkable, and applied to every change from day one — locally, in the editor, and in CI. **Open Claude Code and run `/devspec:onboard`** and the agent grills you through planning your first change end-to-end.

### 1. Write the idea down — in plain English

```bash
devspec plan "Let customers cancel a booking"
```

This creates a folder for the change with six empty docs. The first one, `discovery.md`, just asks: *what problem are we solving, and for whom?* You answer in two paragraphs. No code, no diagrams.

The next, `proposal.md`, asks: *what are we going to do about it?* Still plain English — a few bullet points describing the intended outcome.

**You get**: the idea is now anchored in writing, in a place the rest of the system will hold every later artifact accountable to.

### 2. Sketch the shape

`design.md` is where the technical lead (or an AI agent with the right context) sketches the solution: which parts of the system change, what the new pieces are called, how they fit together. Still no code — just nouns and arrows.

DevSpec checks that the design actually references the goals from your proposal. If you said "let customers cancel a booking" but the design never mentions cancellation, the tool flags the gap.

**You get**: a design document that demonstrably solves the stated problem.

### 3. Lock in the contract — the single source of truth

`contract.md` is the most important file in the lifecycle. It contains two things:

1. **API pseudocode** — TypeScript-flavored function signatures describing what gets built (e.g. `cancelBooking(id: BookingId): Result<Refund, CancelError>`). Pseudocode, not real code, so a non-engineer can read it.
2. **A YAML test list** — every behavior the system must exhibit, written as `given / when / then`. *"Given a booking older than 24 hours, when cancellation is attempted, then return a partial refund."*

This is the contract: what done looks like, in a form a machine can check.

```bash
devspec scaffold cancel-booking
```

This emits failing test stubs in the chosen language, one per YAML test. The implementation isn't written yet — but every behavior you require already exists as a failing test in the codebase. **From this point forward, "done" means "all these tests pass."**

**You get**: an unambiguous, executable definition of done. No more "I thought we agreed…" conversations.

### 4. Agree before building

`alignment.md` is where stakeholders sign off and decisions are logged with timestamps. *"Marketing approved the partial-refund policy on 2026-05-12. Legal cleared the cancellation window."*

```bash
devspec log cancel-booking "Approved partial refund policy" --by ceo
```

Every decision lands here with who said it and when. If the spec later changes, you can see exactly which decision drove which line of the contract.

**You get**: a paper trail. When someone six months from now asks "why does this work this way?", the answer is in the file.

### 5. Build it — with two AI agents watching each other

This is where DevSpec's separation of concerns pays off.

```
/loop /devspec:iterate cancel-booking
```

On each cycle:

- An **implementer agent** (fresh context, no memory of past attempts) reads the contract, picks the first failing test, writes just enough code to make it pass, then runs the language toolchain.
- A **reviewer agent** (also fresh context, no memory of how the code was written) re-reads the contract independently and PR-reviews the implementation against the standards. It catches: shortcuts, missing edge cases, security issues, style violations, principle breaches (DRY/KISS/YAGNI).
- If the reviewer flags **blocking drift** between contract and code, the loop pauses and asks you a structured question. No silent corrections.

Behind the scenes, **continuous coherence checks** run every cycle, comparing the proposal to the design, the design to the contract, the contract to the tests, the tests to the source, and the API surface to the actual function names. Drift is impossible to hide — it surfaces as a list of named rule violations with remediation suggestions.

**You get**: clean, contract-faithful code, written by an agent and verified by a second agent acting as an independent reviewer. The codebase stays aligned with the spec because the system refuses to let them diverge.

### 6. Verify with real-world acceptance

```bash
devspec uat init                                # write acceptance criteria from contract
devspec uat pass 1 --by jane                    # sign off as they're verified
devspec uat fail 2 --note "wrong currency"      # capture failures
```

UAT criteria are pulled from the contract, then signed off (or failed) by named humans. A failed criterion drops the workspace phase back to `build`, blocking the production handoff until the failure is fixed and re-verified.

**You get**: production readiness gated on actual stakeholder validation, with named accountability for every sign-off.

### 7. Ship — with the standards locked in

```bash
devspec phase --set production
```

Switching the workspace to **production phase** enables strict mode: every coherence warning escalates to a hard block. You can't merge a PR that has stubbed tests, missing implementations, or undocumented API drift. The standards you set on day zero are now enforced as gating rules.

The CI workflow (`devspec ci init`) runs the same checks on every pull request — same logic locally, same logic in GitHub Actions. The branch protection rule on `main` requires `devspec / check` to pass, so nothing that fails the standards can reach production.

**You get**: a release pipeline that physically prevents drift, regression, and shortcuts from reaching production. The codebase remains as clean on day 365 as it was on day 1.

### What you don't have to do

- You don't have to read code to evaluate progress — read `status.yaml`, `alignment.md`, and the UAT report.
- You don't have to babysit AI agents — the reviewer catches their mistakes, and blocking drift escalates to a question, not a bug.
- You don't have to remember which language version or convention applies — `init` locked that in, and `/devspec:refresh-standards` refreshes it quarterly against authoritative sources.
- You don't have to fight entropy — the system fails loudly when spec and code diverge, before it becomes legacy.

The trade you make: every change must have a written contract before it gets built. In exchange, you get a codebase that scales without rotting, an AI-collaborated workflow with independent verification, and an audit trail from idea to production for every line of code.

---

## Install

DevSpec is a TypeScript CLI. From this repo:

```bash
npm install
npm run build       # compiles src/ → dist/ (the bin in package.json points here)
npm link            # makes `devspec` available globally
```

Or build + global install in one go:

```bash
npm install
npm run build
npm install -g .
```

Skipping `npm run build` will leave `dist/cli.js` missing and `devspec` will error with "module not found." If you only want to run from source for development, use `npx tsx src/cli.ts <command>` instead.

Verify:

```bash
devspec --version
devspec doctor
```

**Requirements**: Node 22+, Git. To use the Ralph loop / reviewer features, Claude Code installed in the workspace where you'll run them.

---

## Quick start

From any directory that should become a DevSpec workspace:

```bash
devspec init \
  --backend rust \
  --architecture clean-architecture \
  --methodology ddd \
  --frontend react \
  --infrastructure kubernetes \
  --pipeline github
```

That single command writes everything you need: `.devspec/` workspace, merged `standards.md`, `CLAUDE.md` preloaded for AI agents, and **`.claude/commands/` + `.claude/skills/`** so the DevSpec slash commands and skills are available in Claude Code immediately.

### Fastest path to a working change (recommended)

Open the folder in your editor and the **Claude Code panel**, then type:

```
/devspec:onboard
```

That's it. The `devspec-onboard` skill runs `devspec env generate`, scaffolds your first change with `devspec plan`, then **grills you** through the lifecycle docs (discovery → proposal → design → contract) one at a time, drafting each from your answers. End state: a fully planned walking-skeleton change, ready for `/devspec:iterate` to start implementing.

Or use the [VS Code extension](vscode-devspec/) — the DevSpec sidebar's welcome view has a one-click "Copy /devspec:onboard to clipboard" button.

### Do it manually (if you prefer)

```bash
devspec env generate              # write .vscode/, devcontainer, Dockerfile + docker-compose.yml
devspec plan "Add bookings"       # scaffold the 6 lifecycle docs for a change
#   then fill in: discovery.md, proposal.md, design.md, contract.md (most important)
devspec scaffold add-bookings     # emit failing test stubs from the contract
devspec coherence add-bookings    # check for drift
devspec check                     # workspace + architecture guardrails
devspec advance add-bookings discovery   # mark stages done as you go
devspec status                    # see all changes + phase + drift summary
```

Run `devspec` (no args) at any time for a contextual overview, or `devspec guide` for the full mental model.

### Try it end-to-end in 5 minutes

```bash
# 1. Scaffold a throwaway workspace
mkdir /tmp/devspec:try && cd /tmp/devspec:try && git init -q -b main

# 2. Full-stack init (Node + React + GitHub pipeline + Kubernetes)
devspec init \
  --backend node-typescript --architecture clean-architecture --methodology tdd \
  --frontend react --infrastructure kubernetes --pipeline github

# 3. Verify everything's wired
devspec doctor

# 4. Open in your editor
code .

# 5. Open Claude Code and type:
#      /devspec:onboard
#    The skill grills you through planning your first change.
```

After `/devspec:onboard` finishes you'll have:
- a scaffolded change under `.devspec/projects/<slug>/` with discovery/proposal/design/contract docs filled in,
- failing test stubs in source from `devspec scaffold`,
- a clean `devspec coherence <slug>` report,
- the workspace at phase `contract` (ready for `/devspec:iterate` to start implementing).

### Editor integration

The [**`vscode-devspec`**](vscode-devspec/) extension brings the Changes tree, status-bar phase indicator, interactive Mermaid map webview, inline coherence diagnostics, and one-click slash-command-to-clipboard buttons into VS Code. It's a sibling repo (separate `.vsix` install) — the CLI works fine without it; the extension is just a UX layer on top.

---

## Mental model

DevSpec organizes work around **changes** (per-feature) inside a **workspace** (per-project), governed by **fragments** (composable conventions packs).

### Lifecycle — per change

Every change scaffolded by `devspec plan` walks through six stages:

| Stage | Artifact | Purpose |
|---|---|---|
| **discovery** | `discovery.md` | What problem are we solving, for whom? |
| **proposal** | `proposal.md` | What are we doing about it? |
| **design** | `design.md` | High-level shape of the solution |
| **contract** | `contract.md` | TS-flavored pseudocode for the API + a `\`\`\`yaml tests` block (machine-readable test list) |
| **alignment** | `alignment.md` | Stakeholder sign-off, decisions captured |
| **tasks** | `tasks.md` | Non-test work (docs, migrations, deployment) |

Crucially: **`contract.md` is the source of truth for what to build**, and **`tasks.md` is for everything that isn't a test**. Test-driven implementation runs off `devspec scaffold`, not off `tasks.md` checkboxes.

### Phases — workspace-wide

Your workspace progresses through seven phases:

| Phase | When you're here | Auto-detected via |
|---|---|---|
| **sketch** | Workspace exists, exploration in progress | ≥1 change has any content |
| **design** | First change has settled design | `design` stage marked done with content |
| **contract** | First contract with tests is written | Non-template contract with parseable tests |
| **build** | Tests scaffolded into source, implementation underway | At least some test fns exist in source |
| **ready** | All tests pass, coherence is clean | 0 blocking drift, no stubbed tests |
| **uat** | UAT criteria defined, validation in progress | `.devspec/uat.yaml` has ≥1 criterion |
| **production** | Manual flag in `devspec.yaml`; **strict mode** on | Declared by user; warnings escalate to blocks |

The current phase is computed dynamically — drop a test, fail a UAT criterion, regress a change with `rewind`, and the workspace phase drops to reflect reality. You can override with `devspec phase --set <phase>`.

### Capability specs (v1)

Alongside per-change contracts, DevSpec workspaces maintain **living capability specs** under `.devspec/specs/<capability>/spec.md`. Each capability spec is a single, accumulating file describing what the system promises in that domain (e.g. `user-auth`, `billing`). Changes contribute **deltas** under `.devspec/projects/<slug>/deltas/<capability>/spec.md` using `## ADDED Requirements`, `## MODIFIED Requirements`, and `## REMOVED Requirements` blocks; running `devspec specs sync <slug>` (or archiving the change) merges the deltas into the main spec.

```bash
devspec specs init user-auth                 # scaffold .devspec/specs/user-auth/spec.md
devspec specs delta my-change user-auth      # scaffold a delta inside a change
# edit the delta — add requirements under ## ADDED / ## MODIFIED / ## REMOVED
devspec specs sync my-change --dry-run       # preview the merge
devspec specs sync my-change                 # apply; delta is renamed to .synced
devspec archive my-change                    # auto-syncs any remaining deltas
```

The feature is **additive and opt-in** — changes without a `capability:` frontmatter in `contract.md` and no `deltas/` directory work exactly as before.

**Guards (v1)**: four coherence rules catch silent failures and cross-change collisions:

| Rule | Triggers when | Severity |
|---|---|---|
| `capability-exists` | A `deltas/<cap>/` exists with no matching `specs/<cap>/spec.md` | warn |
| `delta-format` | Malformed block headers (e.g. `## ADDDED`), orphan requirements, empty bodies in ADDED/MODIFIED, duplicate requirement names | warn (→ block in production phase) |
| `delta-capability-match` | `contract.md` frontmatter `capability:` list doesn't match the `deltas/` directory contents | warn |
| `requirement-conflict` | Two or more active changes ADD, MODIFY, or REMOVE the same `### Requirement:` in the same capability (workspace-level rule) | block |

**Awareness (v1)**: the reviewer subagent (`/devspec:review`, `/devspec:iterate`) reads `devspec specs sync <slug> --dry-run --json` when a change has deltas and treats the merged preview as the spec of record. `devspec map` ships an L1.5 capability layer (`maps/capabilities/index.md` + per-capability drill-downs) showing requirement counts, active contributors, and archived history. `/devspec:coordinate` flags `capability-conflict` findings across active changes. CLAUDE.md and `common/standards.md` propagate the capability-specs model to AI agents so they maintain the layer proactively.

The `/devspec:sync` slash command wraps the sync workflow with a dry-run preview and confirmation prompt for destructive (MODIFIED / REMOVED) operations.

### Fragments — composable conventions

`devspec init` composes content from six axes of fragments under `src/packs/`:

```
src/packs/
├── common/                           # KISS/DRY/YAGNI + security principles (universal)
├── backend/
│   ├── dotnet/   (net10, C# 14)
│   ├── node-typescript/   (Node 22, TS 5.7+)
│   ├── rust/   (Edition 2024)
│   ├── python/   (3.14)
│   └── go/   (1.25, gofmt, golangci-lint)
├── frontend/                          # optional
│   ├── svelte/   (Svelte 5 runes, snippets, attachments)
│   ├── blazor/   (.NET 10, render modes)
│   ├── react/    (React 19, Vite 6, TanStack Query, Radix + shadcn/ui)
│   └── vue/      (Vue 3.5, Vite 6, Pinia, VeeValidate + zod)
├── architecture/
│   ├── clean-architecture/   (Domain/Application/Infrastructure/Web)
│   ├── layered/   (Presentation/Business/Data)
│   └── vertical-slice/   (feature folders)
├── methodology/
│   ├── ddd/   (aggregates, bounded contexts)
│   ├── tdd/   (red/green/refactor)
│   ├── bdd/   (Gherkin scenarios)
│   └── lightweight/   (YAGNI-first)
├── infrastructure/                    # optional
│   ├── kubernetes/   (PSA restricted, native sidecars, Workload Identity)
│   └── terraform/   (1.10+, ephemeral resources)
└── pipeline/                          # optional — enforces CI/CD gates
    └── github/   (security + lint + format + typecheck + unit/integration/e2e + caching + concurrency)
```

Each fragment has `tech-stack.yaml` (config) and `standards.md` (conventions). Backend and frontend also ship `dev-environment.yaml` (VS Code + devcontainer). `init` merges them all into your workspace.

**Add a new fragment** by dropping a folder — no code changes needed. The `init`, `doctor`, and `phase` commands discover fragments via filesystem listing.

### Recommended packages

Every backend and frontend fragment ships a `## Recommended packages` section in its `standards.md` with 2–3 vetted picks per category (validation, HTTP, ORM, logging, etc.). Each pick is MIT/Apache-licensed and free — paid commercial alternatives are flagged with 💰 and require explicit user escalation per the [Philosophy](#philosophy) section. The recommendations are advisory and dated; `/devspec:refresh-standards <axis/name>` re-grounds them against current ecosystem signals (npm trends, GitHub activity, recent advisories) so they don't go stale.

---

## Commands by task

DevSpec has 22 commands. Group by what you're doing:

### Starting a workspace

```
devspec init                  # set up .devspec/ from fragment choices
devspec env generate          # emit .vscode/ and devcontainer files
devspec claude                # write CLAUDE.md for AI agents
devspec guide                 # print the mental model in detail
```

### Working on a change

```
devspec plan "<title>"        # scaffold the 6 lifecycle docs
devspec scaffold <slug>       # emit failing test stubs in target language
devspec next <slug>           # show the first unchecked task
devspec complete <slug> <m>   # tick off a task (--line N for unambiguous match)
devspec advance <slug> <stg>  # mark a lifecycle stage done
devspec log <slug> "<dec>"    # append a timestamped decision to alignment.md
```

### Checking drift

```
devspec coherence <slug>      # artifact-to-artifact drift (11 rules)
devspec check                 # workspace + architecture guardrails
devspec doctor                # diagnose setup problems (workspace, tools, configs)
devspec sync-contract <slug>  # reflect implementation renames back to contract.md
```

### Seeing where you are

```
devspec                       # contextual overview (bare command)
devspec status                # all changes + workspace phase + tests progress
devspec phase                 # phase gates with "what's needed to advance"
devspec map                   # generate Mermaid visualisation maps (L0→L3)
devspec map --watch           # hot-reload maps as you edit (open in VS Code preview)
```

### UAT

```
devspec uat init              # scaffold .devspec/uat.yaml
devspec uat list              # criteria + statuses
devspec uat pass <n> --by U   # sign off criterion
devspec uat fail <n> --note   # record failure
devspec uat reset <n>         # back to pending
```

### Going backward

```
devspec rewind <slug> <stg>   # regress a change, log reason to alignment.md
devspec phase --set <earlier> # force workspace to an earlier phase
```

### Production handoff

```
devspec phase --set production   # enables strict mode (warnings become blocks)
devspec phase --auto             # clear declaration, revert to detection
```

### Release

```
devspec release                  # analyse conventional commits → semver bump → changelog → tag
devspec release --bump major     # override the computed bump
devspec release --dry-run        # preview without tagging
devspec release --yes --push     # CI-friendly: skip confirmation + auto-push tag
```

### Archive

```
devspec archive <slug>        # move done change to .devspec/archive/
devspec archive <slug> --restore   # move back
```

Run any command with `--help` for flags.

---

## The Ralph loop (Claude Code)

DevSpec is designed to be driven by Claude Code via three slash commands:

### `/loop /devspec:iterate <slug>`

Autonomous iteration. Each fire of the loop:

1. Spawns an **implementer** subagent (fresh context, ~25K tokens). It reads the contract + design, picks the first failing test from `tests.yaml`, writes just enough code to make it pass, runs `devspec check`.
2. Spawns a **reviewer** subagent (also fresh context, no memory of the implementer). It re-reads the contract independently and PR-reviews the change against the spec, standards, principles (KISS/DRY/YAGNI), and security baseline. Returns structured findings.
3. If the reviewer flags **block-severity** drift, the main session asks the user via `AskUserQuestion` — three options: retry, accept anyway, pause.
4. Otherwise: the task is complete, the loop fires the next iteration.

When the change is done, the loop prints `🎉 All stages done` and you interrupt it.

### `/devspec:review <slug>`

Standalone PR review without iteration. Spawns just the reviewer subagent. Useful for ad-hoc spot-checks after manual edits.

### `/devspec:refresh-standards <axis/name | all>`

Refreshes pack content (`standards.md` + `tech-stack.yaml`) against **live web sources**. Each subagent WebSearches official release pages (python.org, dotnet.microsoft.com, k8s release notes, OWASP for `common`) and bumps version targets / adds idioms / flags deprecations only with citations. The command writes diffs but **does not auto-commit** — you review `git diff -- src/packs/` first.

Run this periodically (e.g. once a quarter) or when a major version of a language ships.

### Why separate implementer and reviewer?

Same agent grading its own work has blind spots. Separate subagents — each in fresh context with no shared history — get genuine PR-review dynamics: the reviewer has to re-derive correctness from the spec alone, not from the implementer's reasoning. The combined cost is ~2× per iteration; the bug-detection improvement makes it worth it for anything beyond exploration.

---

## Coherence rules

15 rules (11 per-change + 4 capability-related, including 1 workspace-level), each suppressible with `<!-- devspec:ignore <rule-name> -->` in any doc of the change.

| Rule | Triggers when | Default severity |
|---|---|---|
| `stage-order` | A later stage is done while an earlier is not | block |
| `stage-claim-vs-content` | A stage is done but its doc is empty/template | block |
| `task-granularity` | Tasks are too vague for autonomous iteration | warn |
| `goal-coverage` | Design doesn't reference proposal's goal keywords | warn |
| `design-tasks-coverage` | Design has sections with no matching tasks | warn |
| `contract-coverage` | Contract is empty or has no `\`\`\`yaml tests` block | block |
| `tests-implemented` | Contract test missing in source / stubbed body | block / warn |
| `api-test-coverage` | API method declared but no test exercises it | warn |
| `api-method-implemented` | API method declared but not found in source | warn |
| `design-contract-coverage` | Domain terms in design missing in contract | warn |
| `capability-exists` | `deltas/<cap>/` exists with no matching `specs/<cap>/spec.md` | warn |
| `delta-format` | Malformed delta block, orphan requirement, empty body, or duplicate within a block | warn |
| `delta-capability-match` | `contract.md` frontmatter `capability:` list doesn't match `deltas/` subdirectories | warn |
| `requirement-conflict` | Two+ active changes touch the same `### Requirement:` in the same capability (workspace-level) | block |
| `ignores` (meta) | Rules suppressed via doc markers are surfaced | informational |

In **`phase: production` strict mode**, every `warn` is escalated to `block`. Some findings (hardcoded secrets, SQL concatenation, custom crypto, weak password hashing) are **always block** regardless of phase.

---

## Customizing

### Add a new fragment

Drop a folder. Example: `src/packs/backend/go/`:

```
src/packs/backend/go/
├── tech-stack.yaml          # required: backend.* config keys
├── standards.md             # required: conventions for this fragment
└── dev-environment.yaml     # optional: VS Code/devcontainer additions
```

After the folder exists, `devspec init --backend go ...` works. `devspec doctor` validates the fragment. No code changes needed.

### Suppress a coherence rule for a change

Add a marker to any doc in the change:

```markdown
<!-- devspec:ignore task-granularity -->
```

The rule stops firing for this change only. Other changes are unaffected.

### Override the workspace phase

```bash
devspec phase --set production    # forces strict mode regardless of auto-detection
devspec phase --auto              # clears the override
```

### Custom CLAUDE.md content

`devspec claude` writes content between `<!-- devspec:claude:start -->` and `<!-- devspec:claude:end -->` markers. Anything outside those markers is preserved on re-runs. Add team notes, project-specific guidance, or extra context above or below the managed block.

---

## GitHub Actions integration — the pipeline fragment

CI is a first-class fragment axis, not a one-shot template. Pick it at init time:

```bash
devspec init --backend go --architecture clean-architecture --methodology tdd --pipeline github
devspec env generate    # writes Dockerfile + docker-compose.yml (used by the workflow)
devspec ci init         # writes .github/workflows/ci.yml + pull_request_template.md from the fragment
```

The `pipeline/github` fragment ships a complete enforcement workflow with **six required jobs**:

| Job | Enforces | Tooling |
|---|---|---|
| **security** | No leaked secrets, no high-severity dep CVEs on PR | gitleaks, dependency-review-action |
| **quality** | Format check, lint, typecheck — all warnings-as-errors | per-backend formatter/linter/type-checker via Docker |
| **test-unit** | Fast unit tests pass | per-backend `test_unit` command |
| **test-integration** | Integration tests pass | per-backend `test_integration` command (e.g. `go test -tags=integration`) |
| **test-e2e** | Browser-driven UI tests pass (only when frontend configured) | Playwright via the frontend fragment |
| **devspec** | Spec ↔ code coherence is clean across every change | `devspec doctor` + `devspec check` + `devspec coherence` |

The workflow also enforces:

- **Concurrency control** — stale runs on the same branch auto-cancel.
- **Least-privilege tokens** — `permissions: contents: read` workflow-wide; jobs elevate per-step only when needed.
- **Pinned actions** — major-tag pinning (`@v4`); SHA-pinning recommended in `standards.md` for release/deploy jobs.
- **Layered caching** — Docker buildx layer cache via `cache-from: type=gha` + language-native caches per setup action.
- **Inline failure annotations** — `::error::` and `::group::` markers surface drift on the PR's Files Changed tab.

### How commands flow into the workflow

Each backend fragment now ships a `commands:` block in `tech-stack.yaml`:

```yaml
backend:
  commands:
    format_check: "test -z \"$(gofmt -l .)\""
    lint: "golangci-lint run ./..."
    typecheck: "go vet ./..."
    test_unit: "go test -race -short ./..."
    test_integration: "go test -race -tags=integration ./..."
```

At `devspec ci init` time, the pipeline fragment's `workflow.yml.tpl` template substitutes `{{ backend.commands.lint }}` etc. against the merged tech-stack, so the generated workflow runs the right command for the chosen backend.

Frontend fragments expose `commands.test_e2e` the same way. If no frontend is configured, the e2e job is emitted with `if: false` so it skips cleanly.

### Two-step setup

**You must edit the workflow's install step.** It exits with a clear error by default — pick one of the documented install methods (npm package, git source, pre-built binary) for your environment. Once configured:

1. Commit + push `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`.
2. In **GitHub → Settings → Branches → Branch protection rules**, add all six required status checks on `main`:
   `ci / security`, `ci / quality`, `ci / test-unit`, `ci / test-integration`, `ci / test-e2e`, `ci / devspec`.
3. The PR template fires automatically on every new PR — it asks the author to confirm secrets are clean, format/lint/typecheck pass, all three test layers pass, and the linked change is coherence-clean.

### What it doesn't do

- Run the Ralph loop (that's an interactive agent flow — CI runs deterministic checks, not LLM iterations).
- Apply suppressions or remediations (it surfaces drift, humans/agents decide).
- Auto-merge or auto-comment (out of scope; add via `actions/github-script` if you want).
- Deploy. Pipeline is for gates; deployment workflows are separate by design.

---

## Continuous delivery — `release.yml` + `devspec release`

The pipeline fragment ships a second workflow alongside `ci.yml`: **`release.yml`** is the deploy pipeline. CI gates merges; release ships them.

```bash
devspec ci init    # writes both: .github/workflows/ci.yml + release.yml + .devspec/release.yaml
```

**`release.yml` flow**:

1. **build** — on every push to main and every tag push, builds the dev container image, tags it (`sha-<long>`, branch name, version tag, `latest` on main), pushes to **GitHub Container Registry** (`ghcr.io/<owner>/<repo>`) using the workflow's `GITHUB_TOKEN` (no separate secret needed).
2. **deploy → staging** (on push to main): runs the per-env *validate*, *deploy*, and *smoke* commands defined in `.devspec/release.yaml`. Gated by a GitHub Environment called `staging`.
3. **deploy → production** (on `v*.*.*` tag push): same three steps, gated by the `production` GitHub Environment — configure required reviewers there for manual approval before deploy. Posts a GitHub Release with auto-generated notes from the tag's annotated message.

**`.devspec/release.yaml`** is the configurable surface:

```yaml
environments:
  staging:
    url: "https://staging.example.com"
    validate_cmd: "helm lint chart/ --strict"
    deploy_cmd: |
      kubectl set image deployment/app app=$IMAGE_TAG -n staging
    smoke_cmd: 'curl -fsS --retry 5 "$DEPLOY_URL/health"'
  production:
    url: "https://example.com"
    validate_cmd: "true"
    deploy_cmd: |
      kubectl set image deployment/app app=$IMAGE_TAG -n production
    smoke_cmd: 'curl -fsS --retry 5 "$DEPLOY_URL/health"'
```

`$IMAGE_TAG` is set to the image pushed in step 1. `$DEPLOY_URL` is the env's `url`. The defaults are explicit `echo "::error"` + `exit 1` placeholders — the workflow refuses to silently no-op until you fill in real commands for your target (k8s, terraform, gcloud, az, aws, vercel, etc.).

**`devspec release`** cuts the version tag that triggers the production deploy:

```bash
devspec release         # analyses commits since last tag, proposes bump, asks confirmation
devspec release --yes   # skip the prompt (CI-friendly)
devspec release --bump major   # override the computed bump
devspec release --dry-run      # preview without tagging
```

It parses [Conventional Commits](https://www.conventionalcommits.org/) since the last `v*` tag, computes the next semver (`feat:` → minor, `fix:`/`perf:` → patch, `feat!:` or `BREAKING CHANGE` → major), generates a grouped CHANGELOG.md entry, creates an annotated tag with the changelog as the message, and (optionally) pushes. Pushing the tag triggers `release.yml`'s production deploy.

**The full loop**: developer opens PR → `ci.yml` gates with 6 required jobs → merge → `release.yml` builds + deploys staging → `devspec release` cuts a tag → `release.yml` deploys production after approval. All steps reproducible from local Docker through to production using the same image.

---

## Visualising the workspace — `devspec map`

DevSpec generates layered Mermaid diagrams that render natively in GitHub PRs, the VS Code markdown preview, and any markdown viewer. Each layer is self-contained — breadcrumb back to the previous level, workspace context (phase, backend, architecture, pipeline), and a short *"How to read this map"* intro so a designer or non-engineer can land anywhere and understand what they're looking at.

```bash
devspec map                       # generate all maps → .devspec/maps/
devspec map --change add-bookings # focus on one change (skips L0 + arch refresh)
devspec map --watch               # regenerate on every change to .devspec/projects/ or source files
```

**Four layers, drill-down via clickable nodes**:

| Layer | File(s) | Shows |
|---|---|---|
| **L0** | `maps/workspace.md` | Every active change, lifecycle progress, coherence health, phase progression diagram |
| **L1** | `maps/change-<slug>.md` | The change's six lifecycle stages, current stage, coherence findings grouped by rule |
| **L2** | `maps/contract-<slug>.md` | API methods (class diagram) → source; tests (flowchart) → implementation files |
| **L3** | `maps/arch.md`, `maps/deps-<slug>.md` | Architecture layers + allowed dependency direction; per-change deps with license/cost flags |

**Hot reload**: `devspec map --watch` watches `.devspec/` and the workspace source directories, regenerating affected layers on every save. Open any file in VS Code's markdown preview (right-click → *Open Preview to the Side*) and the Mermaid diagrams refresh as you edit. No browser, no dev server — the files are version-controlled markdown.

**Designed to be read top-down**: a stakeholder lands on `maps/index.md`, picks a change, drills into its lifecycle, drills further into the contract or dependencies. Each level says *what it's showing* and *how to read it* — not just symbols.

The reviewer subagent reads these maps as ground truth of "what does the system actually look like right now" when scoring a change.

---

## Running parallel agents — git worktrees per change

When multiple changes are in flight and you want true parallel agent work without file conflicts, use git worktrees:

```bash
devspec worktree add add-bookings              # creates .devspec/worktrees/add-bookings/ on branch devspec/add-bookings
devspec worktree add payment-retries           # second change, second worktree

# In two separate Claude Code windows:
#   window 1:  cd .devspec/worktrees/add-bookings && /loop /devspec:iterate add-bookings
#   window 2:  cd .devspec/worktrees/payment-retries && /loop /devspec:iterate payment-retries

devspec worktree list                          # see what's running where

# Merge each change back when done:
git merge devspec/add-bookings
devspec worktree remove add-bookings --delete-branch
```

Each worktree is a fully isolated checkout of a separate branch. Two agents editing `lib.rs` in their respective worktrees won't step on each other — git handles reconciliation at merge time. The coordinator subagent (`/devspec:coordinate`) catches semantic conflicts before merge, but file-level races become impossible.

If you don't need this isolation, **sequential rotation** (`/loop /devspec:iterate-all`) is simpler and equally safe in a single window.

---

## Containerized commands — no more "works on my machine"

When you run `devspec env generate`, DevSpec writes three Docker-related files into your workspace alongside the editor config:

- **`Dockerfile`** — derived from the backend fragment's `dev-environment.yaml` (`image:` + `postCreateCommand`). One `FROM` line in, everything you need to compile/test pre-installed.
- **`docker-compose.yml`** — two services: `dev` (interactive shell) and `test` (runs the backend's default test command — `cargo test`, `dotnet test`, `pytest`, `npm test`).
- **`.dockerignore`** — keeps build context lean.

Then **`devspec run <cmd>`** is the agent-friendly way to invoke any language command:

```bash
devspec run cargo test            # runs inside the container
devspec run pytest -k bookings    # also containerized
devspec run dotnet build          # same
devspec run --local cargo test    # force local execution, skip container
```

If a Dockerfile + docker-compose.yml are present in the workspace root, `devspec run` shells through `docker compose run --rm dev sh -c "<cmd>"`. If not, it runs locally — so the same command works everywhere, and you only get containerization where you've configured it.

Slash commands and Ralph loop iterations are wired to use `devspec run` for language commands, so an agent running `/devspec:iterate` automatically gets reproducible builds without the human ever typing a `docker` command.

This repo (DevSpec itself) also ships a [Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml), and a [CI workflow](.github/workflows/ci.yml) that uses the same image for typecheck + tests — same baseline locally and in CI.

## Project status

- **24 commands** + **5 `specs` subcommands** (init / list / status / delta / sync), **15 coherence rules** (11 per-change + 4 capability — one workspace-level), **6 fragment axes** (backend, frontend, architecture, methodology, infrastructure, pipeline) + universal common layer
- **220+ tests** (across unit, capability, coherence, and CLI integration suites) — all green
- **Capability specs (v1)** — living per-capability specs at `.devspec/specs/<capability>/spec.md`, edited by per-change deltas, merged at sync or archive time, guarded by 4 coherence rules, with reviewer + map + coordinator awareness
- **TypeScript** + Commander, runs on Node 22 LTS
- Cross-platform: Windows, macOS, Linux

### What's stable

- Lifecycle, phases, fragments, coherence, scaffold, ignore comments
- Claude Code integration via slash commands (iterate, review, refresh)
- CLAUDE.md generator with managed-block preservation

### What's intentionally minimal

- No remote registry of fragments — fragments live in this repo. To distribute, fork or contribute upstream.
- No automatic git operations — DevSpec writes files, you commit when ready.
- No telemetry — `devspec` doesn't phone home.
- No web UI — CLI-first, designed for terminal + editor + AI agent workflows.

---

## What DevSpec is not

- **Not a project manager.** It doesn't track sprints, assignees, or estimates.
- **Not a CI/CD tool.** It can be invoked from CI (`devspec check`, `devspec coherence --json --block-only`) but doesn't deploy anything.
- **Not a replacement for code review by humans.** The reviewer subagent catches mechanical drift; humans still own architectural and product judgement.
- **Not a way to skip thinking.** The contract still has to be written by a human (or co-authored). DevSpec automates the *enforcement* of clarity, not the clarity itself.

---

## License

MIT.

## Contributing

The DevSpec source is the same DevSpec workspace it scaffolds — `dogfooded`. To propose a change, `devspec plan "Your change"` against this repo and follow your own lifecycle.

### CI for this repository

The DevSpec repo's own CI lives in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and runs on every PR + push to main:

- **typecheck** — `tsc --noEmit` on Ubuntu + Node 22 (fast gatekeeper)
- **test** — full Vitest suite on a **3 OS × 2 Node matrix** (Ubuntu, macOS, Windows × Node 22 + 24) — catches platform regressions in `fs.watch`, path separators, shell quoting, etc.
- **smoke** — exercises the built CLI end-to-end in a tmp workspace: `init → env generate → plan → map → ci init → release --dry-run`. Catches release-breakers unit tests miss.
- **dogfood** — runs `devspec doctor` + `devspec check` + `devspec coherence` against the repo's own `.devspec/` workspace. Skips if no workspace exists yet; once one is initialized, the step gates on drift in DevSpec's own spec docs.
- **docker-parity** — runs typecheck + tests via `docker-compose` (single Ubuntu job) — keeps the local Docker-based dev loop honest.

### Releasing

Releases run via [`.github/workflows/release.yml`](.github/workflows/release.yml), triggered by `v*.*.*` tag push:

1. **verify** — re-runs typecheck + test + build, then checks `package.json` `version` matches the tag (catches forgotten `npm version` bumps).
2. **publish** — runs `npm publish --provenance --access public` against the `devspec` package, then creates a GitHub Release whose body is the matching `## v<version>` section extracted from `CHANGELOG.md` (with GitHub's auto-generated notes appended below).

**One-time repo setup**:

1. Create an npm Granular Access Token with publish rights for `devspec` on [npmjs.com/settings/tokens](https://www.npmjs.com/settings).
2. Add it as a repo secret named `NPM_TOKEN` (Settings → Secrets and variables → Actions).
3. Create a GitHub Environment named `npm-publish` (Settings → Environments). Optional: configure required reviewers for manual approval before each publish — recommended while pre-1.0.

**The release flow itself**:

```bash
# Locally, on a clean main branch:
npm version patch|minor|major --no-git-tag-version   # bumps package.json
devspec release                                       # parses commits → writes CHANGELOG → creates annotated tag
git push --follow-tags                                # triggers release.yml
```

The `verify` step refuses to publish if the tag and `package.json` version disagree, so don't skip the `npm version` bump.
