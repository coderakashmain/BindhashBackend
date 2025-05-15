const db = require("../config/db");

module.exports = (io, socket) => {
  socket.on("new_comment", (comment) => {
    io.emit("new_comment", comment);
  });

  socket.on("like_comment", async ({ comment_id }) => {
    const sql =
      "SELECT COUNT(*) AS like_count FROM comment_likes WHERE comment_id = ?";

    try {
      const [result] = await db.query(sql, [comment_id]);

      const new_likes = result[0].like_count;

      io.emit("comment_liked", { comment_id, new_likes });
    } catch (error) {
      console.error("Error fetching likes:", error);
    }
  });


  
  socket.on("pin_comment", ({ comment_id, pinned }) => {
    io.emit("comment_pinned", { comment_id, pinned });
  });

  

};
