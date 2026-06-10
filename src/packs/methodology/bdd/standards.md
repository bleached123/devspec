## Behavior-Driven Development

The cycle is **discover → formulate → automate**:

1. **Discover** — three amigos (product, dev, QA) explore the behaviour with concrete examples.
2. **Formulate** — write the example as a Gherkin scenario using ubiquitous language. No implementation details in the scenario.
3. **Automate** — bind each step to executable code (step definitions). The scenario becomes a living spec.

A scenario that doesn't describe **observable user behaviour** belongs in unit tests, not BDD scenarios.

## Gherkin conventions

- One feature per file (`features/booking_creation.feature`).
- Scenarios read top-to-bottom as a story: `Given` (precondition) → `When` (action) → `Then` (observable outcome).
- Use `Background` for setup shared across scenarios in a feature.
- Use `Scenario Outline` + `Examples` for data-driven variants, not loops in step definitions.
- Scenario titles are sentences: `Customer cannot book an already-taken slot`, not `test_double_book`.

## Step definitions

- Step definitions are thin — they call into application services, not databases or HTTP directly.
- One step definition per phrase. No regex acrobatics — keep phrases concrete.
- Step parameters are typed (custom parameter types over raw strings where possible).
- Don't share state via globals. Each scenario gets a fresh test world.

## Ubiquitous language

- Step phrasing matches what the domain expert says, not what the code says.
- If a step says "customer", the code uses `Customer` — not `User` or `Account`.
- New vocabulary in scenarios triggers a domain glossary update before automation.

## Outside-in

- Drive new features from the outermost behaviour: the user-facing scenario fails first.
- Work inward: scenario fails → application service fails → domain logic fails → fix domain → outer tests pass.
- Don't write unit tests for code that has no failing outer scenario yet.

## Scope

- BDD scenarios cover **user-observable behaviour**. Edge-case algorithm tests still go in unit tests.
- A feature file should be readable by a non-technical stakeholder. If it's full of HTTP codes and DB rows, it's a unit test in costume.
