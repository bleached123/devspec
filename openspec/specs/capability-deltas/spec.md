# capability-deltas Specification

## Purpose
TBD - created by archiving change delta-specs-foundational. Update Purpose after archive.
## Requirements
### Requirement: Capability spec storage location

The system SHALL store living capability specs at `.devspec/specs/<capability>/spec.md`, with one file per capability.

#### Scenario: Initialise a new capability

- **WHEN** a user runs `devspec specs init user-auth` in a workspace with no existing `.devspec/specs/user-auth/` directory
- **THEN** the file `.devspec/specs/user-auth/spec.md` is created containing a `## Requirements` heading and an instructional placeholder line

#### Scenario: Initialise is idempotent

- **WHEN** a user runs `devspec specs init user-auth` and `.devspec/specs/user-auth/spec.md` already exists with content
- **THEN** the existing file is left unmodified and the command exits with success

### Requirement: Capability names are kebab-case

The system SHALL reject capability names that are not lowercase kebab-case (matching `^[a-z][a-z0-9-]*$`).

#### Scenario: Reject capital letters or underscores

- **WHEN** a user runs `devspec specs init User_Auth`
- **THEN** the command exits with non-zero status and an error message naming the kebab-case rule, and no files are created

### Requirement: Delta storage location

The system SHALL store per-change deltas at `.devspec/projects/<slug>/deltas/<capability>/spec.md`, one delta file per capability touched by the change.

#### Scenario: Scaffold a delta inside a change

- **WHEN** a user runs `devspec specs delta cancel-booking user-auth` against an existing change `cancel-booking` and an initialised capability `user-auth`
- **THEN** the file `.devspec/projects/cancel-booking/deltas/user-auth/spec.md` is created containing scaffold blocks for `## ADDED Requirements`, `## MODIFIED Requirements`, and `## REMOVED Requirements`

### Requirement: Strict capability resolution at delta time

The system SHALL refuse to scaffold a delta for a capability that has not been initialised.

#### Scenario: Delta for unknown capability

- **WHEN** a user runs `devspec specs delta cancel-booking pricing` and `.devspec/specs/pricing/spec.md` does not exist
- **THEN** the command exits with non-zero status, no files are created under `deltas/pricing/`, and the error message instructs the user to run `devspec specs init pricing` first

### Requirement: List capabilities with sync status

The system SHALL list every capability defined in the workspace alongside whether any in-flight change has unsynced deltas against it.

#### Scenario: List shows clean capabilities

- **WHEN** a user runs `devspec specs list` and no in-flight change has unsynced deltas
- **THEN** each capability appears with a "clean" status marker

#### Scenario: List flags dirty capabilities

- **WHEN** a user runs `devspec specs list` and an in-flight change `cancel-booking` has unsynced deltas against capability `user-auth`
- **THEN** `user-auth` is shown with a "dirty" status marker and `cancel-booking` is named as the change responsible

### Requirement: Status query for a change

The system SHALL report the set of capabilities with pending unsynced deltas for a specified change.

#### Scenario: Change with pending deltas

- **WHEN** a user runs `devspec specs status cancel-booking` and the change has unsynced deltas against `user-auth` and `billing`
- **THEN** the output lists both capability names as pending for that change

#### Scenario: Change with no pending deltas

- **WHEN** a user runs `devspec specs status cancel-booking` and the change has no unsynced deltas (no deltas exist, or all have been renamed to `.synced`)
- **THEN** the output reports "clean" for the change

### Requirement: ADDED Requirements append to capability spec

The system SHALL append each requirement in a delta's `## ADDED Requirements` block to the `## Requirements` section of the target capability spec when sync runs.

#### Scenario: ADDED requirement is appended

- **WHEN** a delta contains `### Requirement: Hardware key support` under `## ADDED Requirements`, the target capability spec exists but does not contain that heading, and the user runs `devspec specs sync cancel-booking`
- **THEN** after sync the capability spec contains `### Requirement: Hardware key support` and its body, appended at the end of the `## Requirements` section

