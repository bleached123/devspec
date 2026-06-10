## ADDED Requirements

### Requirement: Namespaced slash command layout

The system SHALL ship DevSpec slash commands under `.claude/commands/devspec/` as a subfolder, exposing each command as `/devspec:<verb>` (colon-namespaced) rather than `/devspec-<verb>` (flat).

#### Scenario: A fresh workspace has subfolder command layout

- **WHEN** `devspec init` is run in an empty directory and successfully completes
- **THEN** `.claude/commands/devspec/` exists as a directory and contains at least one `<verb>.md` file (e.g. `iterate.md`)

#### Scenario: The flat layout is no longer the default

- **WHEN** `devspec init` is run in an empty directory
- **THEN** the workspace does not contain any flat-layout `.claude/commands/devspec-<verb>.md` files (top level)

### Requirement: Five new skill+command pairs cover the previously-CLI-only lifecycle

The system SHALL ship five new Claude Code skill+command pairs — `devspec-explore`, `devspec-new`, `devspec-continue`, `devspec-verify`, and `devspec-archive` — each consisting of a `SKILL.md` under `.claude/skills/<skill-name>/` and a slash-command file at `.claude/commands/devspec/<verb>.md`.

#### Scenario: All five skill directories ship into workspaces

- **WHEN** `devspec init` runs in a fresh workspace
- **THEN** each of `.claude/skills/devspec-explore/SKILL.md`, `.claude/skills/devspec-new/SKILL.md`, `.claude/skills/devspec-continue/SKILL.md`, `.claude/skills/devspec-verify/SKILL.md`, and `.claude/skills/devspec-archive/SKILL.md` exists

#### Scenario: All five new slash commands ship into workspaces

- **WHEN** `devspec init` runs in a fresh workspace
- **THEN** each of `.claude/commands/devspec/explore.md`, `.claude/commands/devspec/new.md`, `.claude/commands/devspec/continue.md`, `.claude/commands/devspec/verify.md`, and `.claude/commands/devspec/archive.md` exists

### Requirement: Four command counterparts for previously skill-only entries

The system SHALL ship slash-command counterparts for `devspec-onboard`, `devspec-grill`, `devspec-triage`, and `devspec-uat-design` at `.claude/commands/devspec/<verb>.md`, where each command file explicitly invokes the matching skill.

#### Scenario: Each existing skill has a matching slash command

- **WHEN** `devspec init` runs in a fresh workspace
- **THEN** each of `.claude/commands/devspec/onboard.md`, `.claude/commands/devspec/grill.md`, `.claude/commands/devspec/triage.md`, and `.claude/commands/devspec/uat-design.md` exists

### Requirement: Existing slash commands migrate to the subfolder layout

The system SHALL place the previously-flat-layout DevSpec slash commands (`iterate`, `iterate-all`, `review`, `coordinate`, `refresh-standards`, `sync`) under `.claude/commands/devspec/` rather than `.claude/commands/devspec-*.md`.

#### Scenario: Existing commands appear in the subfolder

- **WHEN** `devspec init` runs in a fresh workspace
- **THEN** each of `.claude/commands/devspec/iterate.md`, `.claude/commands/devspec/iterate-all.md`, `.claude/commands/devspec/review.md`, `.claude/commands/devspec/coordinate.md`, `.claude/commands/devspec/refresh-standards.md`, and `.claude/commands/devspec/sync.md` exists

### Requirement: devspec-explore skill is AI-driven thinking partner

The system SHALL provide a `devspec-explore` skill whose frontmatter description identifies it as a thinking-partner skill for DevSpec lifecycle exploration, and whose body walks the user through pre-change ideation without committing changes to the workspace.

#### Scenario: Skill description matches discovery use case

- **WHEN** the `devspec-explore` SKILL.md is loaded
- **THEN** its YAML frontmatter contains a `description` field referencing exploration/thinking-partner behaviour and an explicit cue (e.g. invoked via `/devspec:explore` or when the user wants to think through ideas)

#### Scenario: Skill body does not write files automatically

- **WHEN** the `devspec-explore` skill is read
- **THEN** the skill instructs the agent to think with the user and only write files (via `devspec plan` etc.) on explicit user confirmation — the skill itself does not commit to disk unprompted

### Requirement: devspec-new skill creates a new change interactively

The system SHALL provide a `devspec-new` skill that interviews the user for a change title and (optionally) change type, invokes `devspec plan <title>`, and offers to chain into the `devspec-grill` skill for the discovery stage.

#### Scenario: Skill body invokes devspec plan

- **WHEN** the `devspec-new` SKILL.md is read
- **THEN** the body includes an instruction to run `devspec plan` with the user-supplied title (after confirming kebab-case slug derivation)

#### Scenario: Skill suggests chaining into grill

- **WHEN** the `devspec-new` skill completes the plan step
- **THEN** the body instructs the agent to offer the user to continue into `devspec-grill` for the discovery stage

### Requirement: devspec-continue skill routes to the next lifecycle action

The system SHALL provide a `devspec-continue` skill that inspects a change's state (unfilled stages, post-contract scaffold need, post-scaffold iteration need) and routes the user to the appropriate next action — invoking `devspec-grill` for unfilled stages, running `devspec scaffold` post-contract, or suggesting `/devspec:iterate` post-scaffold.

#### Scenario: Skill body covers all router branches

