const db = require("../config/db");
let users = {};           
let waitingUsers = {};       

module.exports = (io, socket) => {

  
  socket.on("random_find_partner", ({ name, avatar, subroomId, userId }) => {
    users[socket.id] = { name, avatar, userId };
    socket.data.subroomId = subroomId;
    socket.data.userId = userId;

    const partner = waitingUsers[subroomId];


    if (
      partner &&
      (partner.id === socket.id ||
        partner.disconnected ||
        !io.sockets.sockets.get(partner.id))
    ) {
      waitingUsers[subroomId] = null;
    }

    if (waitingUsers[subroomId]) {
      const roomId = `room-${socket.id}-${partner.id}`;
      socket.join(roomId);
      partner.join(roomId);

      socket.data.roomId = roomId;
      partner.data.roomId = roomId;

      const you = users[socket.id];
      const them = users[partner.id];

      socket.emit("random_partner_found", {
        roomId,
        partner: { id: them.userId, name: them.name, avatar: them.avatar }
      });

      partner.emit("random_partner_found", {
        roomId,
        partner: { id: you.userId, name: you.name, avatar: you.avatar }
      });

      io.to(roomId).emit(
        "random_stranger_info",
        { id: them.userId, name: them.name, avatar: them.avatar },
        { id: you.userId, name: you.name, avatar: you.avatar }
      );

      waitingUsers[subroomId] = null;
    } else {
      waitingUsers[subroomId] = socket;
    }
  });


  socket.on("random_send_message-private", ({ roomId, message }) => {
    const { name, avatar, userId } = users[socket.id];
    io.to(roomId).emit("random_receive_message-private", {
      message,
      name,
      avatar,
      userId,
      time: new Date(),
    });
  });

  socket.on("random_stranger_left", () => {
    const roomId = socket.data.roomId;

    if (roomId) {
      socket.to(roomId).emit("random_stranger_left", { userId: socket.data.userId });
      socket.leave(roomId);
    }

    const subroomId = socket.data.subroomId;
    if (waitingUsers[subroomId]?.id === socket.id) {
      waitingUsers[subroomId] = null;
    }

  
    delete socket.data.roomId;
  });




  
  socket.on("random_typing-private", () => {
    const roomId = socket.data.roomId;
    const { name, userId } = users[socket.id];
    if (roomId) {
      socket.to(roomId).emit("random_user_typing-private", {
        message: `${name} is typing…`,
        userId,
      });
    }
  });

 
  socket.on("disconnect", (reason) => {
    // console.log("User disconnected:", socket.id, reason);

    const roomId = socket.data.roomId;

  
    if (roomId) {
        
      socket.to(roomId).emit("random_stranger_left", { userId: socket.data.userId });
      socket.leave(roomId);
    }

    const subroomId = socket.data.subroomId;
    if (waitingUsers[subroomId]?.id === socket.id) {
      waitingUsers[subroomId] = null;
    }

    delete users[socket.id];
  });
};
