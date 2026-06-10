<!--
  Optional frontmatter — list the capability spec(s) this change deltas.
  Each capability listed here MUST have a matching deltas/<capability>/spec.md
  file in this change directory. Use `devspec specs init <capability>` to
  create a capability before referencing it.

  To activate, remove the surrounding `<!--` / `-->` lines and fill in real
  capability names. Leave the block as a comment if this change does not
  modify any capability spec.

  ---
  capability:
    - user-auth
  ---
-->

# Contract — {{title}}

The contract is the thinking layer between design and code. It is **not** compilable TypeScript — it is pseudocode that captures the API shape and the test list in a form that's easy to read and translates cleanly to the target backend.

## API

Define the public surface in TS-flavored pseudocode.

```ts
// e.g.
function processRetry(charge: Charge): Result<Charge, RetryError>;

type RetryError = "MaxRetriesExceeded" | "ChargeNotFound";
```

## Reference algorithm (optional)

Walk the happy path in pseudocode if non-trivial.

```ts
// e.g.
function processRetry(charge) {
  // 1. ...
  // 2. ...
}
```

## Tests

Each entry becomes one failing test in the target language via `devspec scaffold`.

```yaml tests
- name: returns error when max retries exceeded
  given:
    - charge with retry_count = 3 (max is 3)
  when: processRetry is called
  then: returns error MaxRetriesExceeded
- name: increments retry count on retry
  given:
    - charge with retry_count = 1
  when: processRetry is called
  then: retry_count becomes 2 and charge is queued for processing
```
