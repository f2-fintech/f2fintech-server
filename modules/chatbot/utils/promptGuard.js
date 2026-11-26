/**
 * Prompt Injection Guard & Multilingual Detector (EN / HI)
 * Protects against instruction hijacking, prompt leaks, and unauthorized data requests.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)/i,
  /disregard\s+(your\s+)?(system|instructions|rules)/i,
  /reveal\s+(your\s+)?(system\s+prompt|instructions|api\s+key|database|schema|env)/i,
  /act\s+as\s+(an?\s+)?(unrestricted|jailbroken|admin|root|sql)/i,
  /bypass\s+(validation|security|auth|authentication|verification|check)/i,
  /drop\s+table|union\s+select|insert\s+into|delete\s+from|alter\s+table/i,
  /<\s*script\b/i,
  /show\s+(all|other)\s+(customers|users|applications|pan|aadhaar)/i,
];

const HINDI_ROMANIZED_HINTS = [
  "mujhe",
  "mujhko",
  "chahiye",
  "kitna",
  "kitni",
  "kitne",
  "kya",
  "kaise",
  "kaun",
  "batao",
  "bataiye",
  "mera",
  "meri",
  "mere",
  "byaj",
  "vyapar",
  "naukri",
  "dastavez",
  "kagaz",
  "aavedan",
  "udhar",
  "karz",
  "mahine",
  "saal",
  "rupaye",
  "lakh",
  "crore",
  "madad",
  "namaste",
  "hindi",
];

function detectPromptInjection(text) {
  if (!text || typeof text !== "string") return false;
  return INJECTION_PATTERNS.some((regex) => regex.test(text));
}

function sanitizeUserInput(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 2000);
}

function detectLanguage(text, preferredLang = null) {
  if (!text || typeof text !== "string") {
    return preferredLang === "hi" ? "hi" : "en";
  }

  // Devanagari Unicode block
  if (/[\u0900-\u097F]/.test(text)) {
    return "hi";
  }

  const words = text.toLowerCase().split(/\s+/);
  let hindiHits = 0;
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, "");
    if (HINDI_ROMANIZED_HINTS.includes(clean)) {
      hindiHits += 1;
    }
  }
  if (hindiHits >= 2 || (words.length <= 4 && hindiHits >= 1 && /\bhindi\b|\bnamaste\b|\bchahiye\b/i.test(text))) {
    return "hi";
  }

  if (preferredLang === "hi" && !/\benglish\b/i.test(text)) {
    return "hi";
  }
  return "en";
}

module.exports = {
  detectPromptInjection,
  sanitizeUserInput,
  detectLanguage,
};

