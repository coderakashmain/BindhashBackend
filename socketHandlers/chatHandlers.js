const db = require("../config/db");

module.exports = (io,socket)=>{

    socket.on("sendMessage", async (data) => {
    const { sender_id, receiver_id, id, message } = data;

    if (onlineUsers[receiver_id]) {
      io.to(onlineUsers[receiver_id]).emit("privateMessage", {
        message_id: id,
        sender_id,
        receiver_id,
        message,
        status: "delivered",
      });
      // Update status to "delivered" in DB
      const updateSql = "UPDATE messages SET status = ? WHERE id = ?";
      db.query(updateSql, ["delivered", id]);
      // sendWebPushNotification(sender_id,message)
    }

    // Notify sender that the message is sent
    if (onlineUsers[sender_id]) {
      io.to(onlineUsers[sender_id]).emit("messageStatus", {
        message_id: id,
        status: "sent",
      });
    }
  });



  socket.on("markAsRead", async (data) => {
    const { sender_id, receiver_id } = data;

    const sql = `
        UPDATE messages 
        SET status = 'read'
        WHERE sender_id = ? 
          AND receiver_id = ? 
          AND status != 'read'
      `;

    try {
      const [result] = await db.query(sql, [sender_id, receiver_id]);

      if (onlineUsers[sender_id]) {
        io.to(onlineUsers[sender_id]).emit("messageRead", {
          sender_id,
          receiver_id,
        });
      }
    } catch (error) {
      console.error("Error updating message status:", error);
    }
  });
}