const db = require("../config/db");

let subroomUsers = {};
let socketToUserMap = {};
let subroomToRoomMap = {}; 

module.exports = (io, socket) => {
  socket.on("new-subroom-user", async ({ userId, subroomId, roomId }) => {
    const previousInfo = socketToUserMap[socket.id];

    if (previousInfo) {
      const { subroomId: oldSubroomId, userId: oldUserId } = previousInfo;

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

    if (!subroomUsers[subroomId]) {
      subroomUsers[subroomId] = [];
    }

    if (!subroomUsers[subroomId].includes(userId)) {
      subroomUsers[subroomId].push(userId);
    }

    socketToUserMap[socket.id] = { userId, subroomId, roomId };
    subroomToRoomMap[subroomId] = roomId;
    socket.join(subroomId);

    const userIds = subroomUsers[subroomId];
    if (userIds.length === 0) return;
    const placeholders = userIds.map(() => "?").join(",");

    try {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS userCount FROM users WHERE id IN (${placeholders})`,
        userIds
      );
 
      const userCount = rows[0]?.userCount || 0;

      io.emit("global-room-user", {
        roomId,
        subroomId,
         count: userCount
      });
 
    } catch (err) {
      console.error("DB error while fetching active subroom users:", err);
    }
  });

  socket.on("get-all-active-users", async () => {
  try {
    const allData = [];
    
    for (const subroomId in subroomUsers) {
      const userIds = subroomUsers[subroomId];
      if (!userIds || userIds.length === 0) continue;
      
      const placeholders = userIds.map(() => "?").join(",");
      const [rows] = await db.query(
        `SELECT COUNT(*) AS userCount FROM users WHERE id IN (${placeholders})`,
        userIds
      );
      
      
  const roomId = subroomToRoomMap[subroomId] || "unknown";


      allData.push({
        roomId,
        subroomId,
        count: rows[0]?.userCount || 0
      });
    }
  

    socket.emit("all-subroom-counts", allData);

  } catch (err) {
    console.error("Error in get-all-active-users:", err);
  }
});





  socket.on("get-subroom-users", async ({ subroomId, roomId }) => {
    try {
      const userIds = subroomUsers[subroomId] || [];
      if (userIds.length === 0) return;

      const placeholders = userIds.map(() => "?").join(",");
      const [rows] = await db.query(
        `SELECT c.id as id,
        CASE
          WHEN c.visibility = 'anonymous' THEN 'anonymous'
          ELSE c.username
        END AS username,
        CASE
          WHEN c.visibility = 'anonymous' THEN 'Anonymous'
          ELSE c.fullname
        END AS fullname,
        CASE
          WHEN c.visibility = 'anonymous' THEN NULL
          ELSE c.profile_pic
        END AS profile_pic,
        
        c.visibility as user_visibility
         
         FROM users as c WHERE id IN (${placeholders})`,
        userIds
      );

      io.to(subroomId).emit("subroom-active-user", {
        roomId,
        subroomId,
        users: rows,
      });
    } catch (error) {
      console.error("Error fetching subroom users:", error);
    }
  });

  socket.on("leave-subroom",async ({ userId, subroomId }) => {
    if (subroomUsers[subroomId]) {
      subroomUsers[subroomId] = subroomUsers[subroomId].filter(
        (id) => id !== userId
      );
      if (subroomUsers[subroomId].length === 0) {
        delete subroomUsers[subroomId];
      }
    }
    
 
    socket.leave(subroomId);
    delete socketToUserMap[socket.id];

    try {
      const allData = [];

      for (const sid in subroomUsers) {
        const userIds = subroomUsers[sid];
        if (!userIds || userIds.length === 0) continue;

        const placeholders = userIds.map(() => "?").join(",");
        const [rows] = await db.query(
          `SELECT COUNT(*) AS userCount FROM users WHERE id IN (${placeholders})`,
          userIds
        );

        const roomId = subroomToRoomMap[sid] || "unknown";

        allData.push({
          roomId,
          subroomId: sid,
          count: rows[0]?.userCount || 0
        });
      }

      io.emit("all-subroom-counts", allData); 
    } catch (err) {
      console.error("Error sending updated counts on disconnect:", err);
    }

  });

  socket.on("disconnect", async () => {
    const userInfo = socketToUserMap[socket.id];
    if (userInfo) {
      const { userId, subroomId } = userInfo;

      if (subroomUsers[subroomId]) {
        subroomUsers[subroomId] = subroomUsers[subroomId].filter(
          (id) => id !== userId
        );
        if (subroomUsers[subroomId].length === 0) {
          delete subroomUsers[subroomId];
        }
      }

      socket.leave(subroomId);
      delete socketToUserMap[socket.id];

      try {
      const allData = [];

      for (const sid in subroomUsers) {
        const userIds = subroomUsers[sid];
        if (!userIds || userIds.length === 0) continue;

        const placeholders = userIds.map(() => "?").join(",");
        const [rows] = await db.query(
          `SELECT COUNT(*) AS userCount FROM users WHERE id IN (${placeholders})`,
          userIds
        );

        const roomId = subroomToRoomMap[sid] || "unknown";

        allData.push({
          roomId,
          subroomId: sid,
          count: rows[0]?.userCount || 0
        });
      }

      io.emit("all-subroom-counts", allData); 
    } catch (err) {
      console.error("Error sending updated counts on disconnect:", err);
    }
    }
  });
};
