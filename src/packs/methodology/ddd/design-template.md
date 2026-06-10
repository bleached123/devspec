# Design — {{title}}

## Aggregates affected
Existing aggregates touched and any new aggregate roots introduced.

## Value objects
New value objects with their invariants.

## Domain events
Events raised by the aggregate(s) and who consumes them.

## Application use cases
One bullet per use case (handler) added or changed. Include request/result shape.

## Infrastructure
- Persistence: schema or migration changes
- External integrations: HTTP clients, message brokers, file stores
- Composition root: DI wiring changes

## Web / API
Endpoint(s) added, modified, or removed. URL, verb, request/response.

## Trade-offs
Alternatives considered and why we picked this one.