### Requirement: MODIFIED Requirements replace existing body

The system SHALL replace the body of an existing requirement with the body from the delta when sync runs on a `## MODIFIED Requirements` block.

#### Scenario: MODIFIED requirement updates body

- **WHEN** a delta contains `### Requirement: Session token storage` under `## MODIFIED Requirements`, the capability spec already contains `### Requirement: Session token storage` with body text "X", the delta's body text is "Y", and the user runs sync
- **THEN** after sync the capability spec's `### Requirement: Session token storage` body is "Y" (the delta's text), and surrounding requirements are unchanged

### Requirement: REMOVED Requirements delete from capability spec

The system SHALL delete the matching requirement heading and its body from the capability spec when sync runs on a `## REMOVED Requirements` block.

#### Scenario: REMOVED requirement is deleted

- **WHEN** a delta contains `### Requirement: Legacy MD5 fallback` under `## REMOVED Requirements`, the capability spec already contains that heading, and the user runs sync
- **THEN** after sync the capability spec no longer contains the `### Requirement: Legacy MD5 fallback` heading or its body, and surrounding requirements remain unchanged

### Requirement: Sync validates target headings before applying

The system SHALL refuse to apply any block of a sync when the block's heading violates the merge contract, leaving every capability spec file unchanged on validation failure.

#### Scenario: MODIFIED target heading missing

- **WHEN** a delta has `### Requirement: Phantom` under `## MODIFIED Requirements`, the capability spec does not contain that heading, and the user runs sync
- **THEN** sync exits with non-zero status, the capability spec is not modified, no delta files are renamed, and the error message names the missing heading

#### Scenario: ADDED heading collides with existing requirement

- **WHEN** a delta has `### Requirement: Already there` under `## ADDED Requirements`, the capability spec already contains that heading, and the user runs sync
- **THEN** sync exits with non-zero status, the capability spec is not modified, no delta files are renamed, and the error message directs the user to use MODIFIED instead

#### Scenario: REMOVED target heading missing

- **WHEN** a delta has `### Requirement: Ghost` under `## REMOVED Requirements`, the capability spec does not contain that heading, and the user runs sync
- **THEN** sync exits with non-zero status, the capability spec is not modified, and no delta files are renamed

### Requirement: Dry-run previews without writing

The system SHALL render the would-be post-sync content of every affected capability spec without modifying any file when `--dry-run` is passed.

#### Scenario: Dry-run prints preview

- **WHEN** a user runs `devspec specs sync cancel-booking --dry-run` against a change with valid unsynced deltas
- **THEN** the command prints the post-merge content of each affected capability spec to stdout, the capability spec files on disk are unchanged, and the delta files are not renamed

### Requirement: Sync writes capability specs atomically

The system SHALL write each capability spec via temp file + rename so partial writes are never observable.

#### Scenario: Sync interrupted mid-write

- **WHEN** a sync process is interrupted (process killed) after deltas have been validated and the temp file has been opened but before the rename completes
- **THEN** the original capability spec file is unchanged when the workspace is inspected after the interrupt

### Requirement: Synced delta marker

The system SHALL mark a delta as synced by renaming the delta file with a `.synced` suffix rather than deleting it.

#### Scenario: Successful sync renames delta

- **WHEN** `devspec specs sync cancel-booking` completes successfully for capability `user-auth`
- **THEN** the file `.devspec/projects/cancel-booking/deltas/user-auth/spec.md` is renamed to `.devspec/projects/cancel-booking/deltas/user-auth/spec.md.synced`

#### Scenario: Synced delta is excluded from pending status

- **WHEN** a delta file under a change has been renamed to `.synced` and the user runs `devspec specs status <slug>`
- **THEN** that capability is not listed as pending for that change

### Requirement: Archive auto-syncs unsynced deltas

The system SHALL run sync as the first step of `devspec archive <slug>` whenever the change has unsynced deltas.

#### Scenario: Archive with deltas auto-syncs

