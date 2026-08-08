const db = require('../db');

let io = null;
function attachIO(socketIoInstance) {
  io = socketIoInstance;
}

async function notifyUser(userId, title, body, type = 'info') {
  const result = await db.query(
    `INSERT INTO notifications (user_id, title, body, type) VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, title, body, type]
  );
  const notification = result.rows[0];
  if (io) io.to(`user:${userId}`).emit('notification', notification);
  return notification;
}

module.exports = { notifyUser, attachIO };
