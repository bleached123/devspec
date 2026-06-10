## Layered architecture

Three layers, dependencies flow top-down:

```
Presentation  →  Business  →  Data
```

- **Presentation** handles requests, responses, and view shaping. No business rules.
- **Business** holds rules, validation, and orchestration. No direct database or HTTP calls.
- **Data** owns persistence. Returns domain objects or DTOs as agreed with Business.

## Layer placement rules

- A layer may only call the layer directly below it.
- Skipping layers (Presentation → Data) is not allowed.
- Cross-cutting helpers (logging, config) live outside the layer stack and may be called from anywhere.
