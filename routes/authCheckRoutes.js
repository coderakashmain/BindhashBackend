const express = require("express");
const authMiddleware = require('../middleware/authMiddleware')

require("dotenv").config();
const db = require("../config/db");
const router = express.Router();




router.get("/check", authMiddleware, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false, message: "No token found" });
  }
  

  const userid = req.user.id;

  // Corrected SQL query
  const sql = "SELECT * FROM users WHERE id = ?";
  db.query(sql, [userid], (err, results) => {
    if (err) {
      console.log("Database Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length > 0) {
      const user = results[0];
      

      return res.json({ authenticated: true, user });
    } else {
      return res.status(404).json({ authenticated: false, message: "User not found" });
    }
  });
});


module.exports = router;
