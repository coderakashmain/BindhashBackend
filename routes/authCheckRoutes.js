const express = require("express");
const {verifyToken} = require('../middleware/authMiddleware')

require("dotenv").config();
const db = require("../config/db");
const router = express.Router();




router.get("/check", verifyToken,async (req, res) => {
  if (!req.user) {
    console.log("User not found in middleware.");
    return res.status(401).json({ authenticated: false, message: "No token found" });
  }
  

  const userid = req.user.id;


  // Corrected SQL query
  try {
    const [userResults] = await db.query("SELECT * FROM users WHERE id = ?", [userid]);

    if (userResults.length === 0) {
      return res.status(404).json({ authenticated: false, message: "User not found" });
  }

  const [bioResults] = await db.query(
    "SELECT education, profession, skills, hobbies, philosophy FROM user_bio WHERE user_id = ?",
    [userid]

    
);
const user = {
  ...userResults[0],
  bio: bioResults.length > 0 ? bioResults[0] : {} // If no bio exists, return an empty object
};


    
      return res.json({ authenticated: true, user });
    
  } catch (err) {
    console.error("Database Error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});


module.exports = router;
