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

The contract enumerates the BDD scenarios for this change. Each scenario becomes a feature-file `Scenario` AND a `devspec scaffold`-emitted runner test.

## Scenarios (Gherkin shape, in pseudocode)

```ts
// Pseudocode signature of the application service the scenarios exercise.
function createBooking(req: CreateBookingRequest): Result<Booking, BookingError>;
```

## Tests (one per scenario)

```yaml tests
- name: customer cannot book an already-taken slot
  given:
    - a booking exists for slot S
    - customer C has no existing booking for slot S
  when: customer C tries to book slot S
  then: createBooking returns error SlotAlreadyBooked and no new booking is persisted
- name: customer can book a free slot
  given:
    - no booking exists for slot S
    - customer C is registered
  when: customer C books slot S
  then: a booking is created with status Pending and customer C receives a confirmation email
```

Each entry matches a Gherkin scenario in the feature file. Keep wording in ubiquitous-language vocabulary.