- **WHEN** a user runs `devspec archive cancel-booking` and the change has at least one unsynced delta
- **THEN** every unsynced delta is merged into its target capability spec before the change directory is moved to `.devspec/archive/`

#### Scenario: Archive aborts on sync failure

- **WHEN** a user runs `devspec archive cancel-booking` and one of the change's deltas fails sync validation
- **THEN** the archive operation aborts, the change directory remains under `.devspec/projects/`, capability specs are not modified, and the error message names the failing delta

### Requirement: Archive no-sync escape

The system SHALL skip the sync step and archive the change with deltas intact when `--no-sync` is passed to `devspec archive`.

#### Scenario: No-sync archives without merge

- **WHEN** a user runs `devspec archive cancel-booking --no-sync` and the change has unsynced deltas
- **THEN** no capability spec is modified, the delta files are not renamed, and the change directory (deltas included) is moved to `.devspec/archive/cancel-booking/`

### Requirement: Capability frontmatter in contract.md

The system SHALL accept an optional YAML frontmatter block at the top of `contract.md` containing a `capability:` list.

#### Scenario: Contract with capability frontmatter

- **WHEN** a `contract.md` file begins with `---\ncapability:\n  - user-auth\n---\n` followed by the existing contract body
- **THEN** `devspec specs delta <slug> user-auth` proceeds without warning, and existing commands that read the contract (scaffold, coherence) continue to function

#### Scenario: Contract without frontmatter still works

- **WHEN** a `contract.md` file has no YAML frontmatter
- **THEN** every existing command that reads the contract continues to function unchanged, and `devspec archive <slug>` succeeds without attempting to sync

### Requirement: Explicit-execution sync skill

The system SHALL ship a Claude Code skill named `devspec-sync` and a corresponding `/devspec-sync` slash command that wraps `devspec specs sync` with a dry-run preview and a confirmation prompt.

#### Scenario: Skill previews before applying

- **WHEN** a user invokes the `devspec-sync` skill against a workspace with unsynced deltas
- **THEN** the skill runs `devspec specs sync <slug> --dry-run` first, presents the rendered preview, and prompts the user for confirmation before invoking the live sync

#### Scenario: Skill is registered in claude-assets

- **WHEN** `devspec init` runs in a fresh workspace
- **THEN** `.claude/skills/devspec-sync/` and `.claude/commands/devspec-sync.md` are present alongside the existing DevSpec skills and commands

### Requirement: Additive integration with existing changes

The system SHALL leave the behaviour of changes without `capability:` frontmatter and without a `deltas/` subdirectory unchanged.

#### Scenario: Legacy change archives without invoking sync

- **WHEN** a change has no `capability:` frontmatter, no `deltas/` subdirectory, and the user runs `devspec archive <slug>`
- **THEN** archive proceeds without invoking the sync engine, no capability spec is read or written, and the operation matches pre-feature behaviour

#### Scenario: Legacy workspace continues to operate

- **WHEN** a workspace has no `.devspec/specs/` directory and the user runs existing commands (`devspec status`, `devspec coherence`, `devspec check`, `devspec scaffold`)
- **THEN** every command continues to function as before, with no requirement that capability specs exist

### Requirement: Coherence rule capability-exists flags orphaned delta directories

The system SHALL emit a warning-severity coherence drift for every `deltas/<capability>/` subdirectory inside an active change where `.devspec/specs/<capability>/spec.md` does not exist.

#### Scenario: Orphaned delta directory is flagged

- **WHEN** an active change has `.devspec/projects/<slug>/deltas/pricing/spec.md` and `.devspec/specs/pricing/spec.md` does not exist
- **THEN** running `devspec coherence <slug>` produces a `capability-exists` finding with severity `warn`, message naming the unknown capability `pricing`, and a remediation hinting at `devspec specs init pricing`

#### Scenario: Change with no deltas produces no capability-exists findings

- **WHEN** an active change has no `deltas/` subdirectory
- **THEN** the `capability-exists` rule emits zero findings for that change

