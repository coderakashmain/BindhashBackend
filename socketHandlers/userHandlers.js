let onlineUsers = {};
global.onlineUsers = onlineUsers;

module.exports = (io, socket)=> {


  socket.on("addUser", (userId) => {
    if (!global.onlineUsers) global.onlineUsers = {};

    global.onlineUsers[userId] = socket.id;
    // console.log(`User ${userId} added with socket ID ${socket.id}`);

    // console.log("Current Online Users:");
    // console.table(global.onlineUsers);
  });


  socket.on("disconnect", () => {
    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) {
        delete onlineUsers[userId];
        break;
      }
    }
    io.emit("onlineUsers", Object.keys(onlineUsers));
    console.log("User disconnected:", socket.id);

    console.log("Updated Online Users:");
    console.table(global.onlineUsers);
  });
  
};
