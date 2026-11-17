/**
 * BankKaro Service - Outbound HTTP Integration
 * Encapsulates all external communication with BankKaro / CardGenius APIs.
 * Never leaks API keys or full upstream headers.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const axios = require("axios");

const rawBaseUrl = process.env.BANKKARO_BASE_URL || "https://platform.bankkaro.com";
const BANKKARO_BASE_URL = rawBaseUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "");
const rawStatelessUrl = process.env.BANKKARO_STATELESS_BASE_URL || "";
const BANKKARO_STATELESS_BASE_URL = rawStatelessUrl
  ? rawStatelessUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "")
  : null;

// Cache JWT partner tokens per base URL (Production vs UAT)
const partnerTokenCache = {};

/**
 * Obtain or return cached BankKaro Partner JWT Token
 */
async function getPartnerToken(baseUrl = BANKKARO_BASE_URL) {
  const apiKey = process.env.BANKKARO_API_KEY;
  if (!apiKey) {
    throw new Error("BANKKARO_API_KEY is missing from server environment");
  }

  const cleanBase = baseUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "");
  const now = Date.now();
  const cached = partnerTokenCache[cleanBase];
  if (cached && now < cached.expiresAt - 60000) {
    return cached.token;
  }

  try {
    const response = await axios.post(
      `${cleanBase}/partner/token`,
      { "x-api-key": apiKey },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    const data = response.data;
    if (data.status === "success" && data.data && data.data.jwttoken) {
      partnerTokenCache[cleanBase] = {
        token: data.data.jwttoken,
        expiresAt: data.data.expiresAt
          ? new Date(data.data.expiresAt).getTime()
          : now + 3600000,
      };
      return partnerTokenCache[cleanBase].token;
    } else {
      throw new Error("Failed to authenticate with BankKaro partner service");
    }
  } catch (error) {
    // Sanitized logging: never print API key or auth headers
    console.error("[BankKaro Service] Token acquisition error:", error.message);
    throw new Error("Card service authentication failed.");
  }
}

/**
 * Generic outbound caller with partner token
 */
async function callBankKaro(endpoint, method = "GET", body = null, baseUrl = BANKKARO_BASE_URL) {
  const cleanBase = baseUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "");
  const token = await getPartnerToken(cleanBase);

  try {
    const config = {
      method,
      url: `${cleanBase}${endpoint}`,
      headers: {
        "partner-token": token,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      config.data = body;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`[BankKaro Service] Error on ${endpoint}:`, error.message);
    throw new Error("Card service provider request failed.");
  }
}

/**
 * Fetch credit cards catalog
 */
async function fetchCards() {
  return callBankKaro("/partner/cardgenius/v2/cards", "GET");
}

/**
 * Fetch popular credit cards
 */
async function fetchPopularCards() {
  return callBankKaro("/partner/cardgenius/popular-cards", "GET");
}

/**
 * Fetch init bundle
 */
async function fetchInitBundle() {
  return callBankKaro("/partner/cardgenius/init-bundle", "GET");
}

/**
 * Fetch card by alias
 */
async function fetchCardByAlias(alias) {
  return callBankKaro(`/partner/cardgenius/cards/${encodeURIComponent(alias)}`, "GET");
}

/**
 * Calculate card spends
 */
async function calculateSpends(spendPayload) {
  return callBankKaro("/partner/cardgenius/v2/calculate", "POST", spendPayload);
}

/**
 * Check card eligibility
 */
async function checkEligibility(payload) {
  return callBankKaro("/partner/cardgenius/eligiblity", "POST", payload);
}

/**
 * Apply Stateless BRE
 */
async function applyStatelessBRE(payload) {
  const targetBase = BANKKARO_STATELESS_BASE_URL || BANKKARO_BASE_URL;
  return callBankKaro(
    "/partner/loangenius/stateless/bre-stage-basic",
    "POST",
    payload,
    targetBase
  );
}

module.exports = {
  fetchCards,
  fetchPopularCards,
  fetchInitBundle,
  fetchCardByAlias,
  calculateSpends,
  checkEligibility,
  applyStatelessBRE,
};
