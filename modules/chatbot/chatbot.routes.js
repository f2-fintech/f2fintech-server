/**
 * Chatbot Module Routes (/api/v1/chatbot/*)
 * Enforces rate limiting, optional/strict auth, and role-based admin authorization.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const express = require("express");
const router = express.Router();
const chatbotController = require("./controllers/chatbot.controller");
const adminController = require("./controllers/admin.controller");
const { optionalAuth, requireAdmin } = require("../../middleware/authGuard");
const {
  chatbotRateLimiter,
  chatbotUploadRateLimiter,
  chatbotOtpRateLimiter,
} = require("../../middleware/rateLimiters");

// Conversation & Session
router.post("/session", chatbotRateLimiter, optionalAuth, chatbotController.initOrResumeSession);
router.post("/message", chatbotRateLimiter, optionalAuth, chatbotController.sendMessage);
router.post("/feedback", chatbotRateLimiter, optionalAuth, chatbotController.submitFeedback);

// Authoritative Backend Tools (Form Configs, EMI Calculator, Compare, Recommend)
router.get("/form-config/:loanType", chatbotRateLimiter, chatbotController.getFormConfig);
router.post("/calculate-repayment", chatbotRateLimiter, chatbotController.calculateRepayment);
router.post("/compare", chatbotRateLimiter, chatbotController.compareLoans);
router.post("/recommend", chatbotRateLimiter, chatbotController.recommendLoansEndpoint);

// Conversational Loan Application Lifecycle
router.post("/application/draft", chatbotRateLimiter, optionalAuth, chatbotController.updateApplicationDraftEndpoint);
router.post(
  "/application/upload-document",
  chatbotUploadRateLimiter,
  optionalAuth,
  chatbotController.uploadApplicationDocumentEndpoint
);
router.get("/application/review", chatbotRateLimiter, optionalAuth, chatbotController.getReviewSummaryEndpoint);
router.post("/application/submit", chatbotRateLimiter, optionalAuth, chatbotController.submitApplicationEndpoint);

// Customer Support, Auth-Scoped Status Lookup & Escalation
router.post("/auth/send-otp", chatbotOtpRateLimiter, chatbotController.sendOtpEndpoint);
router.post("/auth/verify-otp", chatbotOtpRateLimiter, chatbotController.verifyOtpEndpoint);
router.get("/application/status", chatbotRateLimiter, optionalAuth, chatbotController.getApplicationStatusEndpoint);
router.patch("/application/details", chatbotRateLimiter, optionalAuth, chatbotController.updateApplicationDetailsEndpoint);
router.post("/support/escalate", chatbotRateLimiter, optionalAuth, chatbotController.escalateSupportEndpoint);

// Admin Knowledge Management & Analytics (Strict RBAC)
router.get("/admin/knowledge", requireAdmin, adminController.listKnowledge);
router.post("/admin/knowledge", requireAdmin, adminController.createKnowledge);
router.put("/admin/knowledge/:id", requireAdmin, adminController.updateKnowledge);
router.post("/admin/knowledge/:id/approve", requireAdmin, adminController.approveKnowledge);
router.post("/admin/knowledge/:id/archive", requireAdmin, adminController.archiveKnowledge);

router.get("/admin/catalog", requireAdmin, adminController.listCatalog);
router.post("/admin/catalog", requireAdmin, adminController.upsertCatalogProduct);
router.put("/admin/catalog/:id", requireAdmin, adminController.upsertCatalogProduct);
router.post("/admin/catalog/:id/approve", requireAdmin, adminController.approveCatalogProduct);

router.get("/admin/form-configs", requireAdmin, adminController.listFormConfigs);
router.put("/admin/form-configs/:loanType", requireAdmin, adminController.updateFormConfig);

router.get("/admin/analytics", requireAdmin, adminController.getAnalyticsSummary);

module.exports = router;

