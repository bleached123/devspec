## Linked DevSpec change

<!-- Reference the change slug (e.g. `add-bookings`). PR must align with the
     spec in .devspec/projects/<slug>/. -->

- Change slug: `<slug>`
- Spec docs: `.devspec/projects/<slug>/`

## Spec checklist

- [ ] `discovery.md` has substantive content (not template-only)
- [ ] `proposal.md` states the goal in one sentence
- [ ] `design.md` describes the shape of the change
- [ ] `contract.md` has TS-flavored pseudocode AND a ```yaml tests block
- [ ] `alignment.md` records sign-off (where required by methodology)
- [ ] `tasks.md` covers non-test work (docs, migrations, deploy)

## Verification (run locally before pushing)

- [ ] `devspec check` passes
- [ ] `devspec coherence <slug>` reports zero blocking drift
- [ ] Unit tests pass
- [ ] Integration tests pass (or N/A for this change)
- [ ] E2E tests pass (if frontend is configured)
- [ ] If workspace is in `production` phase: strict-mode coherence is clean

## Security & quality

- [ ] No new secrets, credentials, or tokens committed
- [ ] No new direct dependency with high-severity advisories
- [ ] Format check, lint, and typecheck all pass with zero warnings
- [ ] New code follows the project's principles (KISS, DRY, YAGNI)

## What changed

<!-- Brief summary. The contract.md is the source of truth — don't repeat it. -->

## Test plan

<!-- List the manual or automated tests that exercised this change. Reference
     test names from contract.md where possible. Note any test layers (unit /
     integration / e2e) that were added or modified. -->

---

<sub>Generated PR template — run `devspec ci init --force` to refresh.</sub>
