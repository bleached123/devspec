## Test-Driven Development

The cycle is **red → green → refactor**:

1. **Red** — write the smallest failing test that pins one bit of behaviour.
2. **Green** — write the simplest code that makes the test pass. Hard-coded returns are valid at this stage.
3. **Refactor** — once green, remove duplication and improve names. Tests must stay green throughout.

If the test wouldn't fail without your code, the test isn't pinning behaviour. Rework the test.

## Principles (apply in this order)

1. **YAGNI** — you aren't gonna need it. Don't write code without a failing test demanding it.
2. **KISS** — simplest thing that could possibly work. Add complexity in the refactor step, not the green step.
3. **DRY** — eliminate duplication, but only the duplication that has emerged. Don't pre-emptively abstract.
4. **SOLID** — applied during refactor, not during green. The tests drive the shape.

## Test structure

- One assertion per test where possible. Multiple assertions are OK when they describe one logical claim.
- Arrange / Act / Assert layout, with blank lines separating each block.
- Test names read as sentences: `creates_a_booking_when_slot_is_free`, not `test1`.
- Each test sets up its own world. No shared mutable state across tests.

## Test doubles

- Prefer **fakes** (lightweight in-memory implementations) over **mocks**.
- Mock at architectural boundaries, not within your own code. If you're mocking a function you wrote yesterday, redesign.
- Stubs for return values, mocks for verifying interactions. Don't conflate.

## Speed and isolation

- Unit tests run in milliseconds. If the suite is slow, split out integration tests.
- Integration tests hit real adapters (DB, HTTP) but use a transactional rollback or test container.
- One test failure should not cascade — independent tests run in any order.
