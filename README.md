# CarVista — Enterprise Carpooling Platform

A full-stack enterprise carpooling platform: employees at a registered
organization can find rides, offer rides, track trips live, chat, call,
pay, and see analytics. Company Administrators manage employees, vehicles,
and org-wide settings.

**Stack:** React (Vite) · Node.js/Express · PostgreSQL · Socket.IO ·
Leaflet + OpenStreetMap (free) · OSRM routing (free) · Razorpay Test Mode
(with a built-in mock fallback, so payments work out of the box with no
signup).

---

## 1. Project structure

```
carvista/
  backend/     Express API, PostgreSQL schema, Socket.IO server
  frontend/    React (Vite) single-page app
```

## 2. Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local install, Docker, or a free hosted instance e.g.
  [Neon](https://neon.tech), [Supabase](https://supabase.com), or
  [Railway](https://railway.app) — all have free tiers)

## 3. Backend setup

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL to your PostgreSQL connection string
npm install
npm run migrate   # creates all tables
npm run seed       # creates a demo org + 3 demo users (see below)
npm run dev         # starts the API on http://localhost:5000
```

Demo accounts created by `npm run seed`:

| Role              | Email             | Password       |
|-------------------|-------------------|----------------|
| Company Admin     | admin@acme.com    | Password123!   |
| Employee (driver) | rohan@acme.com    | Password123!   |
| Employee (rider)  | ananya@acme.com   | Password123!   |

Organization domain for new employee self-signup: `acme.com`

## 4. Frontend setup

```bash
cd frontend
npm install
npm run dev   # starts the app on http://localhost:5173 (proxies /api and /socket.io to :5000)
```

Open http://localhost:5173.

## 5. Free APIs used (no paid keys required)

- **Geocoding & address search:** [OpenStreetMap Nominatim](https://nominatim.org)
  — `backend/src/utils/maps.js`. Please keep to its 1 req/sec usage policy
  in production, or self-host Nominatim / swap in another provider by
  editing that one file.
- **Routing, distance & ETA:** [OSRM public demo server](https://project-osrm.org)
  — same file. For production traffic, run your own OSRM instance (it's
  open source) or swap in another routing API.
- **Map rendering:** [Leaflet](https://leafletjs.com) + free OpenStreetMap
  tiles — `frontend/src/components/RouteMap.jsx`.
- **Live tracking & chat:** Socket.IO (self-hosted, free) — `backend/src/sockets`.
- **Voice calls:** WebRTC peer-to-peer audio, signaled over the same
  Socket.IO connection, using Google's free public STUN server. No
  telephony service or per-minute costs.

## 6. Payments (Razorpay Test Mode)

The problem statement calls for Razorpay Test Mode. To enable it for
real:

1. Create a free account at https://dashboard.razorpay.com/ and switch to
   **Test Mode**.
2. Copy the test **Key ID** and **Key Secret** into `backend/.env`
   (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
3. In `frontend/src/components/CheckoutModal.jsx`, swap the simulated
   `pay()` call for Razorpay's Checkout.js widget (load
   `https://checkout.razorpay.com/v1/checkout.js`, pass the `order.keyId`
   and `order.orderId` returned by `/api/wallet/recharge/order` or
   `/api/payments/:bookingId/order`).

If you leave the keys blank, `backend/src/utils/payments.js` automatically
falls back to a built-in mock gateway, so wallet recharge and trip
payments work end-to-end without any signup — useful for local dev, demos,
and hackathon judging.

## 7. Feature checklist (maps to the problem statement)

**User Management** — registration (employee + new-organization
onboarding), login (JWT), profile editing, company administration.

**Ride Management** — Find a Ride (search + free-API route confirmation +
proximity-based matching), Offer a Ride (publish with route confirmation),
booking, trip lifecycle (booked → started → in_progress → completed),
cancellation.

**Live Trip Tracking** — driver's device streams GPS location over
Socket.IO; the passenger sees it live on a Leaflet map with the planned
route overlaid.

**Vehicle Management** — register/update/remove vehicles; seat-capacity
enforcement when publishing rides.

**Payments & Wallet** — cash, card, UPI, wallet methods; wallet balance,
recharge, and transaction history; Razorpay Test Mode with mock fallback.

**Ride History** — completed & cancelled trips.

**Reports & Analytics** — personal trip/distance/spend totals, fuel
consumption & cost estimates (using org-configured fuel price & vehicle
efficiency), monthly trend charts, vehicle-wise cost analysis, and an
organization-wide dashboard for admins.

**Settings** — saved places (Home/Office/Other), quick links to all
modules.

**Bonus features implemented** — in-app notifications (ride booked,
cancelled, trip started/completed, payment received), ride cancellation,
proximity-based ride matching, post-trip ratings, real-time chat, and
WebRTC voice calls.

## 8. Notes on scaling this beyond a hackathon

- Nominatim/OSRM public demo servers are rate-limited; for production,
  self-host them or move to a commercial provider behind the same
  `backend/src/utils/maps.js` interface.
- Add refresh tokens / shorter JWT expiry for production auth hardening.
- Add a proper migrations tool (e.g. `node-pg-migrate`) once the schema
  needs to evolve after launch.
