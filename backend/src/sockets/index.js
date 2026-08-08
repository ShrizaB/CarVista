const jwt = require('jsonwebtoken');
const db = require('../db');

function initSockets(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required.'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      next();
    } catch (err) {
      next(new Error('Invalid token.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`); // personal room, used for notifications

    // ---- Ride room (used for chat + live tracking + call signaling) ----
    socket.on('ride:join', ({ rideId }) => {
      socket.join(`ride:${rideId}`);
    });

    socket.on('ride:leave', ({ rideId }) => {
      socket.leave(`ride:${rideId}`);
    });

    // ---- Chat ----
    socket.on('chat:send', async ({ rideId, message }) => {
      if (!message?.trim()) return;
      try {
        // Edge case: pre-booking "Message Driver" should be disabled once a
        // ride's seats are fully booked by others, to avoid ghost conversations
        // for rides no longer available. Drivers and already-booked passengers
        // on this ride are always allowed to keep chatting.
        const rideRes = await db.query('SELECT driver_id, status FROM rides WHERE id = $1', [rideId]);
        if (!rideRes.rows.length) return;
        const ride = rideRes.rows[0];
        if (ride.driver_id !== userId && ride.status === 'full') {
          const bookingRes = await db.query(
            `SELECT id FROM bookings WHERE ride_id = $1 AND passenger_id = $2 AND trip_status != 'cancelled' LIMIT 1`,
            [rideId, userId]
          );
          if (!bookingRes.rows.length) {
            socket.emit('chat:error', { rideId, error: 'This ride is fully booked. Messaging is only available to the driver and booked passengers.' });
            return;
          }
        }

        const result = await db.query(
          `INSERT INTO chat_messages (ride_id, sender_id, message) VALUES ($1,$2,$3)
           RETURNING *`,
          [rideId, userId, message.trim()]
        );
        const userRes = await db.query('SELECT full_name FROM users WHERE id = $1', [userId]);
        const payload = { ...result.rows[0], sender_name: userRes.rows[0].full_name };
        io.to(`ride:${rideId}`).emit('chat:message', payload);
      } catch (err) {
        console.error('chat:send error', err.message);
      }
    });

    // ---- Live Trip Tracking ----
    // Driver's device streams location; broadcast to everyone in the ride room.
    socket.on('trip:location', async ({ rideId, latitude, longitude, heading, speedKmph }) => {
      try {
        await db.query(
          `INSERT INTO trip_locations (ride_id, latitude, longitude, heading, speed_kmph)
           VALUES ($1,$2,$3,$4,$5)`,
          [rideId, latitude, longitude, heading, speedKmph]
        );
        io.to(`ride:${rideId}`).emit('trip:location', { rideId, latitude, longitude, heading, speedKmph, at: new Date() });
      } catch (err) {
        console.error('trip:location error', err.message);
      }
    });

    socket.on('trip:status', ({ rideId, status }) => {
      io.to(`ride:${rideId}`).emit('trip:status', { rideId, status });
    });

    // ---- WebRTC voice call signaling (peer-to-peer, free, no external service) ----
    socket.on('call:offer', ({ rideId, offer, to }) => {
      io.to(`user:${to}`).emit('call:offer', { rideId, offer, from: userId });
    });
    socket.on('call:answer', ({ rideId, answer, to }) => {
      io.to(`user:${to}`).emit('call:answer', { rideId, answer, from: userId });
    });
    socket.on('call:ice-candidate', ({ rideId, candidate, to }) => {
      io.to(`user:${to}`).emit('call:ice-candidate', { rideId, candidate, from: userId });
    });
    socket.on('call:end', ({ rideId, to }) => {
      io.to(`user:${to}`).emit('call:end', { rideId, from: userId });
    });

    socket.on('disconnect', () => {
      // no-op; rooms are cleaned up automatically
    });
  });
}

module.exports = { initSockets };
