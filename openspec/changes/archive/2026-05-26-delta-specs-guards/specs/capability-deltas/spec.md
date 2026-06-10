## ADDED Requirements

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
