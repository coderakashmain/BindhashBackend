const express = require("express");
const db = require("../config/db");
const { pollUpload } = require("../middleware/multerConfig");
const authMiddleware = require('../middleware/authMiddleware')

const router = express.Router();

module.exports = (io) => {
  router.post(
    "/creation",
    pollUpload.array("option_images", 5),
    async (req, res) => {
      const { user_id, question, options, visibility } = req.body;
      const optionImages = req.files.map((file) => file.path);

      if (!user_id || !question || options.length < 2) {
        return res.json({ success: false, message: "Invalid data" });
      }

      const parsedOptions = JSON.parse(options);

      try {
        // Insert into `posts`
        // const [postResult] = await db.query(
        //   "INSERT INTO posts (user_id, content, visibility) VALUES (?, ?, ?)",
        //   [user_id, question, visibility]
        // );

        // const postId = postResult.insertId;

        // Insert into `polls`
        const [pollResult] = await db.query(
          "INSERT INTO polls (user_id,question,visibility) VALUES (?,?,?)",
          [user_id,question,visibility]
        );

        const pollId = pollResult.insertId;

        // Insert poll options
        const optionQuery =
          "INSERT INTO poll_options (poll_id, option_text, option_image) VALUES ?";
        const optionValues = parsedOptions.map((opt, index) => [
          pollId,
          opt,
          optionImages[index] || null,
        ]);

        await db.query(optionQuery, [optionValues]);

        res.json({ success: true, message: "Poll created successfully!" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err });
      }
    }
  );

  // Fetch Polls API
  router.get("/:user_id",authMiddleware, async (req, res) => {
    if (!req.user) {
      console.log("User not found in middleware.");
      return res.status(401).json({ authenticated: false, message: "No token found" });
    }
    const user_id = req.params.user_id;
    console.log(user_id)

    try {
      console.log("user user_id:", user_id);

   

      if (!user_id) {
        return res.status(400).json({ error: "User ID is required." });
      }

      // Fetch poll data
      const query = `
      SELECT 
          p.id AS poll_id, p.question, p.comments, p.views, p.user_id, p.visibility, p.created_at,   
          po.id AS option_id, po.option_text, po.option_image, po.votes, 
          u.username, u.profile_pic, u.id,
          
          -- Total votes from poll_votes table
          (SELECT COUNT(DISTINCT user_id) FROM poll_votes WHERE poll_id = p.id) AS total_votes,
    
          -- Total likes from poll_likes table
          (SELECT COUNT(*) FROM poll_likes WHERE poll_id = p.id) AS total_likes,
    
          -- Total views from poll_views table
          (SELECT COUNT(*) FROM poll_views WHERE poll_id = p.id) AS total_views,
    
          -- Check if the current user has voted
          (SELECT option_id FROM poll_votes WHERE poll_id = p.id AND user_id = ? LIMIT 1) AS user_voted_option,

           (SELECT user_id FROM poll_votes WHERE poll_id = p.id AND user_id = ? LIMIT 1) AS voter_user_id,
    
          -- Check if the current user has liked the poll
          EXISTS(SELECT 1 FROM poll_likes WHERE poll_id = p.id AND user_id = ?) AS user_has_liked
          
      FROM polls p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN poll_options po ON p.id = po.poll_id
      WHERE 
          p.visibility = 'public' 
          OR (p.visibility = 'followers' AND p.user_id IN (
              SELECT following_id  FROM followers WHERE follower_id  = ?
          ))
      ORDER BY p.created_at DESC
    `;

      const [polls] = await db.query(query, [user_id,user_id,user_id,user_id]);

      if (!Array.isArray(polls)) {
        throw new Error("Fetched polls data is not an array.");
      }

      // Structure the data properly
      const pollMap = new Map();

      polls.forEach((row) => {
        if (!pollMap.has(row.poll_id)) {
          pollMap.set(row.poll_id, {
            poll_id: row.poll_id,
            question: row.question,
            created_at: row.created_at,
            posted_by: {
              username: row.username,
              profile_pic: row.profile_pic,
              user_id: row.id,
            },
            comments: row.comments,
            likes :row.total_likes || 0,
            views: row.views || 0, // Updated to fetch total views
            total_votes: row.total_votes || 0,
            voter_user_id: row.voter_user_id ,
            user_voted_option: row.user_voted_option, 
            user_has_liked: Boolean(row.user_has_liked),
            options: [],
          });
        }
        if (row.option_id) {
          pollMap.get(row.poll_id).options.push({
            option_id: row.option_id,
            text: row.option_text,
            image: row.option_image,
            votes: row.votes,
            percentage:
              row.total_votes > 0
                ? ((row.votes / row.total_votes) * 100).toFixed(2)
                : 0,
                user_voted: row.option_id === row.user_voted_option, 
          });
        }
      });

    
      res.json([...pollMap.values()]);
    } catch (error) {
      console.error("Error fetching polls:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vote on Poll
  router.post("/like/:poll_id", async (req, res) => {
  
    try {
      const { poll_id } = req.params;
      const { user_id } = req.body;


      const [existingLike] = await db.query(
        "SELECT * FROM poll_likes WHERE user_id = ? AND poll_id = ?",
        [user_id, poll_id]
      );

      if (existingLike.length > 0) {
     
        await db.query(
          "DELETE FROM poll_likes WHERE user_id = ? AND poll_id = ?",
          [user_id, poll_id]
        );
        await db.query("UPDATE polls SET likes = likes - 1 WHERE id = ?", [
          poll_id,
        ]);
        

        io.emit("poll_update", { poll_id, type: "like", user_id, decrement: true });

        return res.json({ success: true, message: "Like removed" });
      } else {
        // Like if not already liked
        await db.query(
          "INSERT INTO poll_likes (user_id, poll_id) VALUES (?, ?)",
          [user_id, poll_id]
        );
        await db.query("UPDATE polls SET likes = likes + 1 WHERE id = ?", [
          poll_id,
        ]);
    
        io.emit("poll_update", { poll_id, type: "like", user_id, decrement: false });

        return res.json({ success: true, message: "Poll liked" });
      }
    } catch (error) {
      console.error("Error liking poll:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post("/vote/:option_id", async (req, res) => {
    try {
      const { option_id } = req.params;
      const { user_id, poll_id } = req.body;
      const poll_option_id = parseInt(option_id)

     
      // Check if user already voted in this poll
      const [existingVote] = await db.query(
        "SELECT * FROM poll_votes WHERE user_id = ? AND poll_id = ?",
        [user_id, poll_id]
      );

      if (existingVote.length > 0) {
        const previousOptionId = existingVote[0].option_id;

        if (previousOptionId === parseInt(option_id)) {
          // If user clicks the same option, remove their vote
          await db.query(
            "DELETE FROM poll_votes WHERE user_id = ? AND poll_id = ?",
            [user_id, poll_id]
          );
          await db.query(
            "UPDATE poll_options SET votes = votes - 1 WHERE id = ?",
            [option_id]
          );
          
         
     
          io.emit("poll_update", {
            poll_id,
            user_id,
            poll_option_id,
            type: "vote",
            decrement: true,
          });

          return res.json({ success: true, message: "Vote removed" });
        } else {
          // If user selects a different option, transfer the vote
          await db.query(
            "UPDATE poll_options SET votes = votes - 1 WHERE id = ?",
            [previousOptionId]
          );
          await db.query(
            "UPDATE poll_options SET votes = votes + 1 WHERE id = ?",
            [option_id]
          );
          await db.query(
            "UPDATE poll_votes SET option_id = ? WHERE user_id = ? AND poll_id = ?",
            [option_id, user_id, poll_id]
          );

          io.emit("poll_update", {
            poll_id,
            user_id,
            poll_option_id,
            type: "vote_transfer",
            previousOptionId,
          });

          return res.json({ success: true, message: "Vote changed" });
        }
      } else {
        // If user has not voted before, insert a new vote
        await db.query(
          "INSERT INTO poll_votes (user_id, poll_id, option_id) VALUES (?, ?, ?)",
          [user_id, poll_id, option_id]
        );
        await db.query(
          "UPDATE poll_options SET votes = votes + 1 WHERE id = ?",
          [option_id]
        );

        io.emit("poll_update", { poll_id,user_id, poll_option_id, type: "vote" });

        return res.json({ success: true, message: "Vote submitted" });
      }
    } catch (error) {
      console.error("Error voting:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post("/comment/:poll_id", async (req, res) => {
    try {
      const { poll_id } = req.params;
      const { comment, user_id } = req.body;
      await db.query(
        "INSERT INTO poll_comments (poll_id, user_id, comment) VALUES (?, ?, ?)",
        [poll_id, user_id, comment]
      );
      await db.query("UPDATE polls SET comments = comments + 1 WHERE id = ?", [
        poll_id,
      ]);

      // Emit real-time update
      io.emit("poll_update", { poll_id, type: "comment" });

      res.json({ success: true });
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post("/view/:poll_id", async (req, res) => {
    try {
        const { poll_id } = req.params;
        const { user_id } = req.body; 



        const [existingView] = await db.query("SELECT * FROM poll_views WHERE poll_id = ? AND user_id = ?", [poll_id, user_id]);

          
        if (existingView.length === 0) {
         
         const [results] =   await db.query("INSERT INTO poll_views (poll_id, user_id) VALUES (?, ?)", [poll_id, user_id]);
      
         await db.query("UPDATE polls SET views = views + 1 WHERE id = ?", [poll_id]);

    
            io.emit("poll_update", { poll_id, type: "view" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error updating views:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


  return router;
};
