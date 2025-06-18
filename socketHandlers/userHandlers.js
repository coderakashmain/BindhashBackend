let onlineUsers = {};
global.onlineUsers = onlineUsers;
const sendOfflineMessagesToUser = require('../helper/sendOfflineMessagesToUser')

module.exports = (io, socket)=> {
  if (!global.onlineUsers) global.onlineUsers = {};


  socket.on("addUser", (userId) => {

    global.onlineUsers[userId] = socket.id;
    // console.log(`User ${userId} added with socket ID ${socket.id}`);
    sendOfflineMessagesToUser(io,userId, socket.id);
    // console.log("Current Online Users:");
    // console.table(global.onlineUsers);
  });


  socket.on("disconnect", () => {
    for (let userId in global.onlineUsers) {
      if (global.onlineUsers[userId] === socket.id) {
        delete global.onlineUsers[userId];
        break;
      }
    }
    io.emit("onlineUsers", Object.keys(global.onlineUsers));
    console.log("User disconnected:", socket.id);

    console.log("Updated Online Users:");
    console.table(global.onlineUsers);
  });
  
};
