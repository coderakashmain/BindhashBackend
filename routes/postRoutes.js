const express = require("express");
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Create Post
router.post("/create", upload.single("image"), (req, res) => {
  const { user_id, content } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const sql =
    "INSERT INTO posts (user_id, content, image, created_at) VALUES (?, ?, ?, NOW())";
  db.query(sql, [user_id, content, imagePath], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Post created successfully!" });
  });
});

// Get All Posts
router.get("/", (req, res) => {
  const userId = req.query.userId || 0; 


  const sql = `
   SELECT 
    posts.id AS post_id, 
    posts.content, 
    posts.image, 
    posts.created_at, 
    users.username AS post_username, 
    users.profile_pic AS post_user_pic, 
    users.id AS post_user_id,

    -- Get total posts by the user
      (SELECT COUNT(*) FROM posts WHERE user_id = users.id) AS post_count,

    -- Like count (ensuring posts without likes show 0)
    IFNULL(like_count.count, 0) AS like_count,  

        -- Check if the logged-in user has liked this post
    CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END AS is_liked,

    -- Fetching comments as JSON array (avoids duplicate posts)
    IFNULL(
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'comment_id', comments.id,
                'comment_text', comments.comment,
                'commenter_id', comment_users.id,
                'commenter_username', comment_users.username,
                'commenter_pic', comment_users.profile_pic
            )
        ),
        JSON_ARRAY()
    ) AS comments

FROM posts
JOIN users ON posts.user_id = users.id

-- Left Join for Like Count
LEFT JOIN (
    SELECT post_id, COUNT(*) AS count FROM likes GROUP BY post_id
) AS like_count ON like_count.post_id = posts.id

-- Left Join for Checking If User Liked This Post
LEFT JOIN likes AS user_likes ON user_likes.post_id = posts.id AND user_likes.user_id = ?

-- Left Join for Comments
LEFT JOIN comments ON comments.post_id = posts.id
LEFT JOIN users AS comment_users ON comments.user_id = comment_users.id

GROUP BY posts.id, users.id, like_count.count, is_liked

ORDER BY posts.created_at DESC;

  `;
  db.query(sql,[userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.get("/user/:userId", (req, res) => {
  const { userId } = req.params;
  const sql = "SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC";
  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Like a post
router.post("/like", authMiddleware, (req, res) => {
  const { user_id, post_id } = req.body;


  // Check if the user already liked the post
  const checkLikeSQL = "SELECT * FROM likes WHERE user_id = ? AND post_id = ?";
  db.query(checkLikeSQL, [user_id, post_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length > 0) {
      
      const removeLikeSQL = `DELETE FROM likes WHERE user_id = ? AND post_id = ?`;
      db.query(removeLikeSQL, [user_id, post_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        return res.json({ liked: false, change: -1 }); 
      });
    } else {
      
      const addLikeSQL = `INSERT INTO likes (user_id, post_id) VALUES (?, ?)`;
      db.query(addLikeSQL, [user_id, post_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        return res.json({ liked: true, change: 1 }); 
      });
    }
  });
});




// Get comments for a post
router.post("/comment", (req, res) => {
  const { user_id, post_id, comment } = req.body;
  
  const sql = `INSERT INTO comments (user_id, post_id, comment) VALUES (?, ?, ?)`;

  db.query(sql, [user_id, post_id, comment], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });


    db.query(
      ` SELECT comments.id AS comment_id, comments.comment AS comment_text, comments.created_at,
             users.id AS commenter_id, users.username AS commenter_username, users.profile_pic AS commenter_pic
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.id = ?`,
      [result.insertId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows[0]); 
      }
    );
  });
});








module.exports = router;
