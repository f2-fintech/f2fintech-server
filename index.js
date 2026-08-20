/**
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
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

// Load environment variables.....
dotenv.config();

const app = express();

// Configure CORS
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001",
    "https://f2fintech-web.netlify.app", "https://admin-f2fintech.netlify.app", "https://lendgrid.in", 'https://lendgrid.netlify.app', "https://lendgrid-server.onrender.com",
    "https://admin.f2fintech.in", "https://f2fintech.com", "http://127.0.0.1:5173"], //this will allow multiple domains to connect
  credentials: true, //access-control-allow-credentials:true
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
app.use("/api/v1", v1Routes);    // Main API routes (including Credit Cards)

// 404 catch-all for undefined API routes
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API route not found." });
});

// Global error handler — prevents unhandled errors from causing 5xx crashes
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[GlobalError]", err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error. Please try again later.",
  });
});

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

// Process crash guards — prevent unhandled errors from killing the server
// which would cause 5xx for Googlebot and hurt SEO
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Server will continue:", err.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Unhandled promise rejection:", reason);
});