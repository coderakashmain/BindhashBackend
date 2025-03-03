const express = require("express");
const db = require("../config/db");
const multer = require("multer");
const path = require("path");


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



  const sql = "SELECT id, username FROM users WHERE id != ?";
  db.query(sql, [userId], (err, result) => {
    if (err) {
        
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});
router.get("/chat", (req, res) => {
  const { userId } = req.query; // Get logged-in user ID



  const sql = "SELECT id, username FROM users WHERE id = ?";
  db.query(sql, [userId], (err, result) => {
    if (err) {
        
      return res.status(500).json({ error: "Database error" });
    }
    res.json(result);
  });
});



router.post("/upload-profile", upload.single("profile_pic"), (req, res) => {
  const {userid} = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  
  const profilePicPath = `/uploads/profile_pics/${req.file.filename}`;


  // Update profile pic in database (Assume MySQL)
  const sql = "UPDATE users SET profile_pic = ? WHERE id = ?";
  db.query(sql, [profilePicPath, userid], (err) => {
    if (err) {
      console.log(err)
      
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json({ profile_pic: profilePicPath });
  });
});

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

module.exports = router;
