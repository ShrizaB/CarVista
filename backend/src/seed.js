const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orgRes = await client.query(
      `INSERT INTO organizations (name, domain, fuel_cost_per_litre, avg_fuel_efficiency, default_fare_per_km)
       VALUES ('Acme Technologies', 'acme.com', 105.50, 16, 8)
       ON CONFLICT (domain) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const orgId = orgRes.rows[0].id;

    const password_hash = await bcrypt.hash('Password123!', 10);

    const admin = await client.query(
      `INSERT INTO users (organization_id, full_name, email, phone, password_hash, role, employee_code)
       VALUES ($1,'Priya Sharma','admin@acme.com','9800000001',$2,'company_admin','ACME-ADM-01')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [orgId, password_hash]
    );

    const driver = await client.query(
      `INSERT INTO users (organization_id, full_name, email, phone, password_hash, role, employee_code)
       VALUES ($1,'Rohan Mehta','rohan@acme.com','9800000002',$2,'employee','ACME-EMP-01')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [orgId, password_hash]
    );

    const passenger = await client.query(
      `INSERT INTO users (organization_id, full_name, email, phone, password_hash, role, employee_code)
       VALUES ($1,'Ananya Iyer','ananya@acme.com','9800000003',$2,'employee','ACME-EMP-02')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [orgId, password_hash]
    );

    const driverId = driver.rows[0].id;
    const passengerId = passenger.rows[0].id;

    await client.query(
      `INSERT INTO vehicles (owner_id, model, registration_number, color, seating_capacity, vehicle_type)
       VALUES ($1,'Hyundai Creta','WB-06-AB-1234','White',4,'suv')
       ON CONFLICT (registration_number) DO NOTHING`,
      [driverId]
    );

    for (const uid of [driver.rows[0].id, passenger.rows[0].id, admin.rows[0].id]) {
      await client.query(
        `INSERT INTO wallets (user_id, balance) VALUES ($1, 500.00)
         ON CONFLICT (user_id) DO NOTHING`,
        [uid]
      );
    }

    await client.query('COMMIT');
    console.log('✔ Seed complete.');
    console.log('  Admin login:     admin@acme.com / Password123!');
    console.log('  Driver login:    rohan@acme.com / Password123!');
    console.log('  Passenger login: ananya@acme.com / Password123!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✘ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
