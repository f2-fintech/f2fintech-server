/**
 * BankKaro Module Routes
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const express = require("express");
const router = express.Router();
const controller = require("./bankkaro.controller");
const { bankkaroRateLimiter } = require("../../middleware/rateLimiters");

// Apply rate limiter to BankKaro endpoints
router.use(bankkaroRateLimiter);

// Card Catalog and Detail endpoints
router.get("/", controller.getAllCards);
router.get("/popular", controller.getPopularCards);
router.get("/init-bundle", controller.getInitBundle);
router.get("/card/:alias", controller.getCardByAlias);

// Calculation & Eligibility
router.post("/calculate", controller.calculateSpends);
router.post("/eligibility", controller.checkEligibility);
router.post("/stateless-bre", controller.applyStatelessBRE);

// Lead and Tracking
router.post("/track-click", controller.trackClick);
router.post("/create-lead", controller.createLead);
router.get("/leads", controller.getAllLeads);

module.exports = router;
