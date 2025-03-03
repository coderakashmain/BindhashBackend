const express = require("express");
const db = require("../config/db");

const router = express.Router();

// Get chat history between two users
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
    console.log(err)
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});

// Save message to database
router.post("/", (req, res) => {
  const { sender_id, receiver_id, message } = req.body;

  const sql = "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
  db.query(sql, [sender_id, receiver_id, message], (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, message_id: result.insertId });
  });
});

module.exports = router;
