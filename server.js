const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const db = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const authCheckRoutes = require("./routes/authCheckRoutes");
const userRoutes = require('./routes/userRoutes')
const chatRoutes = require('./routes/chatRoutes')
const path = require("path");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");



dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173", 
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/auth-check", authCheckRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", chatRoutes);


app.use("/uploads", express.static(path.join(__dirname, "uploads")));

let onlineUsers = {}; // Store online users with socket IDs

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userData) => {
    onlineUsers[userData.userId] = socket.id;
    io.emit("onlineUsers", Object.keys(onlineUsers));
  });

  socket.on("sendMessage", (msgData) => {
    const { sender_id, receiver_id, message } = msgData;
    const receiverSocket = onlineUsers[receiver_id];

    // Store in database
    // const sql = "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
    // db.query(sql, [sender_id, receiver_id, message], (err) => {
    //   if (err) console.error("Database error:", err);
    // });

    // Send message in real-time if the receiver is online
    if (receiverSocket) {
      io.to(receiverSocket).emit("privateMessage", msgData);
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




