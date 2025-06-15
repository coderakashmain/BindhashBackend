const express = require("express");
const {verifyToken} = require('../middleware/authMiddleware')

require("dotenv").config();
const db = require("../config/db");
const router = express.Router();




router.post("/",verifyToken, async (req, res) => {
  const { type, feedback, rating, user } = req.body;
  const userid = req.user.id;
  if (!type || !feedback || rating == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }
try{
      const query = 'insert into feedbacks (user_id,message,rating,feedback_type,user_name)  values (?,?,?,?,?)'

      const [results] =  await db.query(query,[userid,feedback,rating,type,user]);
      
      res.status(200).json({ message: "Feedback received" });
}
catch(error){
    console.error("database erro",error)
   return res.status(500).json({error : 'database error'})
}


});



module.exports = router;