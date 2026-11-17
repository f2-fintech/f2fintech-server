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

// Narrow CIBIL report endpoint (attempts Experian then Befisc on server)
router.post("/cibil-report", controller.getCibilReport);

// Backward-compatible endpoint for existing frontend axiosInstance.post("/proxy-digitap")
router.post("/proxy-digitap", controller.proxyDigitap);

module.exports = router;
