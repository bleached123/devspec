## Domain-Driven Design

- Aggregates are small. Default to one aggregate root per bounded context concept.
- Value objects are immutable and validated in their constructor.
- Domain events are raised on the aggregate and dispatched after persistence succeeds.
- Repositories return aggregates, never DTOs.
- Use ubiquitous language consistently — naming in code matches naming in conversation with domain experts.

## Bounded contexts

- One bounded context per business capability.
- Contexts communicate via published events or explicit anti-corruption layers — never by sharing a database table.

## Guiding principles

- **Ubiquitous language** — every domain term in code matches the term domain experts use. New vocabulary triggers a glossary update before code.
- **Tell, don't ask** — clients call methods on aggregates that perform behaviour, not query state and decide externally.
- **Separation of concerns** — domain logic stays in the domain layer. No HTTP, persistence, or framework concerns leak in.
- **SOLID applied with judgement** — Single Responsibility and Dependency Inversion are load-bearing; Liskov and Interface Segregation often emerge naturally; Open/Closed is overrated for green-field code.

## Patterns and when to reach for them

- **Aggregate root** — when an invariant spans multiple objects (e.g. order total = sum of line items). Don't create aggregates without a real invariant.
- **Value object** — for any concept identified by its data, not its identity (Money, Address, TimeSlot).
- **Domain event** — when something happened that other parts of the system care about, and you want decoupling.
- **Repository** — abstraction over persistence for one aggregate. Returns/persists aggregates, nothing else.
- **Anti-corruption layer** — when integrating with an external system whose vocabulary differs from ours. Don't let their concepts leak into our domain.
- **Specification** — for reusable query/predicate logic that has business meaning.

## Testing

- Domain tests do not touch the database.
- Integration tests hit a real database (Testcontainers or local instance), not mocks.
- One test class per aggregate, mirror the production folder structure.
