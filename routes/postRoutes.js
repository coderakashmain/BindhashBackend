const express = require("express");
const axios = require("axios");
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  postUpload,
  deleteFromCloudinary,
  getCloudinaryPublicId,
} = require("../middleware/multerConfig");
const { Socket } = require("dgram");

const router = express.Router();

module.exports = (io) => {
  router.post("/create", postUpload.single("media"), async (req, res) => {
    const { user_id, content } = req.body;

    try {
      let mediaType = null;

      if (req.file && req.file.path) {
        mediaUrl = req.file.path; // Cloudinary URL
        mediaType = req.file.mimetype.startsWith("image/") ? "image" : "video";
      }

      const sql =
        "INSERT INTO posts (user_id, content, image,media_type , created_at) VALUES (?, ?, ?,?, NOW())";
      const [results] = await db.query(sql, [
        user_id,
        content,
        mediaUrl,
        mediaType,
      ]);

      res.json({ message: "Post created successfully!", mediaUrl });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/text/createfailpost", verifyToken, async (req, res) => {
    const user_id = req.user.id;
    const { title, description, category, isAnonymous } = req.body;

    const visibility = isAnonymous ? "anonymous" : "public";

    const mediaType = "text";
    const tags = [
      ...new Set(
        (description.match(/#\w+/g) || []).map((tag) => tag.toLowerCase())
      ),
    ];
    const tagString = JSON.stringify(tags);

    try {
      const sql =
        "INSERT INTO posts (user_id, content,media_type ,title,category,visibility,tag, created_at) VALUES (?,?,?,?,?,?,?,NOW())";
      const [results] = await db.query(sql, [
        user_id,
        description,
        mediaType,
        title,
        category,
        visibility,
        tagString,
      ]);

      res.json({ message: "Post created successfully!" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get All Posts
  router.get("/", verifyToken, async (req, res) => {
    const userId = Number(req.query.userId) || 0;
    const limit = parseInt(req.query.limit) || 5;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    try {
      const sql = `
      SELECT * FROM (
          -- Fetch Posts
          SELECT 
              'post' AS type,
              posts.id AS post_id, 
              NULL AS poll_id,
              posts.content, 
              posts.title, 
              posts.category, 
              posts.tag, 
              posts.image, 
              posts.media_type,
              posts.created_at, 
              posts.visibility AS post_visibility,
              CASE WHEN posts.visibility = 'anonymous' THEN 'anonymous' ELSE users.username END AS post_username,
              CASE WHEN posts.visibility = 'anonymous' THEN NULL ELSE users.profile_pic END AS post_user_pic,
              users.id AS post_user_id,
              (SELECT COUNT(*) FROM posts WHERE user_id = users.id) AS post_count,
              IFNULL(like_count.count, 0) AS like_count,
              IF(MAX(user_likes.user_id IS NOT NULL), 1, 0) AS is_liked,
              IF(MAX(user_saves.user_id IS NOT NULL), 1, 0) AS is_saved,
              COALESCE(
                  JSON_ARRAYAGG(
                      CASE 
                          WHEN comments.id IS NOT NULL THEN JSON_OBJECT(
                              'parent_comment_id', comments.parent_comment_id
                          )
                          ELSE JSON_OBJECT()
                      END
                  ), JSON_ARRAY()
              ) AS comments

          FROM posts
          JOIN users ON posts.user_id = users.id
          LEFT JOIN (
              SELECT post_id, COUNT(*) AS count FROM likes GROUP BY post_id
          ) AS like_count ON like_count.post_id = posts.id
          LEFT JOIN likes AS user_likes ON user_likes.post_id = posts.id AND user_likes.user_id = ?
          LEFT JOIN save_posts AS user_saves ON user_saves.post_id = posts.id AND user_saves.user_id = ?
          LEFT JOIN comments ON comments.post_id = posts.id
          LEFT JOIN users AS comment_users ON comments.user_id = comment_users.id
          GROUP BY posts.id, users.id, like_count.count

          UNION ALL

          -- Fetch Polls
          SELECT 
              'poll' AS type,
              NULL AS post_id,
              polls.id AS poll_id, 
              polls.question AS content,
              NULL AS title,           
              NULL AS tag,               
              NULL AS category, 
              polls.visibility AS post_visibility,
              NULL AS image, 
              NULL AS media_type,
              polls.created_at, 
              CASE WHEN polls.visibility = 'anonymous' THEN 'anonymous' ELSE poll_users.username END AS post_username,
              CASE WHEN polls.visibility = 'anonymous' THEN NULL ELSE poll_users.profile_pic END AS post_user_pic,
              poll_users.id AS post_user_id,
              0 AS post_count,
              IFNULL((SELECT COUNT(*) FROM poll_votes WHERE poll_votes.poll_id = polls.id), 0) AS like_count,
              IF(MAX(poll_votes.user_id IS NOT NULL), 1, 0) AS is_liked,
              0 AS is_saved,  -- polls can't be saved, or set to 0 explicitly
              COALESCE(
                  JSON_ARRAYAGG(
                      CASE 
                          WHEN poll_options.id IS NOT NULL THEN JSON_OBJECT(
                              'option_id', poll_options.id,
                              'option_text', poll_options.option_text,
                              'votes', poll_options.votes
                          )
                          ELSE NULL 
                      END
                  ), JSON_ARRAY()
              ) AS comments

          FROM polls
          JOIN users AS poll_users ON polls.user_id = poll_users.id
          LEFT JOIN poll_votes ON poll_votes.poll_id = polls.id AND poll_votes.user_id = ?
          LEFT JOIN poll_options ON poll_options.poll_id = polls.id
          WHERE 
              polls.visibility = 'public' 
              OR (polls.visibility = 'anonymous' AND polls.user_id IN (
                  SELECT following_id FROM followers WHERE follower_id = ?
              ))
          GROUP BY polls.id, poll_users.id
      ) AS combined_results
      ORDER BY (like_count / TIMESTAMPDIFF(MINUTE, created_at, NOW())) DESC
      LIMIT ${limit} OFFSET ${offset};

        `;

      const params = [userId, userId, userId, userId];

      // Debugging - Check if parameters are valid

      if (params.some((param) => param === undefined || param === null)) {
        return res.status(400).json({ error: "Invalid query parameters" });
      }

      const [resultsdata] = await db.execute(sql, params);

      const results = resultsdata.map((item) => {
        if (item.image) {
          const isImage =
            /\.(jpg|jpeg|png|gif)$/i.test(item.image) ||
            item.image.includes("/image/");

          if (!isImage) {
            item.image = null;
          }
        }
        return item;
      });

      res.json(results);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  });

  router.get("/single", verifyToken, async (req, res) => {
    const userId = req.user.id;
    const postId = Number(req.query.postId);

    if (!postId) {
      return res.status(400).json({ error: "Missing postId" });
    }

    try {
      const query = `
      SELECT 
        'post' AS type,
        posts.id AS post_id, 
        posts.content, 
        posts.title, 
        posts.category, 
        posts.tag, 
        posts.image, 
        posts.media_type,
        posts.created_at, 
        posts.visibility AS post_visibility,

        CASE 
          WHEN posts.visibility = 'anonymous' THEN 'anonymous'
          ELSE users.username 
        END AS post_username,

        CASE 
          WHEN posts.visibility = 'anonymous' THEN NULL
          ELSE users.profile_pic 
        END AS post_user_pic,

        users.id AS post_user_id,

        (SELECT COUNT(*) FROM posts WHERE user_id = users.id) AS post_count,

        IFNULL(like_count.count, 0) AS like_count,

        IF(MAX(user_likes.user_id IS NOT NULL), 1, 0) AS is_liked,

        IF(MAX(saved.user_id IS NOT NULL), 1, 0) AS is_saved,

        COALESCE(
          JSON_ARRAYAGG(
            CASE 
              WHEN comments.id IS NOT NULL 
              THEN JSON_OBJECT(
                'comment_id', comments.id,
                'parent_comment_id', comments.parent_comment_id
              ) 
              ELSE JSON_OBJECT()  
            END
          ), JSON_ARRAY()
        ) AS comments

      FROM posts
      JOIN users ON posts.user_id = users.id

      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM likes GROUP BY post_id
      ) AS like_count ON like_count.post_id = posts.id

      LEFT JOIN likes AS user_likes ON user_likes.post_id = posts.id AND user_likes.user_id = ?

      LEFT JOIN save_posts AS saved ON saved.post_id = posts.id AND saved.user_id = ?

      LEFT JOIN comments ON comments.post_id = posts.id

      WHERE posts.id = ?

      GROUP BY posts.id, users.id, like_count.count
    `;

      const [results] = await db.query(query, [userId, userId, postId]);

      if (!results.length) {
        return res.status(404).json({ error: "Post not found" });
      }

      res.json(results[0]);
    } catch (err) {
      console.error("Fetch single post error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/video/stream/:postId", async (req, res) => {
    const { postId } = req.params;
    const range = req.headers.range;

    if (!range) return res.status(416).send("Range header required");

    try {
      const [rows] = await db.query("SELECT image FROM posts WHERE id = ?", [
        postId,
      ]);

      if (!rows.length) return res.status(404).send("Video not found");

      const videoUrl = rows[0].image;

      // Request partial content from Cloudinary
      const cloudinaryResponse = await axios({
        method: "GET",
        url: videoUrl,
        responseType: "stream",
        headers: {
          Range: range,
        },
      });

      res.writeHead(206, {
        "Content-Range": cloudinaryResponse.headers["content-range"],
        "Accept-Ranges": "bytes",
        "Content-Length": cloudinaryResponse.headers["content-length"],
        "Content-Type": "video/mp4",
      });

      cloudinaryResponse.data.pipe(res);
    } catch (err) {
      // console.error("Error streaming video:", err.message);
      res.status(500).send("Internal Server Error");
    }
  });

  router.get("/user/:userId", (req, res) => {
    const { userId } = req.params;
    const sql =
      "SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC";
    db.query(sql, [userId], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    });
  });

  // Like a post
  router.post("/like", verifyToken, async (req, res) => {
    const { user_id, post_id } = req.body;

    try {
      // Check if the user already liked the post
      const checkLikeSQL =
        "SELECT * FROM likes WHERE user_id = ? AND post_id = ?";
      const [results] = await db.query(checkLikeSQL, [user_id, post_id]);

      if (results.length > 0) {
        // Remove like
        const removeLikeSQL =
          "DELETE FROM likes WHERE user_id = ? AND post_id = ?";
        await db.query(removeLikeSQL, [user_id, post_id]);
        return res.json({ liked: false, change: -1 });
      } else {
        // Add like
        const addLikeSQL = "INSERT INTO likes (user_id, post_id) VALUES (?, ?)";
        await db.query(addLikeSQL, [user_id, post_id]);
        return res.json({ liked: true, change: 1 });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.get("/comments/fetch", async (req, res) => {
    try {
      const { post_id } = req.query;

      const sql = `
      SELECT c.id AS comment_id, c.comment, c.likes, c.pinned, c.created_at,c.user_visibility,
             u.id AS commenter_id,
            CASE
              WHEN c.user_visibility = 'anonymous' THEN 'anonymous'
              ELSE u.username
            END AS commenter_username,
            CASE
              WHEN c.user_visibility = 'anonymous' THEN NULL
              ELSE u.profile_pic
            END AS commenter_pic,
             c.parent_comment_id
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.pinned DESC, c.likes DESC, c.created_at DESC;
    `;

      const [rows] = await db.query(sql, [post_id]);

      const commentMap = {};
      rows.forEach((row) => {
        commentMap[row.comment_id] = { ...row, replies: [] };
      });

      const nestedComments = [];
      rows.forEach((row) => {
        if (row.parent_comment_id) {
          const parent = commentMap[row.parent_comment_id];
          if (parent) {
            parent.replies.push(commentMap[row.comment_id]);
          }
        } else {
          nestedComments.push(commentMap[row.comment_id]);
        }
      });

      res.json(nestedComments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.post("/comment/insert", async (req, res) => {
    try {
      const { user_id, post_id, comment, parent_comment_id, user_visibility } =
        req.body;

      const visibility =
        user_visibility === "anonymous" ? "anonymous" : "public";

      const query = `
      INSERT INTO comments (post_id, user_id, comment, parent_comment_id,user_visibility)
      VALUES (?, ?, ?, ?,?)
    `;

      const [result] = await db.query(query, [
        post_id,
        user_id,
        comment,
        parent_comment_id || null,
        visibility,
      ]);

      const newComment = {
        comment_id: result.insertId,
        post_id,
        user_id,
        comment: comment,
        likes: 0,
        pinned: false,
        parent_comment_id,
        user_visibility,
        created_at: new Date(),
      };

      res.status(201).json(newComment);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.post("/comments/like", async (req, res) => {
    try {
      const { user_id, comment_id } = req.body;

      // Check if user already liked the comment
      const [result] = await db.query(
        "SELECT * FROM comment_likes WHERE user_id = ? AND comment_id = ?",
        [user_id, comment_id]
      );

      if (result.length > 0) {
        // User already liked, remove the like
        await db.query(
          "DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?",
          [user_id, comment_id]
        );

        // Decrease like count
        await db.query("UPDATE comments SET likes = likes - 1 WHERE id = ?", [
          comment_id,
        ]);

        return res.json({ change: -1 });
      } else {
        // User hasn't liked, add like
        await db.query(
          "INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)",
          [user_id, comment_id]
        );

        // Increase like count
        await db.query("UPDATE comments SET likes = likes + 1 WHERE id = ?", [
          comment_id,
        ]);

        return res.json({ change: 1 });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.post("/comments/pin", async (req, res) => {
    try {
      const { user_id, post_id, comment_id, pin } = req.body;

      const [result] = await db.query(
        "SELECT user_id FROM posts WHERE id = ?",
        [post_id]
      );

      if (result.length === 0 || result[0].user_id !== user_id) {
        console.error("Not authorized to pin comments");
        return res
          .status(403)
          .json({ error: "Not authorized to pin comments" });
      }

      // Toggle pinned status
      await db.query("UPDATE comments SET pinned = ? WHERE id = ?", [
        pin,
        comment_id,
      ]);

      res.json({ success: true, pinned: pin });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.get("/trending-posts", async (req, res) => {
    try {
      const sql = `
      SELECT posts.id, posts.content, posts.image, posts.created_at, 
            users.username, users.profile_pic, 
            COUNT(likes.id) AS like_count
      FROM posts
      LEFT JOIN likes ON posts.id = likes.post_id
      INNER JOIN users ON posts.user_id = users.id
      WHERE posts.created_at >= NOW() - INTERVAL 7 DAY
      GROUP BY posts.id
      ORDER BY like_count DESC
      LIMIT 10;
    `;

      const [results] = await db.query(sql);

      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/delete/:id/:userid", verifyToken, async (req, res) => {
    const postId = req.params.id;
    const userId = req.params.userid;

    if (parseInt(req.user.id) !== parseInt(userId)) {
      return res.status(401).json({ message: "Unauthorized!" });
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        "SELECT image FROM posts WHERE id = ?",
        [postId]
      );

      if (result.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Post not found" });
      }

      const mediaUrl = result[0].image;

      if (mediaUrl) {
        const { publicId, resourceType } = getCloudinaryPublicId(mediaUrl);

        if (publicId) {
          try {
            await deleteFromCloudinary(publicId, resourceType);
          } catch (err) {
            await connection.rollback();
            console.error(err,'Error deleting post!')
            res.status(500).json({ message: "Error deleting post" });
          }
        }
      }

      await connection.query("DELETE FROM posts WHERE id = ?", [postId]);
      await connection.commit();
      res.status(200).json({ message: "Post and media deleted successfully!" });
    } catch (error) {
      await connection.rollback();
      console.error("Error deleting post:", error);
      res.status(500).json({ message: "Error deleting post" });
    } finally {
      connection.release();
    }
  });

  router.post("/save/:postId", verifyToken, async (req, res) => {
    const postId = parseInt(req.params.postId);
    const userId = parseInt(req.body.userId);

    if (!postId || !userId) {
      return res.status(400).json({ message: "Invalid post or user ID." });
    }

    try {
      // Check if the post is already saved
      const [existing] = await db.query(
        `SELECT id FROM save_posts WHERE user_id = ? AND post_id = ?`,
        [userId, postId]
      );

      if (existing.length > 0) {
        await db.query(
          `DELETE FROM save_posts WHERE user_id = ? AND post_id = ?`,
          [userId, postId]
        );
        return res.status(200).json({ message: "Post unsaved!", saved: false });
      } else {
        await db.query(
          `INSERT INTO save_posts (user_id, post_id) VALUES (?, ?)`,
          [userId, postId]
        );
        return res.status(200).json({ message: "Post saved!", saved: true });
      }
    } catch (err) {
      console.error("Error toggling saved post:", err);
      res.status(500).json({ message: "Failed to toggle saved post." });
    }
  });

  //Fetch User Post

  router.get("/fetchuserpost", async (req, res) => {
    const { userId, limit = 10, offset = 0 } = req.query;

    try {
      const sql = `
      SELECT 
        'post' AS type,
        posts.id AS post_id, 
        NULL AS poll_id,
        posts.content, 
        posts.title, 
        posts.category, 
        posts.tag, 
        posts.image, 
        posts.media_type,
        posts.created_at, 
        posts.visibility AS post_visibility,
        CASE WHEN posts.visibility = 'anonymous' THEN 'anonymous' ELSE users.username END AS post_username,
        CASE WHEN posts.visibility = 'anonymous' THEN NULL ELSE users.profile_pic END AS post_user_pic,
        users.id AS post_user_id,
        (SELECT COUNT(*) FROM posts WHERE user_id = users.id) AS post_count,
        IFNULL(like_count.count, 0) AS like_count,
        IF(MAX(user_likes.user_id IS NOT NULL), 1, 0) AS is_liked,
        IF(MAX(user_saves.user_id IS NOT NULL), 1, 0) AS is_saved,
        COALESCE(
          JSON_ARRAYAGG(
            CASE 
              WHEN comments.id IS NOT NULL THEN JSON_OBJECT(
                'parent_comment_id', comments.parent_comment_id
              )
              ELSE JSON_OBJECT()
            END
          ), JSON_ARRAY()
        ) AS comments

      FROM posts
      JOIN users ON posts.user_id = users.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS count FROM likes GROUP BY post_id
      ) AS like_count ON like_count.post_id = posts.id
      LEFT JOIN likes AS user_likes ON user_likes.post_id = posts.id AND user_likes.user_id = ?
      LEFT JOIN save_posts AS user_saves ON user_saves.post_id = posts.id AND user_saves.user_id = ?
      LEFT JOIN comments ON comments.post_id = posts.id
      LEFT JOIN users AS comment_users ON comments.user_id = comment_users.id

      WHERE posts.user_id = ?
      GROUP BY posts.id, users.id, like_count.count
      ORDER BY (like_count.count / TIMESTAMPDIFF(MINUTE, posts.created_at, NOW())) DESC
      LIMIT ? OFFSET ?;
    `;

      const [rows] = await db.query(sql, [
        userId,
        userId,
        userId,
        parseInt(limit),
        parseInt(offset),
      ]);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
};
