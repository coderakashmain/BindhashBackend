const db = require("../config/db");

module.exports = (io, socket) => {
  socket.on("modeChange", async ({ userId, mode }) => {
    
    if (!userId || !mode) {
      console.error("Invalid data received in modeChange event:", {
        userId,
        mode,
      });
      return;
    }

    try {
      const query = `
      SELECT users.id AS id, 
  CASE 
    WHEN users.visibility = 'anonymous' THEN 'Anonymous'
    ELSE users.username
  END AS username,
  CASE 
    WHEN users.visibility = 'anonymous' THEN 'null'
    ELSE users.profile_pic
  END AS profile_pic,
  users.visibility AS visibility
FROM users
WHERE users.id = ?;

            `;
           
      const [results] = await db.query(query, [userId]);
      
       io.to(results.id).emit("modeChanged", { results });
    } catch (err) {
      console.error("Error in modeChange handler:", err);
      return;
    }
  });
};
