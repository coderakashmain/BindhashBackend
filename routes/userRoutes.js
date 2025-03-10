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

router.get("/", (req, res) => {
  const { userId } = req.query; // Get logged-in user ID

  const sql = "SELECT id, username ,profile_pic FROM users WHERE id != ?";
  db.query(sql, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});

router.get("/userlist", (req, res) => {
  const { userId } = req.query; // Get logged-in user ID

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const sql = "SELECT id, username, profile_pic FROM users WHERE id != ?";

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Database query error:", err); // Log error properly
      return res.status(500).json({ error: "Database error" });
    }

    res.json(result);
  });
});

router.get("/chat", (req, res) => {
  const { userId } = req.query;

  const sql = "SELECT id, username, profile_pic FROM users WHERE id = ?";
  db.query(sql, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});

router.post(
  "/upload-profile",
  profileUpload.single("profile_pic"),
  (req, res) => {
    const { userid } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const profilePicPath = req.file.path;

    const sqlGetOldImage = "SELECT profile_pic FROM users WHERE id = ?";
    db.query(sqlGetOldImage, [userid], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      if (result.length > 0 && result[0].profile_pic) {
        const oldImageUrl = result[0].profile_pic;

        const parts = oldImageUrl.split("/").slice(-2).join("/"); 
        const publicId = parts.substring(0, parts.lastIndexOf("."));

        cloudinary.uploader.destroy(publicId, (error, result) => {
          if (error) console.log("Cloudinary delete error:", error);
      
        });
      }

      const sql = "UPDATE users SET profile_pic = ? WHERE id = ?";
      db.query(sql, [profilePicPath, userid], (err) => {
        if (err) {
          console.log(err);

          return res.status(500).json({ error: "Database error" });
        }

        res.json({ profile_pic: profilePicPath });
      });
    });
  }
);

router.get("/followers-count", (req, res) => {
  const userId = req.query.userId;

  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM followers WHERE following_id = ?) AS followers_count,
      (SELECT COUNT(*) FROM followers WHERE follower_id = ?) AS following_count
  `;

  db.query(sql, [userId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0]);
  });
});

router.post("/follow", (req, res) => {
  const { followerId, followingId } = req.body;

  if (followerId === followingId) {
    return res.status(400).json({ error: "You can't follow yourself!" });
  }

  const sql = `INSERT IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)`;

  db.query(sql, [followerId, followingId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Followed successfully!" });
  });
});

router.post("/unfollow", (req, res) => {
  const { followerId, followingId } = req.body;

  const sql = `DELETE FROM followers WHERE follower_id = ? AND following_id = ?`;

  db.query(sql, [followerId, followingId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Unfollowed successfully!" });
  });
});

router.get("/is-following", (req, res) => {
  const { followerId, followingId } = req.query;

  if (!followerId || !followingId) {
    return res
      .status(400)
      .json({ error: "Both followerId and followingId are required" });
  }

  const sql =
    "SELECT * FROM followers WHERE follower_id = ? AND following_id = ?";

  db.query(sql, [followerId, followingId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({ isFollowing: results.length > 0 });
  });
});

router.get("/suggested-users", (req, res) => {
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: "User ID is required" });

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
          AND u.id NOT IN (SELECT following_id FROM UserFollowers) -- Exclude already followed users
        GROUP BY u.id
        ORDER BY mutual_count DESC
        LIMIT 5
    )
    SELECT * FROM Mutuals
    UNION
    SELECT id, username, profile_pic, 0 AS mutual_count FROM users
    WHERE id != ? 
      AND id NOT IN (SELECT following_id FROM UserFollowers)
    ORDER BY RAND()
    LIMIT 5;
  `;

  db.query(sql, [userId, userId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.get("/leaderboard", (req, res) => {
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

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

module.exports = router;