#### Scenario: Ignore marker suppresses the finding

- **WHEN** a change with an orphaned delta also contains `<!-- devspec:ignore capability-exists -->` in any of its lifecycle documents
- **THEN** the rule emits zero findings for that change

### Requirement: Coherence rule delta-format catches malformed delta files

The system SHALL parse every delta file under a change's `deltas/` tree and emit a warning-severity coherence drift for each of: an unrecognised `## ... Requirements` block header, a `### Requirement:` heading appearing outside any recognised block, an `ADDED` or `MODIFIED` requirement with empty body after whitespace trimming, and a duplicate `### Requirement: <name>` within the same block of the same file.

#### Scenario: Typo'd block header is flagged

- **WHEN** a delta file contains `## ADDDED Requirements` (triple D)
- **THEN** the `delta-format` rule emits a finding identifying the malformed header and the canonical alternatives (`ADDED`, `MODIFIED`, `REMOVED`)

#### Scenario: Requirement outside known block is flagged

- **WHEN** a delta file contains a `### Requirement: Foo` heading with no preceding `## ADDED|MODIFIED|REMOVED Requirements` block header
- **THEN** the `delta-format` rule emits a finding naming the orphan requirement

#### Scenario: Empty body in ADDED requirement is flagged

- **WHEN** an `## ADDED Requirements` block contains `### Requirement: Foo` with no body content before the next heading or end-of-file
- **THEN** the `delta-format` rule emits a finding for the empty-body requirement

#### Scenario: Duplicate requirement in same block is flagged

- **WHEN** an `## ADDED Requirements` block contains two `### Requirement: Foo` headings
- **THEN** the `delta-format` rule emits a finding identifying the duplicate

#### Scenario: HTML comments are ignored when parsing

- **WHEN** a delta file contains `<!-- ### Requirement: Inside comment -->` or similar within an HTML comment
- **THEN** the `delta-format` rule does not flag the comment content

#### Scenario: Production-phase escalation to block

- **WHEN** the workspace phase is `production` and a `delta-format` finding fires
- **THEN** the finding severity is reported as `block` (via the existing strict-mode escalation)

### Requirement: Coherence rule delta-capability-match enforces frontmatter agreement

The system SHALL, for every active change with a `capability:` frontmatter list in `contract.md`, emit a warning-severity coherence drift for each declared capability that has no matching `deltas/<capability>/spec.md` (or `.synced` variant), and for each `deltas/<capability>/` subdirectory not present in the declared list.

#### Scenario: Declared capability with no matching delta is flagged

- **WHEN** `contract.md` has `capability:\n  - user-auth\n  - billing` frontmatter and `deltas/billing/` does not exist
- **THEN** the `delta-capability-match` rule emits a finding for the missing `billing` delta

#### Scenario: Extra delta directory not declared in frontmatter is flagged

- **WHEN** `contract.md` declares only `user-auth` but `deltas/billing/spec.md` exists
- **THEN** the `delta-capability-match` rule emits a finding for the undeclared `billing` delta directory

#### Scenario: No frontmatter means no findings

- **WHEN** `contract.md` has no `capability:` frontmatter (the opt-in declaration is absent)
- **THEN** the `delta-capability-match` rule emits zero findings, regardless of `deltas/` contents

### Requirement: Workspace coherence rule requirement-conflict detects cross-change collisions

The system SHALL provide a workspace-level coherence rule `requirement-conflict` that scans every active change's pending deltas and emits a block-severity drift whenever two or more active changes propose any of: the same `MODIFIED` requirement name in the same capability, the same `REMOVED` requirement name in the same capability, the same `ADDED` requirement name in the same capability, or a mix of `MODIFY` and `REMOVE` on the same requirement.

#### Scenario: Two changes MODIFY the same requirement

- **WHEN** active changes `change-a` and `change-b` each have a delta against capability `user-auth` modifying `### Requirement: Session storage`
- **THEN** `requirement-conflict` emits one block-severity workspace drift naming both slugs, the capability `user-auth`, the requirement `Session storage`, and the conflict kind `modify-modify`

