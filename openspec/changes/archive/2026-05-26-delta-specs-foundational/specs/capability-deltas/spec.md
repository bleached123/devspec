## ADDED Requirements

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
