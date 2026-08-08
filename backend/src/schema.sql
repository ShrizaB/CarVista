-- =========================================================
-- CarVista - Enterprise Carpooling Platform
-- PostgreSQL schema
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------
-- Organizations (Companies)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(150) NOT NULL,
  domain            VARCHAR(150) UNIQUE NOT NULL,      -- e.g. acme.com, used for email-domain based signup
  fuel_cost_per_litre  NUMERIC(10,2) DEFAULT 100.00,   -- org configurable
  avg_fuel_efficiency  NUMERIC(6,2) DEFAULT 15.00,     -- km/l, org configurable
  default_fare_per_km  NUMERIC(10,2) DEFAULT 8.00,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------
-- Users (Employees + Company Admins share one table, role flag differs)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name         VARCHAR(150) NOT NULL,
  email             VARCHAR(150) UNIQUE NOT NULL,
  phone             VARCHAR(20),
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('employee','company_admin')),
  employee_code     VARCHAR(50),
  gender            VARCHAR(20),
  avatar_url        TEXT,
  rating            NUMERIC(3,2) DEFAULT 5.00,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- ---------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model             VARCHAR(100) NOT NULL,
  registration_number VARCHAR(30) UNIQUE NOT NULL,
  color             VARCHAR(40),
  seating_capacity  INT NOT NULL CHECK (seating_capacity BETWEEN 1 AND 8),
  vehicle_type      VARCHAR(20) DEFAULT 'car' CHECK (vehicle_type IN ('car','suv','bike','van')),
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);

