/**
 * Digitap Module Routes
 * Strict rate limiting applied.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const express = require("express");
const router = express.Router();
const controller = require("./digitap.controller");
const { digitapRateLimiter } = require("../../middleware/rateLimiters");
const { optionalAuth } = require("../../middleware/authGuard");

// Apply strict rate limiting and authentication guard
router.use(digitapRateLimiter);
router.use(optionalAuth);

// CIBIL report endpoint (TimbleGlance Experian Bureau V2)
router.post("/cibil-report", controller.getCibilReport);

// Retired legacy proxy endpoint
router.post("/proxy-digitap", controller.proxyDigitap);

module.exports = router;

