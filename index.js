/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const bodyParser = require("body-parser");
const cors = require("cors");
const express = require("express");
const fileUpload = require("express-fileupload");
const session = require("express-session");

const config = require("./config");
const rateLimiter = require("./utility/rateLimiter");
const v1Routes = require("./v1/routes");
const { passport } = require("./config/passportConfig");

let { connectToMysql } = require("./db");

const app = express();

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000","http://127.0.0.1:5173"], //this will allow multiple domains to connect
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};

app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000,
  })
);

app.use(cors(corsOptions));
app.use(fileUpload({ limits: { fileSize: 20000000 }, abortOnLimit: true })); //express-fileupload middleware
app.use(rateLimiter);

app.use(
  session({
    secret: config.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use("/api/v1", v1Routes);
// Add the new route for importing loan providers
// app.post(
//   "/import-loan-providers",
//   upload.single("file"),
//   loanProviderController.importLoanProviders
// );

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
