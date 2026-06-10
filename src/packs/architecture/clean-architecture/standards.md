## Clean Architecture layering

Dependencies point inward only:

```
Web/Api  →  Application  →  Domain
                ↑
         Infrastructure
```

- **Domain** has no dependencies on other layers. No imports from `Infrastructure`, `Web`, `Api`, or `Presentation`.
- **Application** depends on `Domain` only. It defines interfaces that `Infrastructure` implements.
- **Infrastructure** implements `Application` interfaces. It is the only layer that talks to databases, files, HTTP clients, message brokers.
- **Web/Api** depends on `Application`. It does not reference `Infrastructure` types directly — wire them via DI in the composition root only.

## Layer placement rules

- Persistence, HTTP clients, file I/O → Infrastructure
- Business rules and invariants → Domain
- Orchestration of domain operations + transaction boundaries → Application
- Request shaping, auth, serialization → Web/Api
