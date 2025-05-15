const db = require("../config/db");

let subroomUsers = {};         // { subroomId: [userId, ...] }
let socketToUserMap = {};      // { socket.id: { userId, subroomId } }

module.exports = (io, socket) => {
  socket.on("new-subroom-user", ({ userId, subroomId }) => {
    const previousInfo = socketToUserMap[socket.id];

    // If the socket was previously in another subroom
    if (previousInfo) {
      const { subroomId: oldSubroomId, userId: oldUserId } = previousInfo;

      // Leave previous room
      socket.leave(oldSubroomId);

      if (subroomUsers[oldSubroomId]) {
        subroomUsers[oldSubroomId] = subroomUsers[oldSubroomId].filter(
          (id) => id !== oldUserId
        );
        if (subroomUsers[oldSubroomId].length === 0) {
          delete subroomUsers[oldSubroomId];
        }
      }
    }

    // Ensure the subroom entry exists
    if (!subroomUsers[subroomId]) {
      subroomUsers[subroomId] = [];
    }

    // Add user if not already present
    if (!subroomUsers[subroomId].includes(userId)) {
      subroomUsers[subroomId].push(userId);
    }

    socketToUserMap[socket.id] = { userId, subroomId };
    socket.join(subroomId);
  });

  socket.on("get-subroom-users", async (subroomId) => {
    try {
      const userIds = subroomUsers[subroomId] || [];
      if (userIds.length === 0) return;

      const placeholders = userIds.map(() => "?").join(",");
      const [rows] = await db.query(
        `SELECT id, username, fullname, profile_pic FROM users WHERE id IN (${placeholders})`,
        userIds
      );

      io.to(subroomId).emit("subroom-active-user", {
        subroomId,
        users: rows,
      });
    } catch (error) {
      console.error("Error fetching subroom users:", error);
    }
  });

  socket.on("leave-subroom", ({ userId, subroomId }) => {
    if (subroomUsers[subroomId]) {
      subroomUsers[subroomId] = subroomUsers[subroomId].filter((id) => id !== userId);
      if (subroomUsers[subroomId].length === 0) {
        delete subroomUsers[subroomId];
      }
    }

    socket.leave(subroomId);
    delete socketToUserMap[socket.id];
  });

  socket.on("disconnect", () => {
    const userInfo = socketToUserMap[socket.id];
    if (userInfo) {
      const { userId, subroomId } = userInfo;

      if (subroomUsers[subroomId]) {
        subroomUsers[subroomId] = subroomUsers[subroomId].filter((id) => id !== userId);
        if (subroomUsers[subroomId].length === 0) {
          delete subroomUsers[subroomId];
        }
      }

      socket.leave(subroomId);
      delete socketToUserMap[socket.id];
    }
  });
};
