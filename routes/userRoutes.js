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

router.get("/userlist", async (req, res) => {
  const { userId } = req.query; // Get logged-in user ID

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const sql = `SELECT u.id, 
    CASE 
        WHEN u.visibility = 'anonymous' THEN 'anonymous'
        ELSE u.username
      END AS username,
      
      CASE 
        WHEN u.visibility = 'anonymous' THEN NULL
        ELSE u.profile_pic
      END AS profile_pic,
       
       u.visibility,
      EXISTS (SELECT 1 FROM followers f WHERE f.follower_id = ? AND f.following_id = u.id) AS isFollowing
    FROM users as u WHERE u.id != ?`;

    const [result] = await db.query(sql, [userId, userId]); // Use promise-based query

    res.json(result); // Return the result array
  } catch (err) {
    console.error("Database query error:", err);
    return res.status(500).json({ error: "Database error" });
  }
});

router.post(
  "/upload-profile",
  profileUpload.single("profile_pic"),
  async (req, res) => {
    const { userid, mainphoto } = req.body;
   

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const profilePicPath = req.file.path;

    try {
      if (mainphoto === "true") {
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
      } else {
        const sqlGetOldImage = "SELECT profileback_pic FROM users WHERE id = ?";
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
        const sqlUpdate = "UPDATE users SET profileback_pic = ? WHERE id = ?";
        await db.query(sqlUpdate, [profilePicPath, userid]);

        res.json({ profileback_pic: profilePicPath });
      }
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

router.get("/followers-list", async (req, res) => {
  const { userId, type } = req.query;

  if (!userId || !type) {
    return res.status(400).json({ error: "User ID and type are required" });
  }

  let sql;
  if (type === "followers") {
    sql = `
      SELECT 
      users.id, 
 
      CASE 
        WHEN users.visibility = 'anonymous' THEN "Anonymous"
        ELSE users.fullname
      END AS fullname,
      
      CASE 
        WHEN users.visibility = 'anonymous' THEN 'anonymous'
        ELSE users.username
      END AS username,
      
      CASE 
        WHEN users.visibility = 'anonymous' THEN NULL
        ELSE users.profile_pic
      END AS profile_pic,
      
      users.visibility
      FROM followers
      JOIN users ON followers.follower_id = users.id
      WHERE followers.following_id = ?`;
  } else if (type === "following") {
    sql = `
      SELECT users.id,
     CASE 
        WHEN users.visibility = 'anonymous' THEN 'Anonymous'
        ELSE users.fullname
      END AS fullname,
      
      CASE 
        WHEN users.visibility = 'anonymous' THEN 'anonymous'
        ELSE users.username
      END AS username,
      
      CASE 
        WHEN users.visibility = 'anonymous' THEN NULL
        ELSE users.profile_pic
      END AS profile_pic,
       
       users.visibility
      FROM followers
      JOIN users ON followers.following_id = users.id
      WHERE followers.follower_id = ?`;
  } else {
    return res.status(400).json({ error: "Invalid type parameter" });
  }

  try {
    const [results] = await db.query(sql, [userId]);
    res.json(results);
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/follow", async (req, res) => {
  const { followerId, followingId } = req.body;

  if (!followerId || !followingId) {
    return res
      .status(400)
      .json({ error: "Both followerId and followingId are required" });
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
    return res
      .status(400)
      .json({ error: "Both followerId and followingId are required" });
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
    return res
      .status(400)
      .json({ error: "Both followerId and followingId are required" });
  }

  const sql =
    "SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ? LIMIT 1";

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
    console.error("User Id is meassing.")
    return res.status(400).json({ error: "User ID is required" });
  }

  const sql = `
 WITH UserFollowers AS (
    SELECT following_id FROM followers WHERE follower_id = ?
),
Mutuals AS (
    SELECT DISTINCT u.id, u.username, u.profile_pic, u.visibility, COUNT(f.follower_id) AS mutual_count
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

SELECT 
  v.id, 
  CASE 
    WHEN v.visibility = 'anonymous' THEN 'Anonymous'
    ELSE v.username
  END AS username,
  CASE 
    WHEN v.visibility = 'anonymous' THEN NULL
    ELSE v.profile_pic
  END AS profile_pic,
  v.visibility,
  0 AS mutual_count
FROM users AS v
WHERE v.id != ?
  AND v.id NOT IN (SELECT following_id FROM UserFollowers)
  AND v.id NOT IN (SELECT id FROM Mutuals)
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
  const { userId } = req.query; // Get user ID (optional)

  // ✅ Query for fetching the top 10 leaderboard with correct ranking
  const leaderboardSQL = `
  WITH RecentPosts AS (
    -- Select posts from the last 7 days
    SELECT id, user_id FROM posts WHERE created_at >= NOW() - INTERVAL 7 DAY
  ),

  Engagement AS (
    SELECT 
      users.id, 
      users.username, 
      users.profile_pic, 
      COALESCE(like_count.total_likes, 0) AS total_likes,
      COALESCE(comment_count.total_comments, 0) AS total_comments,
      COALESCE(share_count.total_shares, 0) AS total_shares,
      COALESCE(followers_count.total_followers, 0) AS total_followers,

  
      (COALESCE(like_count.total_likes, 0) * 1 + 
      COALESCE(comment_count.total_comments, 0) * 2 + 
      COALESCE(share_count.total_shares, 0) * 3 + 
      COALESCE(followers_count.total_followers, 0) * 5) AS engagement_score 

    FROM users

    -- Count Likes (last 7 days)
    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_likes 
      FROM likes 
      JOIN RecentPosts AS posts ON likes.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS like_count ON like_count.user_id = users.id

    -- Count Comments (last 7 days)
    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_comments 
      FROM comments 
      JOIN RecentPosts AS posts ON comments.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS comment_count ON comment_count.user_id = users.id

    -- Count Shares (last 7 days)
    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_shares 
      FROM shares 
      JOIN RecentPosts AS posts ON shares.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS share_count ON share_count.user_id = users.id

    -- Count Followers (all time)
    LEFT JOIN (
      SELECT following_id, COUNT(*) AS total_followers 
      FROM followers 
      GROUP BY following_id
    ) AS followers_count ON followers_count.following_id = users.id
  )

  -- ✅ Assign Rank BEFORE applying LIMIT
  SELECT *,
         RANK() OVER (ORDER BY engagement_score DESC) AS user_rank
  FROM Engagement
  ORDER BY engagement_score DESC
  LIMIT 10;
  `;

  // ✅ Query to fetch the current user's rank, even if they are not in the top 10
  const userRankSQL = `
  WITH RecentPosts AS (
    SELECT id, user_id FROM posts WHERE created_at >= NOW() - INTERVAL 7 DAY
  ),

  Engagement AS (
    SELECT 
      users.id, 
      users.username, 
      users.profile_pic, 
      COALESCE(like_count.total_likes, 0) AS total_likes,
      COALESCE(comment_count.total_comments, 0) AS total_comments,
      COALESCE(share_count.total_shares, 0) AS total_shares,
      COALESCE(followers_count.total_followers, 0) AS total_followers,

      (COALESCE(like_count.total_likes, 0) * 1 + 
      COALESCE(comment_count.total_comments, 0) * 2 + 
      COALESCE(share_count.total_shares, 0) * 3 + 
      COALESCE(followers_count.total_followers, 0) * 5) AS engagement_score 

    FROM users

    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_likes 
      FROM likes 
      JOIN RecentPosts AS posts ON likes.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS like_count ON like_count.user_id = users.id

    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_comments 
      FROM comments 
      JOIN RecentPosts AS posts ON comments.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS comment_count ON comment_count.user_id = users.id

    LEFT JOIN (
      SELECT posts.user_id, COUNT(*) AS total_shares 
      FROM shares 
      JOIN RecentPosts AS posts ON shares.post_id = posts.id 
      GROUP BY posts.user_id
    ) AS share_count ON share_count.user_id = users.id

    LEFT JOIN (
      SELECT following_id, COUNT(*) AS total_followers 
      FROM followers 
      GROUP BY following_id
    ) AS followers_count ON followers_count.following_id = users.id
  )

  -- ✅ Fetch the rank of a specific user
  SELECT *,
         RANK() OVER (ORDER BY engagement_score DESC) AS user_rank
  FROM Engagement
  WHERE id = ?;
  `;

  try {
    // Fetch top 10 leaderboard
    const [leaderboard] = await db.query(leaderboardSQL);

    let userRank = null;
    if (userId) {
      // Fetch current user's rank separately
      const [userResult] = await db.query(userRankSQL, [userId]);
      userRank = userResult.length > 0 ? userResult[0] : null;
    }

    res.json({
      leaderboard,
      userRank,
    });
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

router.get("/tags", async (req, res) => {
  const { user_id } = req.query;
  try {
    const [tags] = await db.query(
      "SELECT tag FROM user_tags WHERE user_id = ?",
      [user_id]
    );
    res.json(tags.map((t) => t.tag));
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/tags", async (req, res) => {
  const { user_id, tags } = req.body;
  try {
    await db.query("DELETE FROM user_tags WHERE user_id = ?", [user_id]);
    if (tags.length > 0) {
      const values = tags.map((tag) => [user_id, tag]);
      await db.query("INSERT INTO user_tags (user_id, tag) VALUES ?", [values]);
    } // Clear old tags

    res.json({ success: true });
  } catch (error) {
    console.error("Error saving tags:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/profiledit/:userId", async (req, res) => {
  const { userId } = req.params;

  const { fullName, username, bio } = req.body; // Destructure fields

  const connection = await db.getConnection(); // Get a DB connection

  try {
    await connection.beginTransaction();

    // Update only changed fields in 'users' table
    if (fullName || username) {
      const fieldsToUpdate = [];
      const values = [];

      if (fullName) {
        fieldsToUpdate.push("fullname = ?");
        values.push(fullName);
      }
      if (username) {
        fieldsToUpdate.push("username = ?");
        values.push(username);
      }

      if (fieldsToUpdate.length > 0) {
        values.push(userId); // Add userId to the query
        const sql = `UPDATE users SET ${fieldsToUpdate.join(
          ", "
        )} WHERE id = ?`;
        await connection.execute(sql, values);
      }
    }

    // Update only changed fields in 'user_bio' table
    if (bio) {
      const fieldsToUpdate = [];
      const values = [];

      Object.entries(bio).forEach(([key, value]) => {
        if (value) {
          fieldsToUpdate.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fieldsToUpdate.length > 0) {
        // Check if bio exists for the user
        const [existingBio] = await connection.execute(
          "SELECT user_id FROM user_bio WHERE user_id = ?",
          [userId]
        );

        if (existingBio.length > 0) {
          // If bio exists, update it
          values.push(userId);
          const sql = `UPDATE user_bio SET ${fieldsToUpdate.join(
            ", "
          )} WHERE user_id = ?`;
          await connection.execute(sql, values);
        } else {
          // If bio does not exist, insert a new row
          const columns = Object.keys(bio).join(", ");
          const placeholders = Object.keys(bio)
            .map(() => "?")
            .join(", ");
          const insertValues = Object.values(bio);

          const sql = `INSERT INTO user_bio (user_id, ${columns}) VALUES (?, ${placeholders})`;
          await connection.execute(sql, [userId, ...insertValues]);
        }
      }
    }

    await connection.commit(); // Commit transaction
    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    await connection.rollback(); // Rollback on failure
    console.error("Update failed:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    connection.release(); // Release connection
  }
});

module.exports = router;
