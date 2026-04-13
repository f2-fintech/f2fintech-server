/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const session = require("express-session");
const path = require("path");
const dotenv = require('dotenv');

const config = require("./config");
const rateLimiter = require("./utility/rateLimiter");
const v1Routes = require("./v1/routes");
const { passport } = require("./config/passportConfig");
const { connectToMysql } = require("./db");

// Load environment variables
dotenv.config();

const app = express();

// Configure CORS
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173"
  ],
  credentials: true,
  optionSuccessStatus: 200,
};

// Middleware setup
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({
  limit: "50mb",
  extended: true,
  parameterLimit: 50000,
}));

app.use(cors(corsOptions));
app.use(fileUpload({ limits: { fileSize: 20000000 }, abortOnLimit: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(rateLimiter);

// Session and authentication
app.use(session({
  secret: config.SECRET,
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/api/v1", v1Routes);    // Main API routes

// Start server
const PORT = process.env.PORT || 8080;

const http = require("http");
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server, {
  cors: corsOptions,
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("A client connected to WebSocket:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});