- **WHEN** the `devspec-continue` SKILL.md is read
- **THEN** the body distinguishes branches: stages still unfilled → invoke grill; contract done but no scaffold yet → run scaffold; scaffold done but tests not implemented → suggest iterate; all done → suggest verify

### Requirement: devspec-verify skill is the coherence gate

The system SHALL provide a `devspec-verify` skill that runs `devspec coherence <slug>` (which includes workspace-level rules after delta-specs-guards), reports the result, and explicitly blocks the suggested next-action of "archive" when any block-severity drift remains.

#### Scenario: Verify reports zero blocks before suggesting archive

- **WHEN** the `devspec-verify` skill runs against a change with zero blocking drifts
- **THEN** the body's flow suggests `/devspec:archive <slug>` as the next action

#### Scenario: Verify withholds archive suggestion when blocks exist

- **WHEN** the `devspec-verify` skill runs against a change with at least one block-severity drift
- **THEN** the body's flow does not suggest archive and instead lists the blocking findings with remediations

### Requirement: devspec-archive skill enforces preconditions

The system SHALL provide a `devspec-archive` skill that, before invoking `devspec archive <slug>`, verifies all lifecycle stages are done, runs a final coherence check (zero blocks), and confirms with the user — particularly when pending capability deltas exist.

#### Scenario: Archive skill aborts when stages incomplete

- **WHEN** the `devspec-archive` skill runs against a change with at least one stage not marked done
- **THEN** the body instructs the agent to surface which stages are incomplete and stop rather than invoke `devspec archive`

#### Scenario: Archive skill confirms with delta context

- **WHEN** the `devspec-archive` skill runs against a change with pending capability deltas
- **THEN** the body instructs the agent to surface the pending deltas and ask the user whether to sync them in-place or pass `--no-sync` to discard

### Requirement: Claude assets registration covers the new layout

The system SHALL update `src/core/claude-assets.ts` so that the asset-sync routine reads commands from `.claude/commands/devspec/` (subfolder) and skills from the expanded `DEVSPEC_SKILLS` array (now including `devspec-explore`, `devspec-new`, `devspec-continue`, `devspec-verify`, `devspec-archive`), and writes them to the target workspace's matching paths.

#### Scenario: All current commands and skills appear in the source arrays

- **WHEN** the source `DEVSPEC_COMMANDS` and `DEVSPEC_SKILLS` arrays are inspected
- **THEN** `DEVSPEC_COMMANDS` contains entries for each of the 10 commands (iterate, iterate-all, review, coordinate, refresh-standards, sync, explore, new, continue, verify, archive — 11 actually after adding the 5 new, BUT also the 4 onboarding ones... so 15 total), and `DEVSPEC_SKILLS` contains entries for each of the 9 skills (onboard, grill, triage, uat-design, sync, explore, new, continue, verify, archive — 10 total)

#### Scenario: syncClaudeAssets writes the new layout

- **WHEN** `syncClaudeAssets(workspaceRoot)` is invoked against an empty workspace
- **THEN** every command from `DEVSPEC_COMMANDS` lands at `.claude/commands/devspec/<verb>.md` in the workspace, and every skill from `DEVSPEC_SKILLS` lands at `.claude/skills/<skill-name>/SKILL.md`

### Requirement: README and CLAUDE.md reference the new slash command syntax

The system SHALL update all references to DevSpec slash commands in `README.md` and the `CLAUDE.md` generator to use the namespaced `/devspec:<verb>` syntax rather than the flat `/devspec-<verb>` syntax.

#### Scenario: README uses the new syntax

- **WHEN** the README is searched for `/devspec-` (flat syntax)
- **THEN** no references to flat-syntax slash commands remain in the README body

#### Scenario: CLAUDE.md generator emits new syntax

- **WHEN** `devspec claude` runs and writes the managed block
- **THEN** all slash-command references in the block use `/devspec:<verb>` form

### Requirement: Five new skills are AI-driven, archive skill is thin wrapper

The system SHALL implement four of the new skills (`devspec-explore`, `devspec-new`, `devspec-continue`, `devspec-verify`) as AI-driven workflows with structured user interaction (e.g. `AskUserQuestion`-style branching, draft-and-confirm patterns), and the `devspec-archive` skill as a thin wrapper with precondition checks but no open-ended interaction.

#### Scenario: AI-driven skills include interactive guidance

- **WHEN** any of `devspec-explore`, `devspec-new`, `devspec-continue`, `devspec-verify` SKILL.md files are read
- **THEN** the body contains explicit guidance to ask the user clarifying questions, draft output for confirmation, or otherwise be interactive rather than mechanical

#### Scenario: Archive skill is mechanical

- **WHEN** the `devspec-archive` SKILL.md is read
- **THEN** the body describes a fixed sequence (check preconditions → confirm → invoke archive → report) without open-ended questioning beyond the confirmation

### Requirement: CLI behaviour is unchanged

The system SHALL leave the `devspec` CLI's behaviour identical to its pre-skill-suite state. The new skills wrap CLI commands; they do not replace, modify, or shadow them.

#### Scenario: All existing CLI commands continue to function

- **WHEN** a user runs `devspec plan`, `devspec advance`, `devspec scaffold`, `devspec coherence`, `devspec archive`, or any other pre-existing CLI command in a workspace with the skill suite installed
- **THEN** the command behaves identically to its behaviour before the skill suite was added (no new flags, no changed output, no deprecation warnings)