-- ---------------------------------------------------------
-- Saved Places
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_places (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label             VARCHAR(50) NOT NULL,               -- Home / Office / Other
  address           TEXT NOT NULL,
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------
-- Rides (published by a driver -- "Offer a Ride")
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS rides (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id        UUID NOT NULL REFERENCES vehicles(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),

  pickup_address    TEXT NOT NULL,
  pickup_lat        DOUBLE PRECISION NOT NULL,
  pickup_lng        DOUBLE PRECISION NOT NULL,
  destination_address TEXT NOT NULL,
  destination_lat   DOUBLE PRECISION NOT NULL,
  destination_lng   DOUBLE PRECISION NOT NULL,

  route_geometry    JSONB,               -- GeoJSON linestring from OSRM
  distance_km       NUMERIC(8,2),
  duration_min      NUMERIC(8,2),

  travel_date       DATE NOT NULL,
  travel_time       TIME NOT NULL,
  is_recurring      BOOLEAN DEFAULT FALSE,
  recurring_days    VARCHAR(20)[],       -- e.g. {MON,TUE,WED}
  recurring_group_id UUID,               -- shared by every occurrence of the same recurring series
  is_series_parent  BOOLEAN DEFAULT FALSE, -- the occurrence that represents "all future rides" for cancel-series

  available_seats   INT NOT NULL,
  total_seats       INT NOT NULL,
  fare_per_seat     NUMERIC(10,2) NOT NULL,

  status            VARCHAR(20) NOT NULL DEFAULT 'published'
                     CHECK (status IN ('published','full','cancelled','completed','expired')),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_org_date ON rides(organization_id, travel_date);
CREATE INDEX IF NOT EXISTS idx_rides_geo ON rides(pickup_lat, pickup_lng, destination_lat, destination_lng);
CREATE INDEX IF NOT EXISTS idx_rides_recurring_group ON rides(recurring_group_id);
-- Idempotency guard: prevents a double-tap/duplicate publish of the identical ride
-- by the same driver for the same route/date/time while it's still active.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rides_no_dupe_publish ON rides
  (driver_id, vehicle_id, pickup_lat, pickup_lng, destination_lat, destination_lng, travel_date, travel_time)
  WHERE status IN ('published','full');

-- ---------------------------------------------------------
-- Bookings (passenger books seats on a ride) -> becomes a Trip
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id           UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats_booked      INT NOT NULL DEFAULT 1,
  fare_total        NUMERIC(10,2) NOT NULL,

  trip_status       VARCHAR(20) NOT NULL DEFAULT 'booked'
                     CHECK (trip_status IN
                       ('booked','started','in_progress','completed','cancelled','no_show')),
  payment_status    VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (payment_status IN ('pending','completed','failed','refunded')),

  trip_started_at   TIMESTAMPTZ,
  trip_completed_at TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  no_show_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_ride ON bookings(ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON bookings(passenger_id);

-- ---------------------------------------------------------
-- Live location pings (for live trip tracking)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_locations (
  id                BIGSERIAL PRIMARY KEY,
  ride_id           UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  latitude          DOUBLE PRECISION NOT NULL,
  longitude         DOUBLE PRECISION NOT NULL,
  heading           DOUBLE PRECISION,
  speed_kmph        DOUBLE PRECISION,
  recorded_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_locations_ride ON trip_locations(ride_id, recorded_at DESC);

-- ---------------------------------------------------------
-- Chat messages between driver & passenger(s) of a ride
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id           UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id),
  message           TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_ride ON chat_messages(ride_id, created_at);

-- ---------------------------------------------------------
-- Wallet
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id         UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type              VARCHAR(20) NOT NULL CHECK (type IN ('recharge','debit','refund')),
  amount            NUMERIC(12,2) NOT NULL,
  reference         VARCHAR(120),           -- e.g. booking id, gateway payment id
  balance_after     NUMERIC(12,2) NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------
-- Payments (trip fare payments via cash / card / upi / wallet)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payer_id          UUID NOT NULL REFERENCES users(id),
  amount            NUMERIC(10,2) NOT NULL,
  method            VARCHAR(20) NOT NULL CHECK (method IN ('cash','card','upi','wallet')),
  gateway           VARCHAR(20) DEFAULT 'mock' CHECK (gateway IN ('razorpay','mock','wallet_internal','cash')),
  gateway_order_id  VARCHAR(120),
  gateway_payment_id VARCHAR(120),
  status            VARCHAR(20) NOT NULL DEFAULT 'created'
                     CHECK (status IN ('created','paid','failed','refunded')),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------
-- Notifications (bonus feature)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             VARCHAR(150) NOT NULL,
  body              TEXT,
  type              VARCHAR(30) DEFAULT 'info',
  is_read           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ---------------------------------------------------------
-- Ratings (bonus - post trip feedback)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  rater_id          UUID NOT NULL REFERENCES users(id),
  ratee_id          UUID NOT NULL REFERENCES users(id),
  stars             INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment           TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------
-- Safe-to-rerun upgrades for databases migrated from an earlier schema
-- version (adds new columns/indexes/constraints without dropping data).
-- ---------------------------------------------------------
ALTER TABLE rides ADD COLUMN IF NOT EXISTS recurring_group_id UUID;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS is_series_parent BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_trip_status_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_trip_status_check
    CHECK (trip_status IN ('booked','started','in_progress','completed','cancelled','no_show'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_rides_recurring_group ON rides(recurring_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rides_no_dupe_publish ON rides
  (driver_id, vehicle_id, pickup_lat, pickup_lng, destination_lat, destination_lng, travel_date, travel_time)
  WHERE status IN ('published','full');

-- ---------------------------------------------------------
-- Helper view: trips with all details joined (used by Trip Mgmt / History / Reports)
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW trip_details AS
SELECT
  b.id                AS booking_id,
  r.id                AS ride_id,
  r.organization_id,
  b.trip_status,
  b.payment_status,
  b.seats_booked,
  b.fare_total,
  r.pickup_address, r.pickup_lat, r.pickup_lng,
  r.destination_address, r.destination_lat, r.destination_lng,
  r.distance_km, r.duration_min,
  r.travel_date, r.travel_time,
  driver.id   AS driver_id,   driver.full_name  AS driver_name,   driver.phone AS driver_phone, driver.rating AS driver_rating,
  pax.id      AS passenger_id, pax.full_name AS passenger_name, pax.phone AS passenger_phone,
  v.model AS vehicle_model, v.registration_number, v.seating_capacity,
  b.trip_started_at, b.trip_completed_at, b.created_at AS booked_at
FROM bookings b
JOIN rides r      ON r.id = b.ride_id
JOIN users driver ON driver.id = r.driver_id
JOIN users pax    ON pax.id = b.passenger_id
JOIN vehicles v   ON v.id = r.vehicle_id;
