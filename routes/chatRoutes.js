const express = require("express");
const db = require("../config/db"); 
const {verifyToken} = require("../middleware/authMiddleware")
const router = express.Router();

module.exports = (io) => {

  router.get("/users",verifyToken, async (req, res) => {
    const { userId } = req.query; 

   
    try {
      const sql = "SELECT id, username, profile_pic FROM users WHERE id != ?";
  
      const [results] = await db.query(sql, [userId]); // Use promise-based query
  
      res.json(results); 
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
      console.log(err);
      return res.status(500).json({ error: "Database error" });
    }
  });

  router.post("/", async (req, res) => {
    const { sender_id, receiver_id, message } = req.body;
  
    const sql =
      "INSERT INTO messages (sender_id, receiver_id, message, created_at, status) VALUES (?, ?, ?, NOW(), 'sent')";

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
        status: "sent",
      };
      console.log("Current online users:", global.onlineUsers);
      const receiverSocket = global.onlineUsers[String(receiver_id)];
      
      if (!receiverSocket) {
        if (global.onlineUsers[sender_id]) {
          io.to(global.onlineUsers[sender_id]).emit("sendMessage", savedMessage);
        }
        console.log(`User ${receiver_id} is not online.`);
        return res
          .status(200)
          .json({ message: "Message saved, but user is offline" });
      }

     
      io.to(receiverSocket).emit("privateMessage", {
        ...savedMessage,
        status: "delivered",
      });

      const updateSql = "UPDATE messages SET status = ? WHERE id = ?";
      await db.query(updateSql, ["delivered", savedMessage.id]);

      try{
        const interactionSql = `
        INSERT INTO interactions (user_id_1, user_id_2, weight, last_interaction)
        VALUES (?, ?, 5, NOW()) 
        ON DUPLICATE KEY UPDATE weight = weight + 5, last_interaction = NOW();
    `;

   const [results]=  await db.query(interactionSql, [
          Math.min(sender_id, receiver_id),
          Math.max(sender_id, receiver_id),
        ]);

      }catch(err){
        console.error("This is interactionSql error",err);
      }

     
       
      res.json({ success: true, message_id: result.insertId });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
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
  SELECT users.id, users.username, users.profile_pic, user_bio.philosophy
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
