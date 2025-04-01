const express = require("express");
const db = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const { storyUpload } = require("../middleware/multerConfig");

const router = express.Router();

router.post("/create", storyUpload.single("media"), async (req, res) => {
  try {
    console.log("📝 Received Story Data:", req.body);
    console.log("📂 Uploaded File:", req.file);

    const {
      text_content,
      is_anonymous,
      hidden_message,
      max_duration,
      view_privacy,
      allowed_users,
      user_id,
    } = req.body;
    console.log("📂 Uploaded File:", req.file);

    const media_url = req.file?.path ?? null;
    const media_type = req.file?.mimetype?.split("/")[0] ?? null;
    const expires_at = new Date();
    expires_at.setHours(expires_at.getHours() + (parseInt(max_duration) || 24));

    const textContentSafe = text_content?.trim() || null;
    const hiddenMessageSafe = hidden_message?.trim() || null;
    const viewPrivacySafe = view_privacy || "public";
    const isAnonymousSafe = is_anonymous === "true" ? 1 : 0;

    // ✅ Fix `allowed_users` handling
    let allowedUsersSafe = null;

    if (allowed_users) {
      try {
        allowedUsersSafe = JSON.stringify(JSON.parse(allowed_users));
        // console.log(allowedUsersSafe);
      } catch (error) {
        console.error("❌ JSON Parsing Error for allowed_users:", error);
        allowedUsersSafe = null; // Fallback to null if parsing fails
      }
    }

    // console.log("📌 Final Insert Values:", {
    //     user_id,
    //     media_url,
    //     media_type,
    //     textContentSafe,
    //     isAnonymousSafe,
    //     hiddenMessageSafe,
    //     max_duration: max_duration ?? 24,
    //     viewPrivacySafe,
    //     allowedUsersSafe,
    //     expires_at
    // });

    const [result] = await db.execute(
      `INSERT INTO stories (user_id, media_url, media_type, text_content, is_anonymous, hidden_message, max_duration, view_privacy, allowed_users, expires_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        media_url,
        media_type,
        textContentSafe,
        isAnonymousSafe,
        hiddenMessageSafe,
        max_duration ?? 24,
        viewPrivacySafe,
        allowedUsersSafe,
        expires_at,
      ]
    );

    console.log("Story created successfully!");
    res.status(201).json({
      message: "Story created successfully!",
      story_id: result.insertId,
      media_url,
    });
  } catch (error) {
    console.error("❌ Error creating story:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📌 Fetch Stories (Based on User's Privacy Settings)
router.get("/fetch", async (req, res) => {
  const { user_id } = req.query;

  // console.log("Received user_id:", user_id);

  try {
    const query = `SELECT 
    stories.*, 
    users.username, 
    users.profile_pic,
    CASE 
        WHEN MAX(story_views.user_id) IS NOT NULL THEN 1 
        ELSE 0 
    END AS is_seen,
    COALESCE(MAX(user_interaction.score), 0) AS interaction_score,
    COALESCE(MAX(reaction_count.total_reactions), 0) AS total_reactions
FROM stories
JOIN users ON stories.user_id = users.id

-- Get user interaction score
LEFT JOIN (
    SELECT 
        interactions.user_id_2 AS interacted_user,
        SUM(interactions.weight) AS score
    FROM interactions
    WHERE interactions.user_id_1 = ?
    GROUP BY interactions.user_id_2
) AS user_interaction ON stories.user_id = user_interaction.interacted_user

-- Count total reactions per story
LEFT JOIN (
    SELECT 
        story_id, 
        COUNT(*) AS total_reactions
    FROM story_reactions
    GROUP BY story_id
) AS reaction_count ON stories.story_id = reaction_count.story_id

-- Check if the user has seen the story
LEFT JOIN story_views ON stories.story_id = story_views.story_id AND story_views.user_id = ?

WHERE 
    (stories.view_privacy = 'public' OR JSON_CONTAINS(stories.allowed_users, ?, '$'))
    AND stories.expires_at > NOW()

GROUP BY stories.story_id  -- ✅ Ensure unique stories

ORDER BY 
    interaction_score DESC,  
    total_reactions DESC,    
    stories.created_at DESC   

LIMIT 50;`;
    // const allowedUsersParam = JSON.stringify(user_id);
    const [stories] = await db.execute(query, [
      user_id,
      user_id,
      JSON.stringify(user_id),
    ]);

    if (!Array.isArray(stories)) {
      return res.status(500).json({ error: "Unexpected data format" });
    }

    res.status(200).json(stories);
  } catch (error) {
    console.error("Error fetching stories:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


router.post('/mark-seen', async (req, res) => {
  const { userId, storyId } = req.body;

  if (!userId || !storyId) {
      return res.status(400).json({ error: "User ID and Story ID are required." });
  }

  try {
      const query = `
          INSERT INTO story_views (user_id, story_id) 
          VALUES (?, ?) 
          ON DUPLICATE KEY UPDATE viewed_at = NOW();
      `;
      await db.query(query, [userId, storyId]);

      res.json({ success: true, message: "Story marked as seen." });
  } catch (error) {
      console.error("Error marking story as seen:", error);
      res.status(500).json({ error: "Internal server error." });
  }
});

// 📌 React to a Story
router.post("/vote", async (req, res) => {
  const { story_id, option_selected, user_id } = req.body;

  try {
    // Check if user already voted
    const [existingVote] = await db.query(
      "SELECT * FROM story_votes WHERE story_id = ? AND user_id = ?",
      [story_id, user_id]
    );

    if (existingVote.length > 0) {
      return res
        .status(400)
        .json({ error: "You have already voted on this story" });
    }

    // Insert vote
    await db.query(
      "INSERT INTO story_votes (story_id, user_id, option_selected) VALUES (?, ?, ?)",
      [story_id, user_id, option_selected]
    );

    res.status(201).json({ message: "Vote recorded successfully!" });
  } catch (error) {
    console.error("Error voting:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ 2️⃣ Fetch Votes for a Story
router.get("/votes/:story_id", async (req, res) => {
  const { story_id } = req.params;

  try {
    const [votes] = await db.query(
      "SELECT option_selected, COUNT(*) as count FROM story_votes WHERE story_id = ? GROUP BY option_selected",
      [story_id]
    );

    res.status(200).json(votes);
  } catch (error) {
    console.error("Error fetching votes:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ 3️⃣ User Reacts to a Story (Emoji Reaction)
router.post("/react", async (req, res) => {
  const { story_id, emoji, user_id } = req.body;

  try {
    // Check if user already reacted
    const [existingReaction] = await db.query(
      "SELECT * FROM story_reactions WHERE story_id = ? AND user_id = ?",
      [story_id, user_id]
    );

    if (existingReaction.length > 0) {
      // Update reaction if already exists
      await db.query(
        "UPDATE story_reactions SET emoji = ? WHERE story_id = ? AND user_id = ?",
        [emoji, story_id, user_id]
      );
    } else {
      // Insert new reaction
      await db.query(
        "INSERT INTO story_reactions (story_id, user_id, emoji) VALUES (?, ?, ?)",
        [story_id, user_id, emoji]
      );
    }

    res.status(200).json({ message: "Reaction recorded successfully!" });
  } catch (error) {
    console.error("Error reacting:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ 4️⃣ Fetch Reactions for a Story
router.get("/reactions/:story_id", async (req, res) => {
  const { story_id } = req.params;

  try {
    const [reactions] = await db.query(
      "SELECT emoji, COUNT(*) as count FROM story_reactions WHERE story_id = ? GROUP BY emoji",
      [story_id]
    );

    res.status(200).json(reactions);
  } catch (error) {
    console.error("Error fetching reactions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
