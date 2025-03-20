const express = require("express");
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const { profileUpload, postUpload } = require("../middleware/multerConfig");
const cloudinary = require("../middleware/cloudinaryConfig");

const router = express.Router();

const storage = multer.diskStorage({
  destination: "./uploads/profile_pics/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

router.get("/", async (req, res) => {
  const { userId } = req.query; // Get logged-in user ID

  try {
    const sql = "SELECT id, username, profile_pic FROM users WHERE id != ?";
    
    const [results] = await db.query(sql, [userId]); // Use promise-based query
    
    res.json(results); // No need for `[0]`, as `results` is already an array
  } catch (err) {
    console.error("Database query error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});


router.get("/userlist", async (req, res) => {
  const { userId } = req.query; // Get logged-in user ID

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const sql = "SELECT id, username, profile_pic FROM users WHERE id != ?";
    
    const [result] = await db.query(sql, [userId]); // Use promise-based query
    
    res.json(result); // Return the result array
  } catch (err) {
    console.error("Database query error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});


router.get("/chat", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const sql = "SELECT id, username, profile_pic FROM users WHERE id = ?";
    const [result] = await db.query(sql, [userId]);

    res.json(result);
  } catch (err) {
    console.error("Database query error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});


router.post(
  "/upload-profile",
  profileUpload.single("profile_pic"),
  async (req, res) => {
    const { userid } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const profilePicPath = req.file.path;

    try {
      // Fetch the old profile picture
      const sqlGetOldImage = "SELECT profile_pic FROM users WHERE id = ?";
      const [result] = await db.query(sqlGetOldImage, [userid]);

      if (result.length > 0 && result[0].profile_pic) {
        const oldImageUrl = result[0].profile_pic;
        const parts = oldImageUrl.split("/").slice(-2).join("/"); 
        const publicId = parts.substring(0, parts.lastIndexOf("."));

        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (cloudinaryError) {
          console.error("Cloudinary delete error:", cloudinaryError);
        }
      }

      // Update the new profile picture
      const sqlUpdate = "UPDATE users SET profile_pic = ? WHERE id = ?";
      await db.query(sqlUpdate, [profilePicPath, userid]);

      res.json({ profile_pic: profilePicPath });

    } catch (error) {
      console.error("Database or Cloudinary error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
);


router.get("/followers-count", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM followers WHERE following_id = ?) AS followers_count,
      (SELECT COUNT(*) FROM followers WHERE follower_id = ?) AS following_count
  `;

  try {
    const [results] = await db.query(sql, [userId, userId]);
    res.json(results[0]);
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});


router.post("/follow", async (req, res) => {
  const { followerId, followingId } = req.body;

  if (!followerId || !followingId) {
    return res.status(400).json({ error: "Both followerId and followingId are required" });
  }

  if (followerId === followingId) {
    return res.status(400).json({ error: "You can't follow yourself!" });
  }

  const sql = `INSERT IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)`;

  try {
    const [result] = await db.query(sql, [followerId, followingId]);

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: "Already following this user" });
    }

    res.json({ message: "Followed successfully!" });
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});


router.post("/unfollow", async (req, res) => {
  const { followerId, followingId } = req.body;

  if (!followerId || !followingId) {
    return res.status(400).json({ error: "Both followerId and followingId are required" });
  }

  const sql = `DELETE FROM followers WHERE follower_id = ? AND following_id = ?`;

  try {
    const [result] = await db.query(sql, [followerId, followingId]);

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: "You are not following this user" });
    }

    res.json({ message: "Unfollowed successfully!" });
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});


router.get("/is-following", async (req, res) => {
  const { followerId, followingId } = req.query;

  if (!followerId || !followingId) {
    return res.status(400).json({ error: "Both followerId and followingId are required" });
  }

  const sql = "SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ? LIMIT 1";

  try {
    const [results] = await db.query(sql, [followerId, followingId]);

    res.json({ isFollowing: results.length > 0 });
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});


router.get("/suggested-users", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const sql = `
    WITH UserFollowers AS (
        SELECT following_id FROM followers WHERE follower_id = ?
    ),
    Mutuals AS (
        SELECT DISTINCT u.id, u.username, u.profile_pic, COUNT(f.follower_id) AS mutual_count
        FROM users u
        JOIN followers f ON u.id = f.follower_id
        WHERE f.following_id IN (SELECT following_id FROM UserFollowers)
          AND u.id != ?
          AND u.id NOT IN (SELECT following_id FROM UserFollowers)
        GROUP BY u.id
        ORDER BY mutual_count DESC
        LIMIT 5
    )
    SELECT * FROM Mutuals
    UNION
    SELECT id, username, profile_pic, 0 AS mutual_count FROM users
    WHERE id != ?
      AND id NOT IN (SELECT following_id FROM UserFollowers)
      AND id NOT IN (SELECT id FROM Mutuals)
    ORDER BY RAND()
    LIMIT 5;
  `;

  try {
    const [results] = await db.query(sql, [userId, userId, userId]);
    res.json(results);
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});


router.get("/leaderboard", async (req, res) => {
  const sql = `
    SELECT 
      users.id, 
      users.username, 
      users.profile_pic, 
      IFNULL(like_count.total_likes, 0) AS total_likes,
      IFNULL(comment_count.total_comments, 0) AS total_comments,
      IFNULL(share_count.total_shares, 0) AS total_shares,
      IFNULL(followers_count.total_followers, 0) AS total_followers,

      -- Calculate engagement score
      (IFNULL(like_count.total_likes, 0) * 1 + 
       IFNULL(comment_count.total_comments, 0) * 2 + 
       IFNULL(share_count.total_shares, 0) * 3 + 
       IFNULL(followers_count.total_followers, 0) * 5) AS engagement_score 

    FROM users

    -- Count Likes
    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_likes 
      FROM likes 
      JOIN posts ON likes.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS like_count ON like_count.user_id = users.id

    -- Count Comments
    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_comments 
      FROM comments 
      JOIN posts ON comments.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS comment_count ON comment_count.user_id = users.id

    -- Count Shares
    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_shares 
      FROM shares 
      JOIN posts ON shares.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS share_count ON share_count.user_id = users.id

    -- Count Followers
    LEFT JOIN (
      SELECT following_id, COUNT(*) AS total_followers 
      FROM followers 
      GROUP BY following_id
    ) AS followers_count ON followers_count.following_id = users.id

    -- Sort by engagement score (most active users first)
    ORDER BY engagement_score DESC 

    -- Limit to Top 10 users
    LIMIT 10;
  `;

  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});


module.exports = router;
