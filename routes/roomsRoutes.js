const express = require("express");
const db = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");
const router = express.Router();

module.exports = (io) => {
  router.get("/", verifyToken, async (req, res) => {
    try {
      const sql = `
  SELECT 
    r.id AS room_id,
    r.name AS room_name,
 
    r.description AS room_description,
    rs.id AS subroom_id,
    rs.name AS subroom_name,
   
    rs.description AS subroom_description
  FROM room AS r
  LEFT JOIN subroom AS rs ON r.id = rs.room_id
  ORDER BY r.id, rs.id
`;

      const [results] = await db.query(sql);


      const group = [];

      results.forEach((row) => {
        let existingRoom = group.find((room) => room.room_id === row.room_id);
        if (!existingRoom) {
          existingRoom = {
            room_id: row.room_id,
            room_name: row.room_name,
            room_description: row.room_description,
            subrooms: [],
          };
          group.push(existingRoom);
        }
        if(row.subroom_id) {
          existingRoom.subrooms.push({
            subroom_id: row.subroom_id,
            subroom_name: row.subroom_name,
            subroom_description: row.subroom_description,
          });
        }
  
      
       });
      res.json(group);
    } catch (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database error" });
    }
  });

  //Online Live user user subrooms

//   let subroomuser = {};

//   io.on("new-subroom-user",(userId)=>{
    
//     if(!subroomuser) subroomuser={};

//     subroomuser[userId] = socket.id;
//     console.log(subroomuser);
//     console.log("A user join in subrom",socket.id)
//   })



  return router;
};
