const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { verifyToken, newuserverify } = require("../middleware/authMiddleware");
const { transporter } = require("../middleware/mailProvider");
const crypto = require("crypto");
require("dotenv").config();
const dayjs = require("dayjs");

const router = express.Router();

module.exports = (io) => {
  // Register User
  router.post("/register/otpsend", async (req, res) => {
    const { email, isChecked } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    if (!isChecked) {
      return res
        .status(400)
        .json({ error: "Please accept the Terms & Conditions to continue. " });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const check = "SELECT id FROM users WHERE email = ?";

      const [emailExists] = await connection.query(check, [email]);

      if (emailExists.length > 0) {
        await connection.rollback();
        return res.status(409).json({ error: "Email already registered!" });
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      const otpExpires = new Date(Date.now() + 10 * 60000);

      // Check if user exists
      const [user] = await connection.query(
        "SELECT lastOtpTime FROM newusers WHERE gmail = ?",
        [email]
      );

      if (user.length > 0) {
        const lastOtpTime = new Date(user[0].lastOtpTime);
        const now = new Date();
        const diffMinutes = (now - lastOtpTime) / (1000 * 60);

        if (diffMinutes < 1) {
          await connection.rollback();
          return res
            .status(429)
            .json({ error: "OTP request too soon. Please wait a minute." });
        }

        await connection.query(
          "UPDATE newusers SET otp = ?, otpExpires = ?, lastOtpTime = ? WHERE gmail = ?",
          [otp, otpExpires, now, email]
        );
      } else {
        await connection.query(
          "INSERT INTO newusers (gmail, otp, otpExpires, lastOtpTime, otp_id) VALUES (?, ?, ?, ?, UUID())",
          [email, otp, otpExpires, new Date()]
        );
      }

      // Send OTP email
      const mailOptions = {
        to: email,
        from: process.env.EMAIL_USER,
        subject: "Bindhash OTP for Creating a New Account",
        html: `
      <html> 
      <body> 
        <div style="background-color: #f0f0f0; padding: 20px; font-family: Arial, sans-serif;">
          <div style="background-color: #ffffff; padding: 20px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px; margin: auto;">
            <h2 style="color: #333;">Welcome to Bindhash!</h2>
            <p style="color: #555;">Thank you for signing up! Please use the following OTP to complete your registration:</p>
            <h3 style="color: #007bff;">${otp}</h3>
            <p style="color: #555;">If you did not request this, please ignore this email.</p>
            <p style="color: #555;">Best regards,<br>The Bingbox Team</p>
          </div>
        </div>
      </body>
      </html>
      `,
      };

      await transporter.sendMail(mailOptions);
      await connection.commit();

      return res.json({ success: true, message: "OTP sent successfully!" });
    } catch (err) {
      console.error("Error sending OTP:", err);
      await connection.rollback();
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      if (connection) connection.release();
    }
  });

  router.post("/verifyotp", async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required!" });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [otpRecord] = await connection.query(
        "SELECT otp, otpExpires, otp_id FROM newusers WHERE gmail = ? ORDER BY otpExpires DESC LIMIT 1",
        [email]
      );

      if (otpRecord.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "No OTP found for this email!" });
      }

      const { otp: storedOtp, otpExpires, otp_id } = otpRecord[0];

      // Validate OTP
      if (otp !== storedOtp) {
        connection.release();
        return res.status(401).json({ error: "Invalid OTP!" });
      }

      if (new Date() > new Date(otpExpires)) {
        await connection.rollback();
        return res
          .status(410)
          .json({ error: "OTP expired! Request a new one." });
      }

      // Remove OTP record
      await connection.query("DELETE FROM newusers WHERE otp_id = ?", [otp_id]);

      await connection.commit();
      return res.json({
        success: true,
        message: "OTP verified successfully! Account created.",
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error verifying OTP:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      if (connection) connection.release();
    }
  });

  router.post("/setpassword", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required!" });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      let baseUsername = email.split("@")[0];
      let username = baseUsername;
      let counter = 1;

      const [rows] = await connection.query(
        "SELECT username FROM users WHERE username = ?",
        [username]
      );

      while (rows.length > 0) {
        username = `${baseUsername}${counter++}`;
        const [newRows] = await connection.query(
          "SELECT username FROM users WHERE username = ?",
          [username]
        );
        if (newRows.length === 0) break;
      }

      // Update password in database
      const [result] = await connection.query(
        "INSERT INTO users (email, username, password) VALUES (?, ?, ?)",
        [email, username, hashedPassword]
      );

      const userId = result.insertId;
      const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      await connection.commit();

      res.cookie("newusertoken", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        domain:
          process.env.NODE_ENV === "production" ? ".bindhash.xyz" : undefined,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      });

      return res.json({ success: true, message: "Password set successfully!" });
    } catch (err) {
      await connection.rollback();
      console.error("Error setting password:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      if (connection) connection.release();
    }
  });

  router.post("/setusername", newuserverify, async (req, res) => {
    const { username, fullName } = req.body;

    if (!req.user) {
      console.log("User not found in middleware.");
      return res
        .status(401)
        .json({ authenticated: false, message: "No token found" });
    }

    const userid = req.user.id;
    const email = req.user.email;

    if (!email || !username || !fullName) {
      return res
        .status(400)
        .json({ error: "Email, username, and full name are required!" });
    }

    const connection = await db.getConnection();
    try {
      // Check if user exists
      const [user] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [userid]
      );

      if (user.length === 0) {
        connection.release();
        return res.status(404).json({ error: "User not found!" });
      }

      // Check if username is taken
      const [existingUser] = await connection.query(
        "SELECT * FROM users WHERE username = ?",
        [username]
      );
      if (existingUser.length > 0) {
        connection.release();
        return res.status(409).json({ error: "Username is already taken!" });
      }

      // Update username & full name in database
      await connection.query(
        "UPDATE users SET username = ?, fullname = ? WHERE id = ?",
        [username, fullName, userid]
      );

      return res.json({
        success: true,
        message: "Username & Full Name set successfully!",
      });
    } catch (err) {
      console.error("Error setting username:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      if (connection) connection.release();
    }
  });

  router.post("/setgender", newuserverify, async (req, res) => {
    const { gender } = req.body;

    if (!gender) {
      return res.status(400).json({ error: "Email and gender are required!" });
    }

    if (!req.user) {
      console.log("User not found in middleware.");
      return res
        .status(401)
        .json({ authenticated: false, message: "No token found" });
    }

    const userid = req.user.id;
    const email = req.user.email;

    try {
      // Update gender in the database
      await db.query("UPDATE users SET gender = ? WHERE id = ?", [
        gender,
        userid,
      ]);

      return res.json({
        success: true,
        message: "Gender updated successfully!",
      });
    } catch (err) {
      console.error("Error updating gender:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post("/register", async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql =
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
    try {
      await db.query(sql, [username, email, hashedPassword]);
      res.json({ message: "User registered successfully!" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Login User
  router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
      const sql = "SELECT * FROM users WHERE email = ? OR username = ?";
      const [results] = await db.query(sql, [username, username]);

      if (results.length === 0)
        return res.status(401).json({ error: "No account found." });

      let matchedUser = null;

      for (const user of results) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          matchedUser = user;
          break;
        }
      }

      if (!matchedUser)
        return res.status(401).json({ error: "Wrong password." });

      const token = jwt.sign(
        {
          id: matchedUser.id,
          username: matchedUser.username,
          fullname: matchedUser.fullname,
          profile_pic: matchedUser.profile_pic,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.cookie("usertoken", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      });

      res.json({
        user: {
          id: matchedUser.id,
          username: matchedUser.username,
          email: matchedUser.email,
          fullname: matchedUser.fullname,
          profile_pic: matchedUser.profile_pic,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  });

  router.post("/logout", (req, res) => {
    res.clearCookie("usertoken");
    res.json({ message: "Logged out" });
  });

  router.get("/accounts", async (req, res) => {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const sql =
        "SELECT username, profile_pic,email FROM users WHERE email = ?";
      const [results] = await db.query(sql, [email]); // <-- FIXED

      res.json(results); // <-- FIXED
    } catch (err) {
      console.error("Error fetching accounts:", err);
      return res.status(500).json({ error: "Database error" });
    }
  });

  ///Mode swithcer api

  router.post("/modeswitcher", verifyToken, async (req, res) => {
    const { mode } = req.body;
    const userId = req.user.id;

    if (!["self", "anonymous"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode" });
    }

    try {
      const query = "UPDATE users SET visibility = ? WHERE id = ?";

      const [results] = await db.query(query, [mode, userId]);

      res
        .status(200)
        .json({ message: "Mode Change", mode: mode, userId: userId });
    } catch (err) {
      console.error("Database Error", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  //forgatepassword

  router.post("/forgot-password/sendotp", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required!" });

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [results] = await connection.query(
        "SELECT id FROM users WHERE email = ? ",
        [email]
      );

      if (results.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "User not Found" });
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      const otpExpires = new Date(Date.now() + 10 * 60000);
      const now = new Date();
      const today = dayjs().format("YYYY-MM-DD");

      const [rows] = await connection.query(
        "SELECT * FROM forgotpassword WHERE gmail = ?",
        [email]
      );

      if (rows.length > 0) {
        const user = rows[0];

        // Check if user hit daily limit
        if (
          user.otpDate &&
          user.otpDate.toISOString().slice(0, 10) === today &&
          user.otpCount >= 5
        ) {
          await connection.rollback();
          return res
            .status(429)
            .json({
              error: "You’ve reached today’s OTP limit. Try again tomorrow.",
            });
        }

        // Check for 30s cooldown
        const diffSeconds = (now - new Date(user.lastOtpTime)) / 1000;
        if (diffSeconds < 30) {
          await connection.rollback();
          return res.status(429).json({
            error: "OTP request too soon. Please wait before retrying.",
            retryAfter: Math.ceil(30 - diffSeconds),
          });
        }

        let newCount = user.otpCount;
        let newDate = user.otpDate;
        if (user.otpDate.toISOString().slice(0, 10) !== today) {
          newCount = 1;
          newDate = today;
        } else {
          newCount += 1;
        }

        await connection.query(
          "UPDATE forgotpassword SET otp = ?, otpExpires = ?, lastOtpTime = ?, otpCount = ?, otpDate = ? WHERE gmail = ?",
          [otp, otpExpires, now, newCount, newDate, email]
        );
      } else {
        await connection.query(
          "INSERT INTO forgotpassword (gmail, otp, otpExpires, lastOtpTime, otpCount, otpDate) VALUES (?, ?, ?, ?, ?, ?)",
          [email, otp, otpExpires, now, 1, today]
        );
      }

      // Send OTP Email
      const mailOptions = {
        to: email,
        from: process.env.EMAIL_USER,
        subject: "Bindhash OTP for Resetting Password",
        html: `
      <html>
      <body>
        <div style="background-color: #f0f0f0; padding: 20px;">
          <div style="background-color: #fff; padding: 20px; border-radius: 5px; max-width: 600px; margin: auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p style="color: #555;">Use the OTP below to reset your password:</p>
            <h3 style="color: #007bff;">${otp}</h3>
            <p style="color: #555;">This OTP is valid for 10 minutes.</p>
            <p style="color: #999;">If you didn’t request this, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
      `,
      };

      await transporter.sendMail(mailOptions);
      await connection.commit();

      return res.json({
        success: true,
        message: "OTP sent successfully!",
        retryAfter: 30,
      });
    } catch (err) {
      console.error("Forgot password OTP error:", err);
      await connection.rollback();
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      if (connection) connection.release();
    }
  });

  router.post("/forgot-password/verify", async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required!" });
    }

    const connection = await db.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT otp, otpExpires FROM forgotpassword WHERE gmail = ?",
        [email]
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "OTP not found. Please request again." });
      }

      const userOtp = rows[0];

      const now = new Date();
      const expires = new Date(userOtp.otpExpires);

      if (now > expires) {
        return res
          .status(410)
          .json({ error: "OTP has expired. Please request again." });
      }

      if (userOtp.otp !== otp) {
        return res
          .status(401)
          .json({ error: "Invalid OTP. Please try again." });
      }

      return res.json({ success: true, message: "OTP verified successfully!" });
    } catch (err) {
      console.error("OTP verification error:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      if (connection) connection.release();
    }
  });

  router.post("/forgot-password/reset", async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res
        .status(400)
        .json({ error: "Email and new password are required!" });
    }

    const connection = await db.getConnection();
    try {
      // Check if user exists
      const [rows] = await connection.query(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );
      if (rows.length === 0) {
        return res
          .status(404)
          .json({ error: "No user found with this email." });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update password
      await connection.query("UPDATE users SET password = ? WHERE email = ?", [
        hashedPassword,
        email,
      ]);

      // Optional: clear OTP after password reset
      await connection.query("DELETE FROM forgotpassword WHERE gmail = ?", [
        email,
      ]);

      return res.json({
        success: true,
        message: "Password has been reset successfully!",
      });
    } catch (err) {
      console.error("Password reset error:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    } finally {
      if (connection) connection.release();
    }
  });

  return router;
};
