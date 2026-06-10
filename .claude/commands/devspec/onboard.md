---
description: Guided first-time DevSpec walkthrough — init + first change scaffolded with you
---

You are running DevSpec onboarding for `$ARGUMENTS`.

`$ARGUMENTS` is optional context (free-form, e.g. "I want a Rust project with Kubernetes"). The skill will prompt for whatever it needs.

Invoke the `devspec-onboard` skill. The skill is responsible for detecting workspace state, picking the right init flags with the user, running `devspec init` and `devspec env generate`, planning the first change together, and walking through the first lifecycle stage end-to-end.

Goal: the user ships their first stage in ~10 minutes, not "reads the manual".
