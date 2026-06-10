---
description: Refresh DevSpec pack standards to reflect current stable releases and modern idioms
---

You are refreshing the DevSpec pack standards for `$ARGUMENTS`.

`$ARGUMENTS` is either:
- A specific fragment in the form `<axis>/<name>` (e.g. `backend/dotnet`, `frontend/svelte`, `common`)
- The word `all` to refresh every fragment in turn
- Empty — list available fragments and ask the user which to refresh

This command rewrites pack content in `c:/Dev/DevSpec/src/packs/`. Re-runs of `devspec init` after refresh will use the updated content. Existing workspaces can pick up changes by re-running `devspec init --force` or manually re-merging.

## Step 0 — Resolve target

If `$ARGUMENTS` is empty, run `ls c:/Dev/DevSpec/src/packs/` then per-axis `ls c:/Dev/DevSpec/src/packs/<axis>/` and present the user with the full list. Ask them to choose one or `all`. Stop until they answer.

If `$ARGUMENTS` is `all`, treat this as a batch: enumerate every `<axis>/<name>` directory under `src/packs/` (excluding `common`) and run Step 1 for each. Then run Step 1 for `common` last.

## Step 1 — Spawn a refresh subagent per fragment

For each target fragment, use the **Agent tool** with `subagent_type: "general-purpose"`, `description: "DevSpec pack refresh"`, and the prompt below (substitute `<FRAGMENT>` with the `<axis>/<name>` path, e.g. `backend/dotnet`):

```
You are refreshing the DevSpec pack standards for fragment "<FRAGMENT>" at c:/Dev/DevSpec/src/packs/<FRAGMENT>/.

Today's date is the current date in the calendar. You must establish ground truth empirically, not from memory.

## What you read

1. `c:/Dev/DevSpec/src/packs/<FRAGMENT>/standards.md` — current content
2. `c:/Dev/DevSpec/src/packs/<FRAGMENT>/tech-stack.yaml` — current versions / pinned config

## How you ground updates

Before changing version numbers or claiming a feature is "current", verify via WebSearch or WebFetch against authoritative sources:

- **Languages**: official release pages (python.org, dotnet.microsoft.com, rust-lang.org, nodejs.org)
- **Frameworks**: project release notes (svelte.dev, fastapi releases on GitHub, ASP.NET Core release notes, react.dev/blog, vuejs.org/about/releases)
- **Infrastructure**: Kubernetes release notes, Terraform changelog, Helm releases
- **Recommended packages** (the `## Recommended packages` table in each fragment's standards.md): for each row, verify the primary pick is still actively maintained (release in last 12 months) and not deprecated. Cross-check with:
  - npm trends + GitHub stars trajectory for JS/TS picks
  - PyPI stats + GitHub for Python picks
  - crates.io downloads + last release for Rust picks
  - nuget.org + GitHub Repository activity for .NET picks
  - pkg.go.dev + used-by count for Go picks
  Swap a pick only when there's clear evidence the recommendation has been overtaken (e.g. project archived, security advisory unresolved, new community standard emerged). When swapping, update the table AND the row's `## What to avoid` reference if relevant.
- **Security baselines** (for `common`): OWASP ASVS, NIST SP 800-63, current NIST/IETF crypto guidance

Cite the version (or "last release date" for packages) you found in the change summary so the user can audit.

## Editing rules

- Keep tone, structure, and section headings the same. This is a refresh, not a rewrite.
- Only change something you can verify is newer than what's in the file.
- Update version targets ONLY to current stable, never to preview, RC, or beta.
- "Modern idiom" additions: only if the feature is stable and widely adopted. Don't add experimental features.
- Add to "What to avoid" sections when something previously recommended is now deprecated.
- Keep file size sane — under ~80 lines. If you'd add a lot, choose the most impactful additions.

## What you must NOT change

- The frontmatter/structure of `tech-stack.yaml` (top-level keys, nesting under axis).
- Anything that isn't a version, idiom, or deprecated pattern.
- The "What to avoid" section's existing entries unless they're actively wrong.

## Process

1. Read both files.
2. WebSearch / WebFetch to verify current versions.
3. Compute a minimal diff: what versions need bumping, what idioms to add, what to deprecate.
4. Use the Edit tool to apply the diff to standards.md and tech-stack.yaml.
5. If `## Recommended packages` exists, update the `_Last refreshed_` date to today's date before returning. If you swapped any pick, capture it under `package_swaps` in the JSON.

6. Return EXACTLY this JSON object (no prose, no markdown fence):

{
  "fragment": "<FRAGMENT>",
  "version_bumps": [
    {"key": "<what>", "from": "<old>", "to": "<new>", "source": "<URL or release note>"}
  ],
  "idioms_added": ["<short description>"],
  "deprecations_added": ["<short description>"],
  "package_swaps": [
    {"category": "<what the table calls it>", "from": "<old pick>", "to": "<new pick>", "reason": "<why>"}
  ],
  "no_changes_needed": false
}

If after verification nothing actually needs updating, return with `no_changes_needed: true` and empty arrays.

DO NOT modify files in any other directory. DO NOT modify `.devspec/` in any user workspace. Touch ONLY src/packs/<FRAGMENT>/.
```

## Step 2 — Render the result

For each subagent that returns:

- If `no_changes_needed: true`: print `   ✓ <FRAGMENT>: already current`.
- Otherwise: print a structured summary:
  ```
  ✓ <FRAGMENT> refreshed
    Versions: <bumps as "key from→to">
    Added idioms: <list>
    Added deprecations: <list>
  ```

When all subagents finish, print a final summary:
```
Refreshed N fragment(s), M unchanged.
Review the diff with: git diff -- src/packs/
Test: npx vitest run
Commit the changes when satisfied.
```

## Guardrails

- The subagent uses WebSearch / WebFetch to ground claims. Do not let it update based on memory alone.
- The subagent only writes to its own fragment directory. Reject any tool call attempting to write outside `src/packs/<FRAGMENT>/`.
- If a subagent's JSON is malformed, print the raw output for that fragment and continue with the next.
- This command does NOT auto-commit. User reviews `git diff` before committing.

## Usage

```
/devspec:refresh-standards backend/dotnet     # one fragment
/devspec:refresh-standards common             # the universal principles + security layer
/devspec:refresh-standards all                # everything, in series
```

Run periodically (e.g. once a quarter, or whenever a major version of a language ships). Combine with `/loop` for an automated cadence, but expect each refresh run to take 1–3 minutes per fragment because of WebSearch.
