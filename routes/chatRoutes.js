const express = require("express");
const db = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");
const router = express.Router();

module.exports = (io) => {
  router.get("/users", verifyToken, async (req, res) => {
    const { userId } = req.query;

    const sql = `
    SELECT 
      u.id,
      CASE 
        WHEN u.visibility = 'anonymous' THEN 'Anonymous'
        ELSE u.username
      END AS username,
      CASE 
        WHEN u.visibility = 'anonymous ' THEN 'null'
        ELSE u.profile_pic
      END AS profile_pic,
      u.visibility AS visibility,
      m.message AS last_message,
      m.created_at AS last_message_time
    FROM (
      SELECT 
        CASE 
          WHEN sender_id = ? THEN receiver_id
          ELSE sender_id
        END AS chat_partner_id,
        MAX(id) AS last_message_id
      FROM messages
      WHERE sender_id = ? OR receiver_id = ?
      GROUP BY chat_partner_id
    ) AS recent_chats
    JOIN messages m ON m.id = recent_chats.last_message_id
    JOIN users u ON u.id = recent_chats.chat_partner_id
    ORDER BY m.created_at DESC;
  `;

    try {
      const [results] = await db.query(sql, [userId, userId, userId]);
      res.status(200).json(results);
    } catch (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  });

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
      const [result] = await db.query(sql, [
        userId,
        receiverId,
        receiverId,
        userId,
      ]);
      res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
  });

  router.post("/", async (req, res) => {
    const { sender_id, receiver_id, message } = req.body;



    const connection = await db.getConnection();

    const sql =
      "INSERT INTO messages (sender_id, receiver_id, message, created_at, status) VALUES (?, ?, ?, NOW(), 'sent')";

    try {
      await connection.beginTransaction();


      if (!sender_id || !receiver_id || !message) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const [result] = await connection.query(sql, [sender_id, receiver_id, message]);

      const fetchSql = "SELECT created_at FROM messages WHERE id = ?";
      const [fetchResult] = await connection.query(fetchSql, [result.insertId]);

      const savedMessage = {
        id: result.insertId,
        sender_id,
        receiver_id,
        message,
        created_at: fetchResult[0].created_at,
        status: "sent",
      };
   
      const receiverSocket = global.onlineUsers[String(receiver_id)];

      if (!receiverSocket) {
        if (global.onlineUsers[sender_id]) {
          io.to(global.onlineUsers[sender_id]).emit(
            "sendMessage",
            savedMessage
          );
        }
        // console.log(`User ${receiver_id} is not online.`);
          await connection.commit();
        return res
          .status(200)
          .json({ message: "Message saved, but user is offline" });
      }

        //  console.log(`User ${receiver_id} is  online.`);

      io.emit("privateMessage", {
        ...savedMessage,
        status: "delivered",
      });

      const updateSql = "UPDATE messages SET status = ? WHERE id = ?";
      await connection.query(updateSql, ["delivered", savedMessage.id]);

      try {
        const interactionSql = `
        INSERT INTO interactions (user_id_1, user_id_2, weight, last_interaction)
        VALUES (?, ?, 5, NOW()) 
        ON DUPLICATE KEY UPDATE weight = weight + 5, last_interaction = NOW();
    `;

        const [results] = await db.query(interactionSql, [
          Math.min(sender_id, receiver_id),
          Math.max(sender_id, receiver_id),
        ]);
      } catch (err) {
        console.error("This is interactionSql error", err);
      }

      
      await connection.commit();
      res.json({ success: true, message_id: result.insertId });
    } catch (err) {
      await connection.rollback();
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    finally{
      connection.release();
    }
  });

  router.get("/chat/data", async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const sql = `
  SELECT users.id, 
  CASE 
    WHEN users.visibility = 'anonymous' THEN 'Anonymous'
    ELSE users.username
  END AS username,
  CASE 
    WHEN users.visibility = 'anonymous' THEN 'null'
    ELSE users.profile_pic
  END AS profile_pic,
  users.visibility as visibility,
    user_bio.philosophy
  FROM users
  LEFT JOIN user_bio ON users.id = user_bio.user_id
  WHERE users.id = ?
`;

      const [result] = await db.query(sql, [userId]);

      res.json(result);
    } catch (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  });

  return router;
};
