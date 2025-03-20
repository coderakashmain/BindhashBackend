const express = require("express");
const db = require("../config/db"); 

const router = express.Router();


router.put("/edit/:postId", async (req, res) => {
    try {
        const { postId } = req.params;
        const { content } = req.body;

        await db.query("UPDATE posts SET content = ? WHERE post_id = ?", [content, postId]);
        res.json({ success: true, message: "Post updated successfully" });
    } catch (error) {
        console.error("Error editing post:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Delete Post
router.delete("/delete/:postId", async (req, res) => {
    try {
        const { postId } = req.params;

        await db.query("DELETE FROM posts WHERE post_id = ?", [postId]);
        res.json({ success: true, message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Save Post
router.post("/save/:postId", async (req, res) => {
    try {
        const { postId } = req.params;
        const { userId } = req.body;

        await db.query("INSERT INTO saved_posts (user_id, post_id) VALUES (?, ?)", [userId, postId]);
        res.json({ success: true, message: "Post saved successfully" });
    } catch (error) {
        console.error("Error saving post:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Report Post
router.post("/report/:postId", async (req, res) => {
    try {
        const { postId } = req.params;
        const { userId, reason } = req.body;

        await db.query("INSERT INTO reported_posts (user_id, post_id, reason) VALUES (?, ?, ?)", [userId, postId, reason]);
        res.json({ success: true, message: "Post reported successfully" });
    } catch (error) {
        console.error("Error reporting post:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


module.exports = router;