const db = require("../config/db");

async function sendOfflineMessagesToUser(io,userId, socketId) {


  try {
    const [rows] = await db.query(
      "SELECT * FROM messages WHERE receiver_id = ? AND status = 'sent'",
      [userId]
    );

    for (const msg of rows) {
      io.emit("privateMessage", {
        message_id: msg.id,
        sender_id: msg.sender_id,
        receiver_id: msg.receiver_id,
        message: msg.message,
        created_at: msg.created_at,
        status: "delivered",
      });

      await db.query("UPDATE messages SET status = ? WHERE id = ?", [
        "delivered",
        msg.id,
      ]);
    }

    // if (rows.length > 0) {
    //   console.log(`Delivered ${rows.length} offline messages to user ${userId}`);
    // }
  } catch (err) {
    console.error("Failed to send offline messages:", err);
  }
}

module.exports = sendOfflineMessagesToUser