---
description: Start a new DevSpec change — interview, scaffold, and optionally grill into discovery
---

You are starting a new DevSpec change for `$ARGUMENTS`.

`$ARGUMENTS` is the proposed title (free-form text). If empty, the skill will prompt for it.

Invoke the `devspec-new` skill. The skill is responsible for:

1. Confirming workspace state (warn if no workspace; flag the walking-skeleton gate if this is the first change)
2. Confirming the title and derived slug with the user
3. Asking for the change type (feature / fix / refactor / chore)
4. Running `devspec plan "<title>"` (with `--name <slug>` if overridden)
5. Offering to chain into `/devspec:grill discovery <slug>` for the first stage

The skill rejects vague titles ("fixes", "improvements") and pushes for specificity before scaffolding.
