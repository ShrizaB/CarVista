/**
 * CarVista - Dummy data seeder
 * ---------------------------------------------------------
 * Generates a realistic, internally-consistent dummy dataset so every
 * feature (dashboard, ride search, bookings, trip history, wallet,
 * payments, reports, admin panel, chat, live tracking, ratings,
 * notifications) has something real to show.
 *
 * This script performs a FULL RESET of all demo tables before
 * reseeding (TRUNCATE ... CASCADE), so it is always safe to re-run
 * with `npm run seed` and get a fresh, consistent dataset.
 *
 * Known login (unchanged from before, Password123! for all users):
 *   Admin:     admin@acme.com
 *   Driver:    rohan@acme.com
 *   Passenger: ananya@acme.com
 *   Employees: emp1@acme.com ... emp37@acme.com  (mixed drivers/passengers)
 */

const bcrypt = require('bcryptjs');
const { pool } = require('./db');

// -----------------------------------------------------------------------
// Small deterministic PRNG so re-running the seed always produces the
// same-shaped dataset (easier to demo / debug against).
// -----------------------------------------------------------------------
let seedValue = 42;
function rand() {
  seedValue = (seedValue * 9301 + 49297) % 233280;
  return seedValue / 233280;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max, decimals = 2) {
  const v = rand() * (max - min) + min;
  return Number(v.toFixed(decimals));
}
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function pickWeighted(pairs) {
  // pairs: [[value, weight], ...]
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of pairs) {
    r -= weight;
    if (r <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function toDateStr(d) { return d.toISOString().slice(0, 10); }
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// -----------------------------------------------------------------------
// Bulk insert helper - builds a single parameterized multi-row INSERT.
// -----------------------------------------------------------------------
async function bulkInsert(client, table, columns, rows, { returning = false } = {}) {
  if (rows.length === 0) return [];
  const values = [];
  const placeholders = rows
    .map((row, i) => {
      const base = i * columns.length;
      const ph = columns.map((_, j) => `$${base + j + 1}`).join(',');
      values.push(...row);
      return `(${ph})`;
    })
    .join(',');
  let sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`;
  if (returning) sql += ' RETURNING id';
  const res = await client.query(sql, values);
  return res.rows;
}

// -----------------------------------------------------------------------
// Reference data pools (Kolkata / West Bengal metro area, matching the
// org's home region)
// -----------------------------------------------------------------------
const LOCALITIES = [
  { name: 'Salt Lake Sector V', lat: 22.5726, lng: 88.4325 },
  { name: 'Park Street', lat: 22.5535, lng: 88.3529 },
  { name: 'Howrah Maidan', lat: 22.5851, lng: 88.3468 },
  { name: 'Rajarhat New Town', lat: 22.6019, lng: 88.4629 },
  { name: 'Behala Chowrasta', lat: 22.4989, lng: 88.3145 },
  { name: 'Dum Dum', lat: 22.6420, lng: 88.4197 },
  { name: 'Barrackpore', lat: 22.7606, lng: 88.3639 },
  { name: 'Bhatpara', lat: 22.8710, lng: 88.4034 },
  { name: 'Shyambazar', lat: 22.5975, lng: 88.3745 },
  { name: 'Garia', lat: 22.4620, lng: 88.3927 },
  { name: 'Tollygunge', lat: 22.5010, lng: 88.3435 },
  { name: 'Esplanade', lat: 22.5626, lng: 88.3529 },
  { name: 'Ballygunge', lat: 22.5299, lng: 88.3654 },
  { name: 'Jadavpur', lat: 22.4986, lng: 88.3714 },
  { name: 'Sealdah', lat: 22.5686, lng: 88.3703 },
];

const MALE_FIRST = ['Rohan','Arjun','Vikram','Aditya','Karan','Siddharth','Rahul','Amit','Sandeep','Nikhil','Varun','Gaurav','Ankit','Manish','Rajesh','Suresh','Vivek','Abhishek','Deepak','Saurabh'];
const FEMALE_FIRST = ['Ananya','Priya','Neha','Pooja','Kavya','Divya','Sneha','Ritika','Shreya','Meera','Anjali','Swati','Ishita','Nandini','Riya','Tanvi','Aditi','Simran','Payal','Kritika'];
const LAST_NAMES = ['Sharma','Mehta','Iyer','Gupta','Verma','Reddy','Nair','Chatterjee','Banerjee','Roy','Sen','Das','Bose','Mukherjee','Ghosh','Chowdhury','Kapoor','Malhotra','Joshi','Rao'];

const VEHICLES_POOL = [
  { model: 'Hyundai Creta', type: 'suv', capacity: 4 },
  { model: 'Maruti Suzuki Swift', type: 'car', capacity: 4 },
  { model: 'Honda City', type: 'car', capacity: 4 },
  { model: 'Toyota Innova Crysta', type: 'suv', capacity: 6 },
  { model: 'Tata Nexon', type: 'suv', capacity: 4 },
  { model: 'Kia Seltos', type: 'suv', capacity: 4 },
  { model: 'Mahindra XUV300', type: 'suv', capacity: 4 },
  { model: 'Maruti Suzuki Baleno', type: 'car', capacity: 4 },
  { model: 'Honda Amaze', type: 'car', capacity: 4 },
  { model: 'Hyundai i20', type: 'car', capacity: 4 },
  { model: 'Royal Enfield Classic 350', type: 'bike', capacity: 1 },
  { model: 'Maruti Suzuki Ertiga', type: 'van', capacity: 6 },
];
const COLORS = ['White', 'Silver', 'Black', 'Grey', 'Red', 'Blue'];

const NOTIF_TEMPLATES = [
  { title: 'Ride booked', body: 'Your seat has been confirmed. Check trip details for pickup time.', type: 'booking' },
  { title: 'Ride starting soon', body: 'Your ride starts in 30 minutes. Be ready at the pickup point.', type: 'reminder' },
  { title: 'Trip completed', body: 'Hope you had a smooth ride! Don\u2019t forget to rate your co-rider.', type: 'trip' },
  { title: 'Payment received', body: 'Your payment was processed successfully.', type: 'payment' },
  { title: 'Wallet recharged', body: 'Your wallet balance has been topped up.', type: 'wallet' },
  { title: 'New message', body: 'You have a new message from your ride partner.', type: 'chat' },
  { title: 'Ride cancelled', body: 'A ride you booked was cancelled by the driver.', type: 'alert' },
  { title: 'Seat request', body: 'Someone booked a seat on your published ride.', type: 'booking' },
];

const CHAT_LINES = [
  "Hi! I'll be at the pickup point on time.",
  'Running 5 minutes late, sorry!',
  'What color is your car?',
  'I\u2019m near the main gate, in a white shirt.',
  'Sounds good, see you then.',
  'Can we leave a little earlier tomorrow?',
  'Thanks for the ride today!',
  'Is the AC on, it\u2019s quite hot today.',
  'I\u2019m at the usual spot.',
  'Got held up, please wait 2 mins.',
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // -------------------------------------------------------------
    // 0. Clean slate - wipe demo tables so the seed is re-runnable
    // -------------------------------------------------------------
    await client.query(`
      TRUNCATE TABLE
        trip_locations, chat_messages, ratings, notifications,
        payments, wallet_transactions, bookings, rides,
        saved_places, vehicles, wallets, users, organizations
      RESTART IDENTITY CASCADE
    `);

    // -------------------------------------------------------------
    // 1. Organization
    // -------------------------------------------------------------
    const orgRes = await client.query(
      `INSERT INTO organizations (name, domain, fuel_cost_per_litre, avg_fuel_efficiency, default_fare_per_km)
       VALUES ('Acme Technologies', 'acme.com', 105.50, 16, 8)
       RETURNING id`
    );
    const orgId = orgRes.rows[0].id;

    const password_hash = await bcrypt.hash('Password123!', 10);

    // -------------------------------------------------------------
    // 2. Users - 3 known accounts + ~37 generated employees (40 total)
    // -------------------------------------------------------------
    const userRows = [];
    const userMeta = []; // { fullName, gender, isAdmin }

    userRows.push([orgId, 'Priya Sharma', 'admin@acme.com', '9800000001', password_hash, 'company_admin', 'ACME-ADM-01', 'female', null, 5.0]);
    userMeta.push({ isAdmin: true });
    userRows.push([orgId, 'Rohan Mehta', 'rohan@acme.com', '9800000002', password_hash, 'employee', 'ACME-EMP-01', 'male', null, 4.8]);
    userMeta.push({ isAdmin: false });
    userRows.push([orgId, 'Ananya Iyer', 'ananya@acme.com', '9800000003', password_hash, 'employee', 'ACME-EMP-02', 'female', null, 4.9]);
    userMeta.push({ isAdmin: false });

    const usedNames = new Set(['Rohan Mehta', 'Ananya Iyer', 'Priya Sharma']);
    let empCounter = 1;
    while (userRows.length < 40) {
      const isFemale = rand() > 0.5;
      const first = pick(isFemale ? FEMALE_FIRST : MALE_FIRST);
      const last = pick(LAST_NAMES);
      const fullName = `${first} ${last}`;
      if (usedNames.has(fullName)) continue;
      usedNames.add(fullName);

      const isAdmin = userRows.length >= 3 && userRows.length < 6 && rand() > 0.4; // a few extra admins
      const email = `emp${empCounter}@acme.com`;
      const phone = `98000${String(10 + empCounter).padStart(5, '0')}`;
      const role = isAdmin ? 'company_admin' : 'employee';
      const code = `ACME-${isAdmin ? 'ADM' : 'EMP'}-${String(empCounter).padStart(2, '0')}`;
      const rating = randFloat(3.6, 5.0, 2);

      userRows.push([orgId, fullName, email, phone, password_hash, role, code, isFemale ? 'female' : 'male', null, rating]);
      userMeta.push({ isAdmin });
      empCounter++;
    }

    const insertedUsers = await bulkInsert(
      client,
      'users',
      ['organization_id', 'full_name', 'email', 'phone', 'password_hash', 'role', 'employee_code', 'gender', 'avatar_url', 'rating'],
      userRows,
      { returning: true }
    );
    const userIds = insertedUsers.map((r) => r.id);
    const adminIds = userIds.filter((_, i) => userRows[i][5] === 'company_admin');
    const employeeIds = userIds.filter((_, i) => userRows[i][5] === 'employee');
    // fixed accounts for readability in logs
    const fixedAdminId = userIds[0];
    const fixedDriverId = userIds[1];
    const fixedPassengerId = userIds[2];

    // -------------------------------------------------------------
    // 3. Wallets - one per user, starting balance
    // -------------------------------------------------------------
    const walletRows = userIds.map((uid) => [uid, randFloat(150, 2000, 2)]);
    const insertedWallets = await bulkInsert(client, 'wallets', ['user_id', 'balance'], walletRows, { returning: true });
    const walletByUser = {};
    userIds.forEach((uid, i) => { walletByUser[uid] = { id: insertedWallets[i].id, balance: walletRows[i][1] }; });

    // -------------------------------------------------------------
    // 4. Vehicles - owned by a subset of users (drivers)
    // -------------------------------------------------------------
    const driverPool = shuffle(userIds).slice(0, 22); // ~22 users own a vehicle
    const vehicleRows = [];
    let regCounter = 1000;
    for (const ownerId of driverPool) {
      const v = pick(VEHICLES_POOL);
      const regNumber = `WB-${randInt(1, 40).toString().padStart(2, '0')}-${pick(['AB','BC','CD','DE','EF'])}-${regCounter++}`;
      vehicleRows.push([ownerId, v.model, regNumber, pick(COLORS), v.capacity, v.type]);
    }
    // guarantee the known driver (Rohan) has the original Creta for compatibility
    vehicleRows[0] = [fixedDriverId, 'Hyundai Creta', 'WB-06-AB-1234', 'White', 4, 'suv'];
    const insertedVehicles = await bulkInsert(
      client,
      'vehicles',
      ['owner_id', 'model', 'registration_number', 'color', 'seating_capacity', 'vehicle_type'],
      vehicleRows,
      { returning: true }
    );
    const vehicles = insertedVehicles.map((row, i) => ({
      id: row.id,
      ownerId: vehicleRows[i][0],
      capacity: vehicleRows[i][4],
    }));

    // -------------------------------------------------------------
    // 5. Saved places (Home / Office) for most users
    // -------------------------------------------------------------
    const savedPlaceRows = [];
    for (const uid of userIds) {
      if (rand() < 0.9) {
        const home = pick(LOCALITIES);
        savedPlaceRows.push([uid, 'Home', `${home.name}, Kolkata, West Bengal`, home.lat + randFloat(-0.01, 0.01, 5), home.lng + randFloat(-0.01, 0.01, 5)]);
      }
      if (rand() < 0.75) {
        const office = pick(LOCALITIES);
        savedPlaceRows.push([uid, 'Office', `${office.name}, Kolkata, West Bengal`, office.lat + randFloat(-0.01, 0.01, 5), office.lng + randFloat(-0.01, 0.01, 5)]);
      }
    }
    await bulkInsert(client, 'saved_places', ['user_id', 'label', 'address', 'latitude', 'longitude'], savedPlaceRows);

    // -------------------------------------------------------------
    // 6. Rides - published by vehicle owners, spread across past/future
    // -------------------------------------------------------------
    const today = new Date();
    const rideRows = [];
    const rideMeta = []; // parallel array: { totalSeats, farePerSeat, dayOffset, driverId, vehicleId }
    const seenCombo = new Set();

    const RIDE_COUNT = 60;
    let attempts = 0;
    while (rideMeta.length < RIDE_COUNT && attempts < RIDE_COUNT * 10) {
      attempts++;
      const vehicle = pick(vehicles);
      const pickupLoc = pick(LOCALITIES);
      let destLoc = pick(LOCALITIES);
      while (destLoc.name === pickupLoc.name) destLoc = pick(LOCALITIES);

      const dayOffset = randInt(-30, 20); // past 30 days .. next 20 days
      const travelDate = toDateStr(addDays(today, dayOffset));
      const hour = randInt(6, 21);
      const travelTime = `${String(hour).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}:00`;

      const comboKey = `${vehicle.id}|${pickupLoc.name}|${destLoc.name}|${travelDate}|${travelTime}`;
      if (seenCombo.has(comboKey)) continue;
      seenCombo.add(comboKey);

      const distanceKm = Number(haversineKm(pickupLoc.lat, pickupLoc.lng, destLoc.lat, destLoc.lng).toFixed(2));
      const durationMin = Number(((distanceKm / 28) * 60).toFixed(1)); // ~28 km/h avg city speed
      const farePerSeat = Number((Math.max(distanceKm, 1.5) * 8 * randFloat(0.9, 1.15, 2)).toFixed(2));
      const totalSeats = Math.max(1, vehicle.capacity - 1);

      const isRecurring = rand() < 0.15;
      const recurringDays = isRecurring ? shuffle(['MON','TUE','WED','THU','FRI']).slice(0, randInt(2, 4)) : null;

      let status;
      if (dayOffset < 0) {
        status = pickWeighted([['completed', 8], ['cancelled', 2]]);
      } else {
        status = 'published'; // may be upgraded to 'full' after bookings are placed
      }

      rideRows.push([
        vehicle.ownerId, vehicle.id, orgId,
        `${pickupLoc.name}, Kolkata, West Bengal`, pickupLoc.lat, pickupLoc.lng,
        `${destLoc.name}, Kolkata, West Bengal`, destLoc.lat, destLoc.lng,
        null, distanceKm, durationMin,
        travelDate, travelTime, isRecurring, recurringDays, null, false,
        totalSeats, totalSeats, farePerSeat, status,
      ]);
      rideMeta.push({ totalSeats, farePerSeat, dayOffset, driverId: vehicle.ownerId, vehicleId: vehicle.id, remainingSeats: totalSeats, status });
    }

    const insertedRides = await bulkInsert(
      client,
      'rides',
      [
        'driver_id', 'vehicle_id', 'organization_id',
        'pickup_address', 'pickup_lat', 'pickup_lng',
        'destination_address', 'destination_lat', 'destination_lng',
        'route_geometry', 'distance_km', 'duration_min',
        'travel_date', 'travel_time', 'is_recurring', 'recurring_days', 'recurring_group_id', 'is_series_parent',
        'available_seats', 'total_seats', 'fare_per_seat', 'status',
      ],
      rideRows,
      { returning: true }
    );
    const rides = insertedRides.map((row, i) => ({ id: row.id, ...rideMeta[i] }));

    // -------------------------------------------------------------
    // 7. Bookings - passengers book seats on rides (not their own)
    // -------------------------------------------------------------
    const bookingRows = [];
    const bookingMeta = [];
    const TARGET_BOOKINGS = 95;
    let bookingAttempts = 0;

    while (bookingMeta.length < TARGET_BOOKINGS && bookingAttempts < TARGET_BOOKINGS * 8) {
      bookingAttempts++;
      const ride = pick(rides);
      if (ride.status === 'cancelled') continue;
      if (ride.remainingSeats <= 0) continue;

      let passengerId = pick(userIds);
      if (passengerId === ride.driverId) continue;

      const seatsBooked = Math.min(ride.remainingSeats, randInt(1, 2));
      ride.remainingSeats -= seatsBooked;
      const fareTotal = Number((ride.farePerSeat * seatsBooked).toFixed(2));

      let tripStatus;
      let paymentStatus;
      if (ride.dayOffset < 0) {
        if (ride.status === 'completed') {
          tripStatus = pickWeighted([['completed', 8], ['no_show', 1], ['cancelled', 1]]);
        } else {
          tripStatus = 'cancelled';
        }
        paymentStatus = tripStatus === 'completed' ? pickWeighted([['completed', 9], ['refunded', 1]])
          : tripStatus === 'cancelled' ? pickWeighted([['refunded', 7], ['pending', 3]])
          : 'pending';
      } else if (ride.dayOffset === 0) {
        tripStatus = pickWeighted([['booked', 5], ['started', 2], ['in_progress', 2], ['completed', 1]]);
        paymentStatus = tripStatus === 'completed' ? 'completed' : pickWeighted([['pending', 6], ['completed', 4]]);
      } else {
        tripStatus = 'booked';
        paymentStatus = pickWeighted([['pending', 6], ['completed', 4]]);
      }

      bookingRows.push([ride.id, passengerId, seatsBooked, fareTotal, tripStatus, paymentStatus]);
      bookingMeta.push({ rideId: ride.id, passengerId, driverId: ride.driverId, fareTotal, tripStatus, paymentStatus, dayOffset: ride.dayOffset });
    }

    const insertedBookings = await bulkInsert(
      client,
      'bookings',
      ['ride_id', 'passenger_id', 'seats_booked', 'fare_total', 'trip_status', 'payment_status'],
      bookingRows,
      { returning: true }
    );
    const bookings = insertedBookings.map((row, i) => ({ id: row.id, ...bookingMeta[i] }));

    // Sync ride available_seats / status now that bookings are placed
    for (const ride of rides) {
      let newStatus = ride.status;
      if (ride.status === 'published' && ride.remainingSeats <= 0) newStatus = 'full';
      await client.query('UPDATE rides SET available_seats = $1, status = $2 WHERE id = $3', [
        ride.remainingSeats, newStatus, ride.id,
      ]);
    }

    // -------------------------------------------------------------
    // 8. Payments - for bookings that have moved past "pending"
    // -------------------------------------------------------------
    const paymentRows = [];
    for (const b of bookings) {
      if (b.paymentStatus === 'pending') continue;
      const method = pick(['cash', 'card', 'upi', 'wallet']);
      const gateway = method === 'cash' ? 'cash' : method === 'wallet' ? 'wallet_internal' : pick(['razorpay', 'mock']);
      const status = b.paymentStatus === 'refunded' ? 'refunded' : b.paymentStatus === 'completed' ? 'paid' : 'failed';
      paymentRows.push([
        b.id, b.passengerId, b.fareTotal, method, gateway,
        gateway === 'razorpay' ? `order_${randInt(100000, 999999)}` : null,
        gateway === 'razorpay' ? `pay_${randInt(100000, 999999)}` : null,
        status,
      ]);
    }
    await bulkInsert(
      client,
      'payments',
      ['booking_id', 'payer_id', 'amount', 'method', 'gateway', 'gateway_order_id', 'gateway_payment_id', 'status'],
      paymentRows
    );

    // -------------------------------------------------------------
    // 9. Wallet transactions - recharge / debit / refund history
    // -------------------------------------------------------------
    const walletTxRows = [];
    for (const uid of userIds) {
      const w = walletByUser[uid];
      const numTx = randInt(1, 3);
      let balance = 50; // assume wallet started small before recharges
      for (let i = 0; i < numTx; i++) {
        const type = i === 0 ? 'recharge' : pick(['recharge', 'debit', 'refund']);
        const amount = type === 'recharge' ? randFloat(200, 1000, 2) : type === 'refund' ? randFloat(50, 300, 2) : -randFloat(50, 300, 2);
        balance = Number((balance + amount).toFixed(2));
        if (balance < 0) balance = Number((balance - amount).toFixed(2)); // guard against negative
        walletTxRows.push([w.id, type, Math.abs(amount), `${type}-${randInt(10000, 99999)}`, balance]);
      }
      w.balance = balance; // keep in sync with final wallet balance
    }
    await bulkInsert(client, 'wallet_transactions', ['wallet_id', 'type', 'amount', 'reference', 'balance_after'], walletTxRows);
    // Sync each wallet's balance to its transaction history for consistency
    for (const uid of userIds) {
      const w = walletByUser[uid];
      await client.query('UPDATE wallets SET balance = $1 WHERE id = $2', [w.balance, w.id]);
    }

    // -------------------------------------------------------------
    // 10. Ratings - passengers rate drivers for completed bookings
    // -------------------------------------------------------------
    const ratingRows = [];
    const completedBookings = bookings.filter((b) => b.tripStatus === 'completed');
    for (const b of shuffle(completedBookings).slice(0, 50)) {
      ratingRows.push([b.id, b.passengerId, b.driverId, randInt(3, 5), rand() < 0.4 ? pick(['Great ride, on time!', 'Smooth and safe driving.', 'Very friendly, would ride again.', 'Comfortable car, good AC.', 'Punctual and courteous.']) : null]);
    }
    await bulkInsert(client, 'ratings', ['booking_id', 'rater_id', 'ratee_id', 'stars', 'comment'], ratingRows);

    // -------------------------------------------------------------
    // 11. Chat messages - between driver & passengers of a ride
    // -------------------------------------------------------------
    const chatRows = [];
    const bookedRideIds = [...new Set(bookings.map((b) => b.rideId))];
    for (const rideId of shuffle(bookedRideIds).slice(0, 35)) {
      const rideBookings = bookings.filter((b) => b.rideId === rideId);
      if (!rideBookings.length) continue;
      const participants = [rideBookings[0].driverId, ...rideBookings.map((b) => b.passengerId)];
      const numMessages = randInt(1, 3);
      for (let i = 0; i < numMessages; i++) {
        chatRows.push([rideId, pick(participants), pick(CHAT_LINES)]);
      }
    }
    await bulkInsert(client, 'chat_messages', ['ride_id', 'sender_id', 'message'], chatRows);

    // -------------------------------------------------------------
    // 12. Trip locations - simulated live-tracking pings
    // -------------------------------------------------------------
    const locationRows = [];
    const trackableRides = rides.filter((r) => r.dayOffset >= -3 && r.dayOffset <= 2);
    for (const ride of shuffle(trackableRides).slice(0, 20)) {
      const rideRow = rideRows[rides.indexOf(ride)];
      const pLat = rideRow[4], pLng = rideRow[5], dLat = rideRow[7], dLng = rideRow[8];
      const steps = randInt(3, 6);
      for (let s = 1; s <= steps; s++) {
        const frac = s / (steps + 1);
        const lat = pLat + (dLat - pLat) * frac + randFloat(-0.002, 0.002, 5);
        const lng = pLng + (dLng - pLng) * frac + randFloat(-0.002, 0.002, 5);
        locationRows.push([ride.id, lat, lng, randInt(0, 359), randFloat(10, 50, 1)]);
      }
    }
    await bulkInsert(client, 'trip_locations', ['ride_id', 'latitude', 'longitude', 'heading', 'speed_kmph'], locationRows);

    // -------------------------------------------------------------
    // 13. Notifications - a handful per user
    // -------------------------------------------------------------
    const notificationRows = [];
    for (const uid of shuffle(userIds).slice(0, 30)) {
      const numNotifs = randInt(1, 3);
      for (let i = 0; i < numNotifs; i++) {
        const t = pick(NOTIF_TEMPLATES);
        notificationRows.push([uid, t.title, t.body, t.type, rand() < 0.5]);
      }
    }
    await bulkInsert(client, 'notifications', ['user_id', 'title', 'body', 'type', 'is_read'], notificationRows);

    await client.query('COMMIT');

    console.log('✔ Dummy data seed complete.');
    console.log(`  Organization: Acme Technologies (acme.com)`);
    console.log(`  Users: ${userIds.length} | Vehicles: ${vehicles.length} | Rides: ${rides.length}`);
    console.log(`  Bookings: ${bookings.length} | Payments: ${paymentRows.length} | Wallet tx: ${walletTxRows.length}`);
    console.log(`  Ratings: ${ratingRows.length} | Chat messages: ${chatRows.length} | Location pings: ${locationRows.length}`);
    console.log(`  Notifications: ${notificationRows.length} | Saved places: ${savedPlaceRows.length}`);
    const totalRows =
      1 + userIds.length + vehicles.length + savedPlaceRows.length + rides.length + bookings.length +
      paymentRows.length + walletTxRows.length + ratingRows.length + chatRows.length +
      locationRows.length + notificationRows.length + userIds.length /* wallets */;
    console.log(`  Total rows inserted (approx): ${totalRows}`);
    console.log('');
    console.log('  Admin login:     admin@acme.com / Password123!');
    console.log('  Driver login:    rohan@acme.com / Password123!');
    console.log('  Passenger login: ananya@acme.com / Password123!');
    console.log('  Other employees: emp1@acme.com .. emp37@acme.com / Password123!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✘ Seed failed:', err.message);
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();