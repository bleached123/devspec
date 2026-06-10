## Context

DevSpec's Claude Code surface today is asymmetric: five slash commands (`/devspec-iterate`, `/devspec-iterate-all`, `/devspec-review`, `/devspec-coordinate`, `/devspec-refresh-standards`) plus the `/devspec-sync` command added in the delta-specs slice cover specific operations, and five skills (`devspec-onboard`, `devspec-grill`, `devspec-triage`, `devspec-uat-design`, `devspec-sync`) cover interactive workflows. The remaining lifecycle actions are CLI-only. A user inside Claude Code cannot drive DevSpec end-to-end without reaching for a terminal.

OpenSpec, shipped alongside DevSpec in the repo's `.claude/commands/opsx/` folder, has 1:1 command coverage of its whole workflow under a colon-namespaced layout: `/opsx:explore`, `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:apply`, `/opsx:verify`, `/opsx:archive`, `/opsx:sync`, `/opsx:onboard`, `/opsx:bulk-archive`. The user has explicitly asked for the same shape for DevSpec — every lifecycle action invokable as a slash command, explicit-execution semantics, namespaced layout.

The five new lifecycle slots (`explore`, `new`, `continue`, `verify`, `archive`) line up with DevSpec's existing swim-lanes from the user's prior taxonomy: explore = idea lane; new = lifecycle entry; continue = lifecycle router; verify = coherence gate; archive = close-out. The four existing skills (`onboard`, `grill`, `triage`, `uat-design`) work today but lack explicit-execution entry points — only auto-invocation via description match. Adding command counterparts and namespacing the entire surface gives Claude Code users a clean `/devspec:*` palette that mirrors OpenSpec's `/opsx:*` palette.

## Goals / Non-Goals

**Goals:**

- Reach functional parity with OpenSpec's slash-command surface coverage of DevSpec's lifecycle: every lifecycle action invokable as `/devspec:<verb>`.
- Adopt the colon-namespaced layout (`/devspec:<verb>` via `.claude/commands/devspec/<verb>.md`) to mirror OpenSpec's convention and reduce visual noise in long command lists.
- Add five new skill+command pairs with AI-driven workflows for the operations that genuinely benefit from interactivity (explore, new, continue, verify), and a thin-wrapper skill for the mechanical operation (archive).
- Add four command counterparts for the existing skill-only entries (onboard, grill, triage, uat-design) so every skill has an explicit-execution invocation.
- Preserve every user's hand-edited content via the existing skip-on-exists logic in `syncClaudeAssets`.
- Keep the CLI completely unchanged so any external scripts continue to work.

**Non-Goals:**

- Backward-compatibility shims for an older layout. DevSpec is pre-ship; the namespaced layout is the only layout that has existed in a distributed form.
- VS Code extension surface for the new commands — sibling-repo concern, separate change.
- Renaming or restructuring the `devspec` CLI itself. CLI verbs (`devspec plan`, `devspec advance`, etc.) keep their names.
- New skills beyond the identified five. `bulk-archive`, `sync-contract`, and `uat-verify` could become future skill+command pairs but are not in this slice.
- A `/devspec:ff` skill. The user explicitly chose `grill` (interview-mode) as the artifact-generation workflow rather than a fast-forward.
- A separate plug-in / extension mechanism for third-party skills. The fragment system (`src/packs/`) is the extension point; skill discovery beyond the bundled set is out of scope.

## Decisions

### D1. Namespace via subfolder under `.claude/commands/`

**Chosen — `.claude/commands/devspec/<verb>.md` produces `/devspec:<verb>`.**

Claude Code parses subfolders under `.claude/commands/` as command namespaces using `:` as the separator. OpenSpec already uses this pattern (`.claude/commands/opsx/explore.md` → `/opsx:explore`). DevSpec adopting the same convention is mechanically simple — move files into a subfolder, no extension-API changes required.

**Alternatives considered:**