#### Scenario: One change MODIFIES, another REMOVES the same requirement

- **WHEN** `change-a` MODIFIES and `change-b` REMOVES `### Requirement: Session storage` in capability `user-auth`
- **THEN** `requirement-conflict` emits a finding with conflict kind `modify-remove`

#### Scenario: Two changes ADD the same requirement

- **WHEN** `change-a` and `change-b` both add `### Requirement: Hardware key support` in capability `user-auth`
- **THEN** `requirement-conflict` emits a finding with conflict kind `add-add`

#### Scenario: Changes touching different requirements produce no conflict

- **WHEN** `change-a` modifies `### Requirement: Session storage` and `change-b` modifies `### Requirement: Password reset` in capability `user-auth`
- **THEN** `requirement-conflict` emits zero findings

#### Scenario: Ignore marker in one change removes it from the conflict set

- **WHEN** two changes collide on `### Requirement: Session storage` and `change-a` has `<!-- devspec:ignore requirement-conflict -->` in any of its docs
- **THEN** `change-a` is excluded from the conflict set; if `change-b` is the only remaining change, the finding is dropped

### Requirement: Coherence runner supports workspace-level rules

The system SHALL provide a `WorkspaceRule` rule type with the signature `check(ctx: WorkspaceContext) => Promise<WorkspaceDrift[]>` and a workspace runner pass that runs registered workspace rules and aggregates findings across all active changes.

#### Scenario: Workspace runner invokes registered workspace rules

- **WHEN** the workspace coherence runner is invoked
- **THEN** every registered workspace rule's `check` is called exactly once with a `WorkspaceContext` exposing the workspace root, the list of active slugs, and a function to load each change's state on demand

#### Scenario: Workspace drift findings include affected slugs

- **WHEN** a workspace rule emits a finding affecting `change-a` and `change-b`
- **THEN** the finding's `slugs` array contains both `change-a` and `change-b`

#### Scenario: Per-change coherence filters workspace findings to the named change

- **WHEN** `devspec coherence change-a` is invoked and a workspace drift names both `change-a` and `change-b`
- **THEN** the per-change report includes the drift; running `devspec coherence change-c` (an unrelated change) omits it

### Requirement: Reviewer subagent reads merged-preview of capability spec for changes with deltas

The system SHALL instruct the `devspec-review` skill and the `devspec-iterate` reviewer step to invoke `devspec specs sync <slug> --dry-run --json` whenever the reviewed change has a `deltas/` subdirectory, and to treat each capability's `preview` field as the source of truth for "what the capability promises post-merge".

#### Scenario: Reviewer invokes dry-run sync on a change with deltas

- **WHEN** a reviewer subagent is reviewing a change `cancel-booking` whose directory contains `deltas/user-auth/spec.md`
- **THEN** the reviewer subagent SHALL run `devspec specs sync cancel-booking --dry-run --json` as part of its required reads

#### Scenario: Reviewer treats preview as spec of record

- **WHEN** the dry-run returns a `preview` for capability `user-auth` containing a modified `### Requirement: Session storage` body
- **THEN** the reviewer evaluates the implementation against the NEW body, not the pre-merge body in `.devspec/specs/user-auth/spec.md`

#### Scenario: Reviewer short-circuits on capability validation errors

- **WHEN** the dry-run returns at least one capability with `status: "error"` and non-empty `errors`
- **THEN** the reviewer emits exactly one finding with `severity: block`, `category: spec-match`, message naming the validation failure, and does not proceed with line-by-line review

#### Scenario: Reviewer skips merged-preview step for changes without deltas

- **WHEN** a reviewed change has no `deltas/` subdirectory
- **THEN** the reviewer does not invoke `devspec specs sync --dry-run` and falls back to the pre-Slice-2 review behaviour

### Requirement: devspec map emits a capability index at maps/capabilities/index.md

