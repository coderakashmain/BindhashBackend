const db = require("../config/db");
let messages = [];
let users = [];
let waitingUser = null;

module.exports = (io, socket) => {
  socket.on("global_find_partner", ({ name, avatar, visibility, userId }) => {
    users[socket.id] = { name, avatar, visibility, userId };

    if (waitingUser && waitingUser.id !== socket.id) {
      const roomId = `room-${socket.id}-${waitingUser.id}`;

      socket.join(roomId);
      waitingUser.join(roomId);

      const socketId1 = socket.id;
      const socketId2 = waitingUser.id;

      socket.emit("global_partner_found", { roomId });
      waitingUser.emit("global_partner_found", { roomId });

      io.to(roomId).emit(
        "global_stranger_info",
        {
          id: socketId2,
          name: users[socketId2].name,
          avatar: users[socketId2].avatar,
          visibility: users[socketId2].visibility,
          receiver_id: users[socketId2].userId,
        },
        {
          id: socketId1,
          name: users[socketId1].name,
          avatar: users[socketId1].avatar,
          visibility: users[socketId1].visibility,
          sender_id: users[socketId1].userId,
        }
      );

      waitingUser = null;
    } else {
      waitingUser = socket;
    }
  });

  socket.on("global_send_message-private", ({ roomId, text, name, avatar,userId }) => {
    io.to(roomId).emit("global_receive_message-private", {
      message: text,
      name,
      avatar,
      userId,
      time: new Date(),
    });
  });

  socket.on("global_stranger_left", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach((roomId) => {
      if (roomId.startsWith("room-")) {
        socket.to(roomId).emit("global_stranger_left-user");
        socket.leave(roomId);
      }
    });

    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }
  });

  socket.on("global_typing-private", ({ roomId, name, userId }) => {
    socket.to(roomId).emit("global_user_typing-private", {
      // message: `${name} is typing...`,
      message: ` typing...`,
      userId: userId,
    });
  });
};