- **Flat dash-separated (`/devspec-explore`)**: keeps existing names but doesn't scale visually. With 14 commands the prefix `devspec-` becomes visual noise. Rejected.
- **Short prefix (`/ds:explore`)**: shorter to type but loses the DevSpec brand. The 4 extra characters of `devspec` are worth the explicit identification, especially given the workspace also has `opsx`, `openspec-*`, and other skill namespaces. Rejected.

### D2. Five new skills + 4 command counterparts + 6 renames (15 commands total)

The full set of commands DevSpec ships after this change:

```
/devspec:iterate              (existing, renamed from /devspec-iterate)
/devspec:iterate-all          (existing, renamed)
/devspec:review               (existing, renamed)
/devspec:coordinate           (existing, renamed)
/devspec:refresh-standards    (existing, renamed)
/devspec:sync                 (existing, renamed; came from delta-specs)
/devspec:explore              (NEW)
/devspec:new                  (NEW)
/devspec:continue             (NEW)
/devspec:verify               (NEW)
/devspec:archive              (NEW)
/devspec:onboard              (NEW command, invokes existing skill)
/devspec:grill                (NEW command, invokes existing skill)
/devspec:triage               (NEW command, invokes existing skill)
/devspec:uat-design           (NEW command, invokes existing skill)
```

Skills after this change (10 total):

```
devspec-onboard       (existing)
devspec-grill         (existing)
devspec-triage        (existing)
devspec-uat-design    (existing)
devspec-sync          (existing, from delta-specs)
devspec-explore       (NEW)
devspec-new           (NEW)
devspec-continue      (NEW)
devspec-verify        (NEW)
devspec-archive       (NEW)
```

### D3. AI-driven vs thin-wrapper split

Each new skill is classified by whether the operation benefits from interactivity:

| Skill | Pattern | Why |
|---|---|---|
| `devspec-explore` | AI-driven | Pure thinking-partner mode; structured questions, no commits |
| `devspec-new` | AI-driven | Interviews for title + change type; runs `devspec plan`; offers grill chain |
| `devspec-continue` | AI-driven | Router logic with branches; needs to read state and route to the right skill |
| `devspec-verify` | AI-driven | Reports coherence findings, decides whether archive is gated, asks user to act |
| `devspec-archive` | Thin wrapper | Mechanical: check preconditions, confirm, run `devspec archive` |

The thin-wrapper choice for `archive` keeps the skill body short and the operation predictable. The AI-driven choice for the other four matches the pattern set by existing `grill`, `triage`, and `uat-design` skills.

### D4. Command counterparts for existing skills

Each command file (e.g. `.claude/commands/devspec/onboard.md`) is a thin invocation marker: frontmatter `description`, body that names the skill explicitly so Claude Code can resolve and run it. Existing skills' SKILL.md files are NOT modified — the command files just give users an explicit-execution entry point in addition to auto-invocation.

### D5. `syncClaudeAssets` updates for subfolder layout

The asset-sync function in `src/core/claude-assets.ts` reads source files from the repo's own `.claude/` directory and copies them into target workspaces. The reads descend into the `devspec/` subfolder; the writes land in `.claude/commands/devspec/` in the target workspace.

```ts
// Resolution (subfolder)
const src = path.join(sourceRoot, "commands", "devspec", `${verb}.md`);
const dst = path.join(targetCommands, "devspec", `${verb}.md`);
// dst's parent directory is ensured before write
```

`DEVSPEC_COMMANDS` entries are bare verbs (e.g. `iterate`, not `devspec-iterate`).

Pre-ship note: DevSpec has not been published, so no workspaces with the old flat layout exist in the wild. The repo's own `.claude/commands/devspec-*.md` files are deleted in this slice (moved to the subfolder); no legacy-detection codepath exists.

### D6. Skill descriptions calibrated for auto-invocation

Each new SKILL.md frontmatter `description` field follows the existing DevSpec skill style: a sentence describing what the skill does + an "Use when ..." cue listing trigger phrases. Claude Code's auto-invocation reads these descriptions to decide when to fire a skill without explicit user invocation. Examples:

- `devspec-explore`: "Use when the user says 'let me think about', 'explore', 'before I commit', or invokes `/devspec:explore`."
- `devspec-archive`: "Use when the user says 'archive', 'close out', 'this change is done', or invokes `/devspec:archive`."

This means even if a user never types the slash command explicitly, the right skill fires when they describe the intent in natural language — matching the DX of the existing skills.

### D7. Skill bodies follow the established interview pattern

The four AI-driven skills (`explore`, `new`, `continue`, `verify`) follow the pattern set by `devspec-grill`, `devspec-triage`, and `devspec-uat-design`:

1. **Step 0**: gather state (run CLI commands like `devspec status --json`, `ls .devspec/projects/`)
2. **Step 1**: classify / route (which branch of the workflow are we in?)
3. **Step 2..N**: interactive interview / structured questions
4. **Final step**: act (run CLI commands) or hand off (suggest next skill or slash command)
5. **Guardrails**: explicit list of "what this skill does NOT do" (don't modify files unprompted, don't loop, don't skip CLI verification)

### D8. README references migrate atomically

Every `/devspec-<verb>` reference in `README.md` becomes `/devspec:<verb>` in one PR. This includes the quickstart, the Ralph loop section, the project status, and all in-prose mentions. Internal cross-references stay correct because the new namespace is more readable, not because it's a strict renaming.

The CLAUDE.md generator's slash-command references also migrate — `src/commands/claude.ts` has multiple `/devspec-iterate` etc. references that need updating.

### D9. No CLI changes

The `devspec` CLI is untouched. No new flags, no deprecation, no aliasing. The new skills wrap existing CLI commands; if a user wants the old behaviour, the CLI still does it. This is important for users with shell scripts, CI pipelines, or external tools that invoke `devspec`.

## Risks / Trade-offs

- **Skill auto-invocation could fire the wrong skill if descriptions overlap** → Mitigation: each description names trigger phrases explicitly. The `devspec-continue` skill description mentions "what's next" / "continue" which doesn't overlap with `explore` ("think about", "before I commit") or `verify` ("ready to archive", "any drift?"). Same care taken for `new` (ambiguous with existing `grill`, but `new` is specifically the change-creation entry point and `grill` is invoked per-stage thereafter).
- **The continue skill's routing logic could be brittle** → Mitigation: the skill body uses explicit branches based on `devspec status --json` output and file-existence checks (does `<slug>/contract.md` exist? do test stubs exist in source?). Each branch points at a specific next action; no implicit state.
- **Five new SKILL.md files each take prompt-budget when auto-invoked** → Mitigation: each skill body should target ~3-5K tokens. The existing skills are roughly this size. If skills bloat, factor common patterns into shared markdown the skills reference.

## Migration Plan

DevSpec has not been published or shipped — no workspaces with the flat layout exist outside of the DevSpec repo itself. The repo's own `.claude/commands/` files are moved into the `devspec/` subfolder as part of this slice; no other migration is required.

Rollback: if a critical issue surfaces with the namespaced layout, reverting this change in source restores the prior file layout. There is no observable user state to worry about.

## Open Questions

- **Should the subfolder be `devspec/` literally or could it be configurable** (e.g. for forks)? Probably literal — configurable namespace adds complexity for negligible benefit. Defer unless real forks ask.
- **Should `/devspec:onboard` differ from auto-invoking `devspec-onboard`?** No — the command file is just a thin invocation marker that triggers the same skill. The user benefit is explicit-execution UX, not different behaviour.
- **Does `/devspec:continue` need a `--stage` flag to force a specific stage?** Could be useful for "I want to grill the design even though discovery isn't done" — but that's a `/devspec:grill design` invocation anyway. Defer.
- **Should the `devspec-archive` skill auto-detect the only-active-change case** and skip the "which change?" question? Yes — match the pattern in `devspec-sync` where a single candidate auto-picks. Lock this into the skill body.
- **Does `common/standards.md` need a "slash command map" section?** It already lists CLI commands; adding a parallel slash-command map could be redundant with CLAUDE.md. Defer; revisit if users ask.
