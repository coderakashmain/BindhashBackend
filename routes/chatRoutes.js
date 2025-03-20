const express = require("express");
const db = require("../config/db"); // Kept as db (your original name)

const router = express.Router();

module.exports = (io) => {
  router.get("/:receiverId", async (req, res) => {
    const { userId } = req.query; // Logged-in user
    const { receiverId } = req.params;

    const sql = `
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?) 
      ORDER BY created_at ASC
    `;

    try {
      const [result] = await db.query(sql, [userId, receiverId, receiverId, userId]);
      res.json(result);
    } catch (err) {
      console.log(err);
      return res.status(500).json({ error: "Database error" });
    }
  });

  router.post("/", async (req, res) => {
    const { sender_id, receiver_id, message } = req.body;

    const sql = "INSERT INTO messages (sender_id, receiver_id, message, created_at, status) VALUES (?, ?, ?, NOW(), 'sent')";

    try {
      const [result] = await db.query(sql, [sender_id, receiver_id, message]);

      const fetchSql = "SELECT created_at FROM messages WHERE id = ?";
      const [fetchResult] = await db.query(fetchSql, [result.insertId]);

      const savedMessage = {
        id: result.insertId,
        sender_id,
        receiver_id,
        message,
        created_at: fetchResult[0].created_at,
        status: "sent"
      };

      const receiverSocket = global.onlineUsers[receiver_id];

      if (!receiverSocket) {
        console.log(`User ${receiver_id} is not online.`);
        return res.status(200).json({ message: "Message saved, but user is offline" });
      }

      io.to(receiverSocket).emit("privateMessage", { ...savedMessage, status: "delivered" });

      const updateSql = "UPDATE messages SET status = ? WHERE id = ?";
      await db.query(updateSql, ["delivered", savedMessage.id]);

      res.json({ success: true, message_id: result.insertId });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
  });

  return router;
};
