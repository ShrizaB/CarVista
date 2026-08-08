# Backend PRD Compliance Notes

The backend already used only **free, keyless APIs** — no Google anywhere:
- **Nominatim** (OpenStreetMap) for geocoding / reverse-geocoding — `src/utils/maps.js`
- **OSRM public demo server** for route geometry, distance & duration — `src/utils/maps.js`
- **Razorpay TEST mode** (or a built-in mock gateway if no keys are set) for payments — `src/utils/payments.js`
- **Socket.IO** (self-hosted) for live tracking, chat, and WebRTC call signaling — `src/sockets/index.js`

This pass closed the remaining gaps against the PRD's **Section 4 (Edge Cases)** so the backend now enforces every one of them, not just the happy path:

| PRD edge case | What was added |
|---|---|
| Simultaneous seat requests | Already handled (`FOR UPDATE` row lock + atomic decrement in `trips.js`) — verified, unchanged. |
| Driver cancels after bookings exist | Already handled — verified, unchanged. |
| **Passenger no-show** | New `PUT /api/trips/:bookingId/no-show` — driver-only, enforces a 10‑min grace period after scheduled pickup, auto-dents the passenger's rating, no dispute step. |
| Route recalculation mid-trip | Already silent (driver just keeps posting `trip:location`) — verified, unchanged. |
| Payment failure post-trip | Already kept `payment_status='pending'` distinct from trip completion. Added `GET /api/payments/earnings/summary` so a driver's dashboard can show **settled vs pending** funds. |
| **Recurring ride, cancel just one occurrence** | Publishing a recurring ride now generates one `rides` row per matching weekday (up to 8 weeks ahead), linked by `recurring_group_id`. `PUT /api/rides/:id/cancel` cancels **only that occurrence**. New `PUT /api/rides/:id/cancel-series` cancels that occurrence **and all future ones** in the series. |
| **Vehicle deleted while attached to a live/published ride** | `DELETE /api/vehicles/:id` now returns `409 "Vehicle in use by an upcoming trip."` instead of silently deleting. |
| **Employee deactivated mid-cycle** | New `activeOnly` middleware blocks **new** ride searches/publishes for deactivated employees (`GET /rides/search`, `POST /rides`, `POST /trips/book`) without touching their already-booked upcoming trips. |
| **Pre-booking chat once ride is full** | The `chat:send` socket handler now rejects messages from anyone who isn't the driver or an already-booked passenger once a ride's status is `full`. |
| **Wallet balance insufficient at payment** | New `POST /api/payments/:bookingId/topup-and-pay` — one atomic call that tops up the wallet and pays the fare in the same transaction. |
| **Duplicate ride publish (double-tap)** | `POST /api/rides` now checks for (and returns) an existing identical published ride instead of inserting a clashing duplicate; a matching unique DB index backs this up at the schema level. |
| Live tracking with lost GPS | Already timestamped pings only — frontend renders "last known location Xs ago"; unchanged. |

## Schema changes (`src/schema.sql`)
- `rides.recurring_group_id`, `rides.is_series_parent` — link recurring occurrences.
- `bookings.trip_status` now allows `'no_show'`; added `bookings.no_show_at`.
- Unique partial index preventing duplicate active publishes of the same route/date/time by the same driver+vehicle.
- All additions are wrapped in `ADD COLUMN IF NOT EXISTS` / `IF NOT EXISTS` so re-running `npm run migrate` on an existing database is safe.

## Not yet wired into the frontend
These are backend-complete but the sample React frontend doesn't have UI for them yet: no-show button, "cancel just this ride" vs "cancel all future rides" choice point, earnings settled/pending split, and the combined top-up-and-pay button. Happy to wire those up next if useful.
