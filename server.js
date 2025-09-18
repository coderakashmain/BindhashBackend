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
const socketManager = require("./socketHandlers");
const reportsRouter = require("./routes/reportsRoutes");
const feedbackRoutes = require("./routes/authFeedback");

const path = require("path");
const fs = require('fs');
const cookieParser = require("cookie-parser");
const session = require("express-session");

const http = require("http");
const { Server } = require("socket.io");




const webPush = require("web-push");
const app = express();
dotenv.config();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
  origin: (origin, callback) => {
    const allowedOrigins = [
      "https://bindhash.xyz",
      "https://www.bindhash.xyz",
       "https://api.bindhash.xyz",
      "http://localhost:5173",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
});



const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin:
      process.env.MODE === "production"
        ? "https://bindhash.xyz "
        : "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET ,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.MODE === "production" ? true : false,
      httpOnly: true,
      sameSite: "strict",
      maxAge: 1000 * 60 * 60,
    },
  })
);


socketManager(io);
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
app.use("/api/reports", reportsRouter);
app.use("/api/feedback", feedbackRoutes);
app.set("trust proxy", 1);








server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
