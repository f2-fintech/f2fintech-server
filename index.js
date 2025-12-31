/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const session = require("express-session");
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
  origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:3001",
    "https://f2fintech-web.netlify.app", "https://admin-f2fintech.netlify.app", "https://lendgrid.in", "https://lendgrid-server.onrender.com",
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});