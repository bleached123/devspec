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

The contract is the test list. Each entry becomes one failing test that drives implementation.

## API (TS-flavored pseudocode)

```ts
// Public surface — just the shape, not the implementation.
function processRetry(charge: Charge): Result<Charge, RetryError>;

type RetryError = "MaxRetriesExceeded" | "ChargeNotFound";
```

## Tests

Order matters. Write them in the sequence you'll drive them.

```yaml tests
- name: returns error when charge does not exist
  given: []
  when: processRetry is called with unknown id
  then: returns error ChargeNotFound
- name: returns error when max retries exceeded
  given:
    - charge with retry_count = 3 (max is 3)
  when: processRetry is called
  then: returns error MaxRetriesExceeded
- name: increments retry count and queues the charge
  given:
    - charge with retry_count = 1
  when: processRetry is called
  then: retry_count becomes 2 and charge is queued
```

Each test should fail BEFORE any production code is written for it.
