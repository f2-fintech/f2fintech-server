/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const rateLimit = require("express-rate-limit");

const Utility = require("./index");

/**
 * General API rate limiter — per IP, 300 requests per minute.
 * Applied globally to all routes.
 */
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: Utility.formatResponse(
    429,
    "Too many requests from this IP. Please wait a moment and try again."
  ),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Never block PayU callback responses (surl / furl redirects)
    return req.path.includes("/payment/payu/response");
  },
});

/**
 * Payment-specific rate limiter — per IP, max 5 payment initiation attempts
 * per 2 minutes. Prevents rapid retries that trigger PayU Hyphen-ONE 429 errors.
 */
const paymentRateLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 5,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: Utility.formatResponse(
    429,
    "Too many payment attempts. Please wait 2 minutes before trying again."
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = rateLimiter;
module.exports.paymentRateLimiter = paymentRateLimiter;
