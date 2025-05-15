const express = require("express");

const db = require("../config/db");

const router = express.Router();

router.post("/subrandomchat", async (req, res) => {
  const { userId, reportedId, reason, comment } = req.body;


  try {
    const sql =
      "INSERT INTO reports(report_from_id,report_to_id,reason,comment) VALUES (?,?,?,?)";

    const [results] = await db.query(sql, [
      userId,
      reportedId,
      reason,
      comment,
    ]);

    res.json({message : 'Reported Successfully',status : true});
  } catch (err) {
    console.error("Database query error:", err);
      return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
