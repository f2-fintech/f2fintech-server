/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const rateLimit = require("express-rate-limit");

const Utility = require("./index");

const maxRequests = 100;
/** Middleware to control the rate at which users can send requests to the server
 */

const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute in milliseconds
  max: maxRequests,
  message: Utility.formatResponse(
    429,
    `You have exceeded ${maxRequests} requests per minute limit!`
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = rateLimiter;