The system SHALL, on `devspec map`, write a capability index file at `.devspec/maps/capabilities/index.md` listing every capability defined under `.devspec/specs/`, with each entry linking to a per-capability drill-down page.

#### Scenario: Capability index is generated

- **WHEN** the workspace has capabilities `user-auth` and `billing` and `devspec map` runs
- **THEN** the file `.devspec/maps/capabilities/index.md` exists, contains entries for both capabilities, links to `capabilities/user-auth.md` and `capabilities/billing.md`, and includes a breadcrumb back to `workspace.md`

#### Scenario: Workspace with no capabilities produces no capability index

- **WHEN** the workspace has no `.devspec/specs/` directory or no capability subdirectories within it
- **THEN** `devspec map` does not create the `capabilities/index.md` file (or creates an empty placeholder noting "no capabilities defined")

### Requirement: devspec map emits per-capability drill-down files

The system SHALL emit one drill-down file per capability at `.devspec/maps/capabilities/<capability>.md` containing the capability's current requirements, a list of in-flight changes touching it with their pending ADDED/MODIFIED/REMOVED counts, and archived contributors.

#### Scenario: Capability drill-down lists current requirements

- **WHEN** `.devspec/specs/user-auth/spec.md` contains three `### Requirement:` headings
- **THEN** `.devspec/maps/capabilities/user-auth.md` lists all three by name with links to the source

#### Scenario: Capability drill-down lists in-flight changes with delta counts

- **WHEN** active change `cancel-booking` has a delta against `user-auth` with 1 ADDED and 1 MODIFIED requirement
- **THEN** `.devspec/maps/capabilities/user-auth.md` lists `cancel-booking` in the "Active changes" table with counts `+1 ~1 -0`

#### Scenario: Capability drill-down lists archived contributors

- **WHEN** archived change `old-feature` contains `deltas/user-auth/spec.md.synced` (was synced before archive)
- **THEN** `.devspec/maps/capabilities/user-auth.md` lists `old-feature` in the "Archived contributors" section with its archive timestamp

### Requirement: devspec map watch regenerates capability maps on relevant edits

The system SHALL, when `devspec map --watch` is running, regenerate the affected `capabilities/<cap>.md` and `capabilities/index.md` files whenever any file under `.devspec/specs/` or `.devspec/projects/*/deltas/` is created, modified, or deleted.

#### Scenario: Edit to capability spec triggers regeneration

- **WHEN** `devspec map --watch` is running and a user edits `.devspec/specs/user-auth/spec.md`
- **THEN** within the watcher's debounce window, `.devspec/maps/capabilities/user-auth.md` is regenerated

#### Scenario: Edit to delta file triggers regeneration

- **WHEN** `devspec map --watch` is running and a user edits `.devspec/projects/cancel-booking/deltas/user-auth/spec.md`
- **THEN** within the watcher's debounce window, `.devspec/maps/capabilities/user-auth.md` is regenerated

### Requirement: L0 workspace map links to capability index

The system SHALL update the L0 workspace map (`maps/workspace.md`) to include a "Capabilities" section linking to `capabilities/index.md` whenever at least one capability is defined.

#### Scenario: Workspace map includes capabilities link when capabilities exist

- **WHEN** the workspace has at least one capability defined and `devspec map` runs
- **THEN** `.devspec/maps/workspace.md` contains a "Capabilities" section with a link to `capabilities/index.md`

#### Scenario: Workspace map omits capabilities link when none exist

- **WHEN** the workspace has zero capabilities defined and `devspec map` runs
- **THEN** `.devspec/maps/workspace.md` does not contain a "Capabilities" section

### Requirement: devspec-coordinate detects cross-change capability conflicts

The system SHALL extend the `devspec-coordinate` skill to scan all active changes' pending deltas and surface findings whenever two or more changes touch the same `(capability, requirement-name)` tuple under MODIFY, REMOVE, or ADD operations.

#### Scenario: Coordinate flags two changes modifying the same requirement

