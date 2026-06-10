## Lightweight process

- Plan before building. Write the proposal first, then design only the bits that aren't obvious.
- Prefer one small change at a time over batched mega-PRs.
- Tests cover the golden path and the riskiest edge case. Coverage targets are not a goal.

## Principles

- **YAGNI** — don't build for hypothetical requirements. The third similar case is when you abstract, not the first.
- **KISS** — the simplest thing that could possibly work. Add complexity only when justified by a real need, not anticipated elegance.
- **DRY (where it hurts)** — eliminate duplication that has actually caused bugs or friction. Three similar lines is fine; three places that drift out of sync is not.

## Patterns to reach for sparingly

- Factory functions when construction is non-trivial and repeated.
- Dependency injection at the composition root, not threaded through every layer.
- Repository or gateway only when persistence is genuinely complex.

## When NOT to add structure

- A single use case → just a function.
- Two use cases → still functions; maybe a shared helper.
- Three or more with shared invariants → consider extracting a domain concept.

Don't introduce a layered architecture, mediator, or event bus just because they sound nice. Each pattern earns its keep by removing pain, not by being on the diagram.
