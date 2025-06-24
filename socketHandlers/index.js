const handleUserEvents = require('./chatHandlers');
const handleCommentEvents = require('./commentHandlers');
const handleChatEvents = require('./userHandlers');
const handleRoomEvents = require('./roomHandlers')
const handleRandomChatEvents = require('./randomChatHandlers')
const handleModeChangeEvents = require('./modeChangeHandlers')

module.exports =(io)=> {
    io.on('connection',(socket)=>{
        // console.log('A user connected',socket.id);

        handleChatEvents(io,socket);
        handleCommentEvents(io,socket);
        handleUserEvents(io,socket);
        handleRoomEvents(io,socket);
        handleRandomChatEvents(io,socket);
        handleModeChangeEvents(io,socket);


        socket.on('disconnect', ()=>{
            //  console.log("User disconnected:", socket.id);
        })
    })

}



// global.onlineUsers = {};

// io.on("connection", (socket) => {
//   console.log("A user connected:", socket.id);

//   socket.on("addUser", (userId) => {
//     if (!global.onlineUsers) global.onlineUsers = {};

//     global.onlineUsers[userId] = socket.id;
//     console.log(`User ${userId} added with socket ID ${socket.id}`);

//     console.log("Current Online Users:");
//     console.table(global.onlineUsers);
//   });

//   socket.on("new_comment", (comment) => {
//     io.emit("new_comment", comment);
//   });

//   socket.on("like_comment", async ({ comment_id }) => {
//     const sql =
//       "SELECT COUNT(*) AS like_count FROM comment_likes WHERE comment_id = ?";

//     try {
//       const [result] = await db.query(sql, [comment_id]);

//       const new_likes = result[0].like_count;

//       io.emit("comment_liked", { comment_id, new_likes });
//     } catch (error) {
//       console.error("Error fetching likes:", error);
//     }
//   });

//   socket.on("pin_comment", ({ comment_id, pinned }) => {
//     io.emit("comment_pinned", { comment_id, pinned });
//   });

//   socket.on("sendMessage", async (data) => {
//     const { sender_id, receiver_id, id, message } = data;

//     if (onlineUsers[receiver_id]) {
//       io.to(onlineUsers[receiver_id]).emit("privateMessage", {
//         message_id: id,
//         sender_id,
//         receiver_id,
//         message,
//         status: "delivered",
//       });
//       // Update status to "delivered" in DB
//       const updateSql = "UPDATE messages SET status = ? WHERE id = ?";
//       db.query(updateSql, ["delivered", id]);
//       // sendWebPushNotification(sender_id,message)
//     }

//     // Notify sender that the message is sent
//     if (onlineUsers[sender_id]) {
//       io.to(onlineUsers[sender_id]).emit("messageStatus", {
//         message_id: id,
//         status: "sent",
//       });
//     }
//   });

//   socket.on("markAsRead", async (data) => {
//     const { sender_id, receiver_id } = data;

//     const sql = `
//         UPDATE messages 
//         SET status = 'read'
//         WHERE sender_id = ? 
//           AND receiver_id = ? 
//           AND status != 'read'
//       `;

//     try {
//       const [result] = await db.query(sql, [sender_id, receiver_id]);

//       if (onlineUsers[sender_id]) {
//         io.to(onlineUsers[sender_id]).emit("messageRead", {
//           sender_id,
//           receiver_id,
//         });
//       }
//     } catch (error) {
//       console.error("Error updating message status:", error);
//     }
//   });

//   socket.on("disconnect", () => {
//     for (let userId in onlineUsers) {
//       if (onlineUsers[userId] === socket.id) {
//         delete onlineUsers[userId];
//         break;
//       }
//     }
//     io.emit("onlineUsers", Object.keys(onlineUsers));
//     console.log("User disconnected:", socket.id);

//     console.log("Updated Online Users:");
//     console.table(global.onlineUsers);
//   });
// });