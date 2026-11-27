/**
 * Provider-Specific Rate Limiters
 * Strict limits on Together AI and Digitap endpoints to prevent quota exhaustion and abuse.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const rateLimit = require("express-rate-limit");

/**
 * Together AI Chat Rate Limiter:
 * 20 requests per 1 minute per IP (prevents AI API quota drain)
 */
const togetherAiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: {
    success: false,
    error: "Too many chat messages. Please wait a moment before sending another message.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Digitap & Bureau Rate Limiter:
 * 10 requests per 5 minutes per IP (prevents bureau API abuse & costs)
 */
const digitapRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: {
    success: false,
    error: "Too many credit report requests. Please wait a few minutes before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * BankKaro Cards & Calculation Rate Limiter:
 * 60 requests per 1 minute per IP
 */
const bankkaroRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: {
    success: false,
    error: "Too many requests to card service. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatbotRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: {
    success: false,
    error: "Too many assistant requests. Please wait a moment before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatbotUploadRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: {
    success: false,
    error: "Too many document upload attempts. Please wait a few minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const chatbotOtpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 6,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: {
    success: false,
    error: "Too many OTP verification attempts. Please wait 5 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  togetherAiRateLimiter,
  digitapRateLimiter,
  bankkaroRateLimiter,
  chatbotRateLimiter,
  chatbotUploadRateLimiter,
  chatbotOtpRateLimiter,
};

