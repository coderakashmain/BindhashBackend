const express = require("express");
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const authMiddleware = require("../middleware/authMiddleware");
const { profileUpload, postUpload } = require("../middleware/multerConfig");


const router = express.Router();





module.exports = (io) => {


router.post("/create", postUpload.single("image"), (req, res) => {
  const { user_id, content } = req.body;
  try {
    let imageUrl = null;

    // Check if file exists (Cloudinary will store the uploaded file here)
    if (req.file && req.file.path) {
      imageUrl = req.file.path; // Cloudinary gives the secure URL
    }

    // Save post details in the database
    const sql =
      "INSERT INTO posts (user_id, content, image, created_at) VALUES (?, ?, ?, NOW())";
    db.query(sql, [user_id, content, imageUrl], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({ message: "Post created successfully!", imageUrl });
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
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
                'comment_likes', comments.likes,
                'comment_created_at', comments.created_at,
                'comment_pinned', comments.pinned,
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





router.post("/comment", async (req, res) => {
  try {
      const { user_id, post_id, comment ,parent_comment_id} = req.body;
    

      const query = `
      INSERT INTO comments (post_id, user_id, comment, parent_comment_id)
      VALUES (?, ?, ?, ?)
      `;


      db.query(query, [post_id, user_id, comment, parent_comment_id  || null ], (err, result) => {
          if (err) {
              console.error(err);
              return res.status(500).json({ error: "Database error" });
          }

          // Get the newly added comment details
          const newComment = {
              comment_id: result.insertId,
              post_id,
              user_id,
              comment_text: comment,
              likes: 0,
              pinned: false,
              parent_comment_id,
              created_at: new Date(),
          };
          
          res.status(201).json(newComment);
      });
  } catch (error) {
    console.error(error)
      res.status(500).json({ error: "Server error" });
  }
});


// router.get("/comments/:post_id", async (req, res) => {
//   try {
//     const { post_id } = req.params;

//     // 1️⃣ Fetch top-level comments (parent_comment_id = NULL)
//     const commentQuery = `
//       SELECT c.*, 
//              u.username AS commenter_username, 
//              u.profile_pic AS commenter_pic
//       FROM comments c
//       JOIN users u ON c.user_id = u.id
//       WHERE c.post_id = ? AND c.parent_comment_id IS NULL
//       ORDER BY c.pinned DESC, c.likes DESC, c.created_at DESC;
//     `;

//     // 2️⃣ Fetch all replies (parent_comment_id IS NOT NULL)
//     const repliesQuery = `
//       SELECT c.*, 
//              u.username AS commenter_username, 
//              u.profile_pic AS commenter_pic
//       FROM comments c
//       JOIN users u ON c.user_id = u.id
//       WHERE c.post_id = ? AND c.parent_comment_id IS NOT NULL
//       ORDER BY c.created_at ASC;
//     `;

//     db.query(commentQuery, [post_id], (err, comments) => {
//       if (err) {
//         console.error("Error fetching comments:", err);
//         return res.status(500).json({ error: "Database error" });
//       }
//       console.log(comments)
//       db.query(repliesQuery, [post_id], (err, replies) => {
//         if (err) {
//           console.error("Error fetching replies:", err);
//           return res.status(500).json({ error: "Database error" });
//         }

//         // Map replies to their respective parent comments
//         const commentMap = new Map();
//         comments.forEach(comment => commentMap.set(comment.id, { ...comment, replies: [] }));

//         replies.forEach(reply => {
//           if (commentMap.has(reply.parent_comment_id)) {
//             commentMap.get(reply.parent_comment_id).replies.push(reply);
//           }
//         });
      
//         res.json(Array.from(commentMap.values())); // Convert map to array and send response
//       });
//     });

//   } catch (error) {
//     console.error("Server error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// });



router.post("/comments/like", async (req, res) => {
  try {
      const { user_id, comment_id } = req.body;
    

      // Check if user already liked the comment
      db.query(
          "SELECT * FROM comment_likes WHERE user_id = ? AND comment_id = ?",
          [user_id, comment_id],
          (err, result) => {
              if (err){
                console.error(err);
                return res.status(500).json({ error: "Database error" });
              }

              if (result.length > 0) {
                  // User already liked, remove the like
                  db.query(
                      "DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?",
                      [user_id, comment_id],
                      (err) => {
                          if (err){
                            console.error(err);
                            return res.status(500).json({ error: "Database error" });
                          }

                          // Decrease like count
                      const results =     db.query(
                              "UPDATE comments SET likes = likes - 1 WHERE id = ?",
                              [comment_id],
                              (err) => {
                                  if (err) {
                                    console.error(err);
                                    return res.status(500).json({ error: "Database error" });
                                  }
                                
                             
                                  res.json({ change: -1 });
                              }
                          );
                      }
                  );
              } else {
                  // User hasn't liked, add like
                  db.query(
                      "INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)",
                      [user_id, comment_id],
                      (err) => {
                          if (err){
                            console.error(err)
                            return res.status(500).json({ error: "Database error" });
                          }

                          // Increase like counts
                          db.query(
                              "UPDATE comments SET likes = likes + 1 WHERE id = ?",
                              [comment_id],
                              (err) => {
                                  if (err) {
                                    console.error(err)
                                    return res.status(500).json({ error: "Database error" });
                                  }
                                  res.json({ change: 1 });
                              }
                          );
                      }
                  );
              }
          }
      );
  } catch (error) {
      res.status(500).json({ error: "Server error" });
  }
});




router.post("/comments/pin", async (req, res) => {
  try {
      const { user_id, post_id, comment_id,pin  } = req.body;

      db.query("SELECT user_id FROM posts WHERE id = ?", [post_id], (err, result) => {
          if (err){
            console.error(err);
            return res.status(500).json({ error: "Database error" });
          }

          if (result.length === 0 || result[0].user_id !== user_id) {
              console.error("NOt authorized to pin comments",err)
              return res.status(403).json({ error: "Not authorized to pin comments" });
          }

          // Toggle pinned status
          db.query(
              "UPDATE comments SET pinned = ?  WHERE id = ?",
              [pin,comment_id],
              (err) => {

                  if (err) {
                    console.error(err)
                    return res.status(500).json({ error: "Database error" });
                  }
           
                
                
                  res.json({ success: true, pinned: pin });
              }
          );
      });
  } catch (error) {
    console.error(error)
      res.status(500).json({ error: "Server error" });
  }
});




router.get("/trending-posts", (req, res) => {
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
    LIMIT 5;
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
  
    res.json(results);
  });
});



return router;
};
