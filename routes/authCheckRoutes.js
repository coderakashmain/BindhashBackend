const express = require("express");
const authMiddleware = require('../middleware/authMiddleware')

require("dotenv").config();
const db = require("../config/db");
const router = express.Router();




router.get("/check", authMiddleware,async (req, res) => {
  if (!req.user) {
    console.log("User not found in middleware.");
    return res.status(401).json({ authenticated: false, message: "No token found" });
  }
  

  const userid = req.user.id;


  // Corrected SQL query
  try {
    const [results] = await db.query("SELECT * FROM users WHERE id = ?", [userid]);



    if (results.length > 0) {
      return res.json({ authenticated: true, user: results[0] });
    } else {
      return res.status(404).json({ authenticated: false, message: "User not found" });
    }
  } catch (err) {
    console.error("Database Error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});


module.exports = router;
