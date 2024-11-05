/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
  path: path.resolve(__dirname, `local.env`),
});

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "local",
  HOST: process.env.HOST || "localhost",
  PORT: process.env.PORT || 8080,
  DB: process.env.DB || "f2-fintech",
  DB_PORT: process.env.DB_PORT || 3306,
  DB_USERNAME: process.env.DB_USERNAME || "root",
  DB_PASSWORD: process.env.DB_PASSWORD || "",
  SALT: process.env.SALT || 12,
  SECRET: process.env.SECRET || "F#2@FIN!&TECH%20",
  BUCKET: process.env.BUCKET_NAME || "f2fintechcustomerdocs",
  REGION: process.env.REGION || "eu-north-1",
  ACCESS_KEY: process.env.ACCESS_KEY_ID || "AKIA6ODU4552XISEIQKP",
  SECRET_KEY:
    process.env.SECRET_KEY_ID || "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",
  S3_PATHNAME:
    process.env.S3_PATHNAME ||
    "https://f2fintechcustomerdoc.s3.ap-southeast-1.amazonaws.com/",
  SENDER_EMAIL: process.env.SENDER_EMAIL || 'adusmanibi17@gmail.com'
};
