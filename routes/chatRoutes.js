const express = require("express");
const db = require("../config/db");

const router = express.Router();

module.exports = (io) => {
  router.get("/:receiverId", (req, res) => {
    const { userId } = req.query; // Logged-in user
    const { receiverId } = req.params;

    const sql = `
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?) 
      ORDER BY created_at ASC
    `;

    db.query(sql, [userId, receiverId, receiverId, userId], (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(result);
    });
  });

  router.post("/", (req, res) => {
    const { sender_id, receiver_id, message } = req.body;

    const sql = "INSERT INTO messages (sender_id, receiver_id, message, created_at, status) VALUES (?, ?, ?, NOW(), 'sent')";
    
    db.query(sql, [sender_id, receiver_id, message], (err, result) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }


      const fetchSql = "SELECT created_at FROM messages WHERE id = ?";
      db.query(fetchSql, [result.insertId], (fetchErr, fetchResult) => {
          if (fetchErr) {
              return res.status(500).json({ error: "Error fetching timestamp" });
          }


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

      if (receiverSocket) {
        io.to(receiverSocket).emit("privateMessage", { ...savedMessage, status: "delivered" });
        const updateSql = "UPDATE messages SET status = ? WHERE id = ?";
        db.query(updateSql, ["delivered", savedMessage.id]);

      }

      res.json({ success: true, message_id: result.insertId });
    });
  });
});

  return router;
};
