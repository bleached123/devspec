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

Define the public surface in TS-flavored pseudocode. Show the shape of inputs, outputs, and error variants — not real generics, not real lifetimes.

```ts
// Example shape — replace with your aggregate's API
interface BookingService {
  create(req: CreateBookingRequest): Result<Booking, BookingError>;
  cancel(id: BookingId): Result<void, BookingError>;
}

type CreateBookingRequest = {
  customerId: CustomerId;
  slot: TimeSlot;
};

type BookingError =
  | "SlotAlreadyBooked"
  | "CustomerNotFound"
  | "InvalidSlot";
```

## Domain types

List the aggregates, value objects, and events introduced by this change.

```ts
// Aggregate
type Booking = {
  id: BookingId;
  customerId: CustomerId;
  slot: TimeSlot;
  status: "Pending" | "Confirmed" | "Cancelled";
  confirmedAt?: Timestamp;
};

// Domain events
type BookingConfirmed = { bookingId: BookingId; at: Timestamp };
```

## Reference algorithm (optional)

Walk the happy path of each non-trivial use case in pseudocode. Skip when the logic is obvious from the API.

```ts
function create(req) {
  // 1. validate slot is in the future
  // 2. check no existing booking for slot (repository.findBySlot)
  // 3. construct Booking aggregate with status="Pending"
  // 4. persist
  // 5. raise BookingPending event
}
```

## Tests

Each entry becomes one failing test in the target language via `devspec scaffold`. Use plain English in `given`/`when`/`then` — no language-specific assertions.

```yaml tests
- name: rejects double-booking of the same slot
  given:
    - existing booking for slot S with status Pending
  when: create booking for slot S
  then: returns error SlotAlreadyBooked
- name: confirms a pending booking
  given:
    - pending booking B exists
  when: confirm booking B
  then: status becomes Confirmed and BookingConfirmed event is raised
```
