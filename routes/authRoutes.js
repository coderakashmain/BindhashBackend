const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const authMiddleware = require('../middleware/authMiddleware')

require("dotenv").config();

const router = express.Router();

// Register User
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const sql = "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
  db.query(sql, [username, email, hashedPassword], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "User registered successfully!" });
  });
});

// Login User
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = results[0];


    const isMatch = await bcrypt.compare(password, results[0].password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, username: user.username, profile_pic : user.profile_pic }, process.env.JWT_SECRET, { expiresIn: "7d" });
    

    res.cookie("usertoken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Set to true in production
      sameSite: "Strict",
      maxAge: 1000*60*60*24*7, // 10 hour in milliseconds
    });

    res.json({token, user:{ id: user.id, username: user.username, email: user.email } });
  });
});


router.post("/logout", (req, res) => {
  res.clearCookie("usertoken");
  res.json({ message: "Logged out" });
});




module.exports = router;
