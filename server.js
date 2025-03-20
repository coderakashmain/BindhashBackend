const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const db = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const authCheckRoutes = require("./routes/authCheckRoutes");
const userRoutes = require('./routes/userRoutes')
const storyRoutes = require('./routes/storyRoutes')
const pollRoutes = require('./routes/pollRoutes')
const authpostFuntionRoutes = require('./routes/authpostFuntionRoutes')
const path = require("path");
const cookieParser = require("cookie-parser");

const http = require("http");
const { Server } = require("socket.io");
const webPush = require("web-push");




const app = express();
dotenv.config();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173", 
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  const chatRoutes = require('./routes/chatRoutes')(io);

  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

app.use(cors()); 
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes(io));
app.use("/api/auth-check", authCheckRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", chatRoutes);
app.use("/api/stories",storyRoutes);
app.use("/api/polls",pollRoutes(io));
app.use("/api/postfuntion",authpostFuntionRoutes);


app.use("/uploads", express.static(path.join(__dirname, "uploads")));



webPush.setVapidDetails(
  "mailto:ab791235@gmail.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function sendWebPushNotification(userId, message) {
  const subscription = userSubscriptions[userId];
  if (!subscription) return;

  const payload = JSON.stringify({
    title: "New Message",
    body: message,
    icon: "/icon.png",
  });

  webPush.sendNotification(subscription, payload).catch(err => console.error(err));
}


let userSubscriptions = {}; // Store subscriptions in memory (use DB for production)

app.post("/subscribe", (req, res) => {
  const { userId, subscription } = req.body;
  userSubscriptions[userId] = subscription;
  res.json({ success: true });
});




global.onlineUsers = {};



io.on("connection", (socket) => {
  socket.on("userConnected", (userId) => {
      if (userId) {
          global.onlineUsers[userId] = socket.id;
      }
  });

  socket.on("new_comment", (comment) => {
    io.emit("new_comment", comment);  // Broadcast to all users
});


socket.on("like_comment", async ({ comment_id }) => {
  const sql = "SELECT COUNT(*) AS like_count FROM comment_likes WHERE comment_id = ?";

  try {
    const [result] = await db.promise().query(sql, [comment_id]);

    const new_likes = result[0].like_count; 

    io.emit("comment_liked", { comment_id, new_likes });
  } catch (error) {
    console.error("Error fetching likes:", error);
  }
});




  socket.on("pin_comment", ({ comment_id,pinned }) => {
    
        io.emit("comment_pinned", { comment_id,pinned });
    });




  socket.on("disconnect", () => {
      Object.keys(global.onlineUsers).forEach((key) => {
          if (global.onlineUsers[key] === socket.id) {
              delete global.onlineUsers[key];
          }
      });
  });


  socket.on("sendMessage", async (data) => {
    const { sender_id, receiver_id, message_id, message } = data;

    

        // Send message to recipient if they are online
        if (onlineUsers[receiver_id]) {
          io.to(onlineUsers[receiver_id]).emit("privateMessage", { message_id, sender_id, receiver_id, message, status: "delivered" });
  
          // Update status to "delivered" in DB
          const updateSql = "UPDATE messages SET status = ? WHERE id = ?";
          db.query(updateSql, ["delivered", message_id]);
          sendWebPushNotification(sender_id,message)
      }

        // Notify sender that the message is sent
        io.to(onlineUsers[sender_id]).emit("messageStatus", { message_id, status: "sent" });
    });



    socket.on("markAsRead", async (data) => {
      const { sender_id, receiver_id } = data;
    
      const sql = `
        UPDATE messages 
        SET status = ? 
        WHERE sender_id = ? 
          AND receiver_id = ? 
          AND status != ?
      `;
    
      try {
        const [result] = await db.promise().query(sql, ["read", sender_id, receiver_id, "read"]);
    
        // Notify sender that messages are read
        if (onlineUsers[sender_id]) {
          io.to(onlineUsers[sender_id]).emit("messageRead", { sender_id, receiver_id });
        }
      } catch (error) {
        console.error("Error updating message status:", error);
      }
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
  });
});







const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 




