## Vertical slice architecture

Code is organised by feature, not by technical layer. Each slice contains the full path from request to data for one use case.

```
Features/
  Bookings/
    CreateBooking/
      CreateBookingRequest.cs
      CreateBookingHandler.cs
      CreateBookingValidator.cs
      CreateBookingEndpoint.cs
    CancelBooking/
      ...
```

## Slice placement rules

- A slice owns its request, handler, validator, and endpoint.
- Shared abstractions (persistence, messaging) live in `Common/` or `Infrastructure/` and are imported by slices.
- Slices do not import from other slices. Cross-slice communication goes through domain events or shared abstractions.
- No `Services/` or `Managers/` folders — behaviour lives inside its slice.
