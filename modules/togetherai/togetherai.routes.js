/**
 * Together AI Module Routes
 * Strict rate limiting applied.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const express = require("express");
const router = express.Router();
const controller = require("./togetherai.controller");
const { togetherAiRateLimiter } = require("../../middleware/rateLimiters");
const { optionalAuth } = require("../../middleware/authGuard");

// Apply strict rate limiting and authentication guard
router.use(togetherAiRateLimiter);
router.use(optionalAuth);

// Chat completion endpoint
router.post("/", controller.handleChat);

module.exports = router;

