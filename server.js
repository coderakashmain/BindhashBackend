const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const db = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const authCheckRoutes = require("./routes/authCheckRoutes");
const userRoutes = require("./routes/userRoutes");
const storyRoutes = require("./routes/storyRoutes");
const pollRoutes = require("./routes/pollRoutes");
const chatRoutes = require("./routes/chatRoutes");
const roomsRoutes = require("./routes/roomsRoutes");
const authpostFuntionRoutes = require("./routes/authpostFuntionRoutes");
const socketManager = require("./socketHandlers")
const reportsRouter = require('./routes/reportsRoutes');
const feedbackRoutes = require('./routes/authFeedback');

const path = require("path");
const cookieParser = require("cookie-parser");

const http = require("http");
const { Server } = require("socket.io");
const webPush = require("web-push");

const app = express();
dotenv.config();
const server = http.createServer(app);
const io = new Server(server, {
   pingInterval: 10000,
   pingTimeout: 5000, 
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoutes(io));
app.use("/api/posts", postRoutes(io));
app.use("/api/auth-check", authCheckRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", chatRoutes(io));
app.use("/api/room", roomsRoutes(io));
app.use("/api/stories", storyRoutes);
app.use("/api/polls", pollRoutes(io));
app.use("/api/postfuntion", authpostFuntionRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/reports",reportsRouter);
app.use("/api/feedback",feedbackRoutes);
socketManager(io);


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

  webPush
    .sendNotification(subscription, payload)
    .catch((err) => console.error(err));
}

let userSubscriptions = {}; // Store subscriptions in memory (use DB for production)

app.post("/subscribe", (req, res) => {
  const { userId, subscription } = req.body;
  userSubscriptions[userId] = subscription;
  res.json({ success: true });
});



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