- **WHEN** `/devspec-coordinate` runs in a workspace where `change-a` and `change-b` both MODIFY `### Requirement: Session storage` in capability `user-auth`
- **THEN** the skill produces a finding with `category: capability-conflict`, `severity: block`, message naming both slugs and the colliding requirement, and a resolution proposal suggesting rebase

#### Scenario: Coordinate emits no capability findings when no collisions exist

- **WHEN** active changes touch different capabilities or different requirements within the same capability
- **THEN** the coordinator emits zero `capability-conflict` findings

### Requirement: CLAUDE.md generator includes a Capability specs subsection

The system SHALL, on `devspec claude` and `devspec init`, include a "Capability specs (v1)" subsection inside the managed `<!-- devspec:claude:start -->` / `<!-- devspec:claude:end -->` block, explaining the per-change delta model, the relevant commands, and the convention that the contract's `capability:` frontmatter declares the change's capability scope.

#### Scenario: CLAUDE.md contains capability specs subsection after generation

- **WHEN** `devspec claude` runs in any workspace
- **THEN** the resulting `CLAUDE.md` contains a heading naming "Capability specs" within the managed block, and the body references `.devspec/specs/<capability>/spec.md`, `### Requirement:` headings, and at least one of the capability CLI commands

#### Scenario: Re-running devspec claude preserves user content outside markers

- **WHEN** a user has added custom content above the managed-block start marker and then runs `devspec claude` again
- **THEN** the custom content is preserved verbatim, only the managed block contents are regenerated

### Requirement: common/standards.md documents capability specs vs contracts

The system SHALL include a "Capability specs vs contracts" section in `src/packs/common/standards.md` distinguishing per-change contracts from per-capability living specs, with guidance on when to introduce a new capability versus modifying an existing one.

#### Scenario: Common standards file contains capability specs section

- **WHEN** the `src/packs/common/standards.md` pack source is loaded
- **THEN** the file contains a `## Capability specs vs contracts` (or equivalent) heading and body referencing both `contract.md` and `.devspec/specs/<capability>/spec.md`

### Requirement: devspec init propagates capability-specs section into merged standards

The system SHALL, on `devspec init`, include the capability-specs section content from `common/standards.md` in the merged `.devspec/standards/standards.md` file written into every new workspace.

#### Scenario: Newly initialised workspace contains capability-specs section in standards

- **WHEN** `devspec init` is run in an empty directory
- **THEN** the resulting `.devspec/standards/standards.md` contains the capability-specs vs contracts section sourced from `common/standards.md`

### Requirement: Coherence JSON output preserves Slice 1 shape additively

The system SHALL, when `devspec coherence <slug> --json` is invoked, return a JSON object whose `drifts` array includes the four new rule names (`capability-exists`, `delta-format`, `delta-capability-match`, `requirement-conflict`) as additional entries without modifying existing field names, types, or removing prior fields.

#### Scenario: Existing drift fields are unchanged

- **WHEN** `devspec coherence <slug> --json` runs and produces drift entries for both pre-Slice-2 rules and new rules
- **THEN** each drift entry retains the existing fields (`rule`, `severity`, `message`, `hint`, `remediations`) with their original types; new rules' entries use the same shape

### Requirement: Specs status and list JSON shapes are stable

The system SHALL preserve the JSON output shapes of `devspec specs list --json`, `devspec specs status --json`, and `devspec specs sync --json` (introduced in Slice 1) unchanged in this slice — no field renames, type changes, or removals.

#### Scenario: specs status JSON shape preserved

- **WHEN** `devspec specs status <slug> --json` is invoked
- **THEN** the output is an array of `{ slug, pending, synced }` objects matching the Slice 1 shape exactly, regardless of new coherence rules or map files

#### Scenario: specs sync JSON shape preserved

- **WHEN** `devspec specs sync <slug> --json` (with or without `--dry-run`) is invoked
- **THEN** the output is a `{ slug, results, ok }` object whose `results` array entries have the Slice 1 shape (`{ capability, status, errors?, preview? }`)

