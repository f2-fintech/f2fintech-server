/**
 * FAQ Response & Knowledge Cache Service
 * Cuts redundant LLM token usage & response latency on high-frequency stateless queries,
 * with automatic invalidation on admin KB/catalog/form updates.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const DEFAULT_FAQ_TTL_MS = Number(process.env.CHATBOT_FAQ_CACHE_TTL_MS) || 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const faqResponseCache = new Map();
let cacheMetrics = { hits: 0, misses: 0 };

function normalizeFaqQuery(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\u0900-\u097F\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Only cache stateless informational FAQs — NEVER cache personalized, transactional,
 * live-feed (ATS openings / live cards), or numerical calculation requests.
 */
function isCacheableFaqQuery(cleanMessage, activeDraftProgress = null) {
  if (activeDraftProgress && activeDraftProgress.loanType) return false;
  const msg = String(cleanMessage || "").trim();
  if (!msg || msg.length > 220) return false;

  // Exclude personalized, stateful, transactional, or live-inventory queries
  if (
    /\b(status|track|application|my\b|apply|otp|upload|missing|recommend|compare|vs|versus|emi|calculate|credit\s*card|cards?|job|jobs|career|openings?|vacanc|hiring|debited|deducted|failed|panic|refund|complaint|grievance\s*ticket)\b|स्थिति|आवेदन|मेरा|मेरी|कार्ड|नौकरी|भर्ती|तुलना|किस्त/i.test(
      msg
    )
  ) {
    return false;
  }

  // Exclude queries with multi-digit amounts / account numbers / personal info
  if (/\d{4,}/.test(msg) || /@/.test(msg)) {
    return false;
  }

  return true;
}

function buildCacheKey(companyId, language, normalizedQuery) {
  return `${Number(companyId) || 101}:${language || "en"}:${normalizedQuery}`;
}

function getCachedFaqResponse({ companyId = 101, language = "en", message }) {
  const norm = normalizeFaqQuery(message);
  if (!norm) return null;
  const key = buildCacheKey(companyId, language, norm);
  const entry = faqResponseCache.get(key);
  if (!entry) {
    cacheMetrics.misses += 1;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    faqResponseCache.delete(key);
    cacheMetrics.misses += 1;
    return null;
  }
  // Refresh LRU order cleanly
  faqResponseCache.delete(key);
  faqResponseCache.set(key, entry);
  cacheMetrics.hits += 1;
  return {
    reply: entry.reply,
    intent: entry.intent,
    cachedAt: entry.cachedAt,
  };
}

function setCachedFaqResponse({ companyId = 101, language = "en", message, reply, intent = "knowledge_qa", ttlMs = DEFAULT_FAQ_TTL_MS }) {
  const norm = normalizeFaqQuery(message);
  if (!norm || !reply) return false;

  if (faqResponseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = faqResponseCache.keys().next().value;
    if (oldestKey) faqResponseCache.delete(oldestKey);
  }

  const key = buildCacheKey(companyId, language, norm);
  faqResponseCache.set(key, {
    reply,
    intent,
    cachedAt: new Date().toISOString(),
    expiresAt: Date.now() + ttlMs,
  });
  return true;
}

function invalidateChatbotCache(companyId = null) {
  if (!companyId) {
    faqResponseCache.clear();
    return;
  }
  const prefix = `${Number(companyId)}:`;
  for (const key of faqResponseCache.keys()) {
    if (key.startsWith(prefix)) {
      faqResponseCache.delete(key);
    }
  }
}

function getCacheStats() {
  return {
    entries: faqResponseCache.size,
    hits: cacheMetrics.hits,
    misses: cacheMetrics.misses,
  };
}

module.exports = {
  isCacheableFaqQuery,
  getCachedFaqResponse,
  setCachedFaqResponse,
  invalidateChatbotCache,
  getCacheStats,
};

