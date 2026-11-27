/**
 * Prompt Injection Guard, Financial Advice/Distress Detector & Multilingual Detector (EN / HI)
 * Protects against instruction hijacking, authority spoofing, document prompt injections,
 * prompt leaks, and unauthorized data requests.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|system|earlier)\s+(instructions|prompts|rules|guidelines)/i,
  /disregard\s+(all\s+|your\s+)?(previous|prior|system|instructions|rules)/i,
  /(?:forget|reset|clear)\s+(?:all\s+)?(?:your\s+|previous\s+)?(?:rules|instructions|context|guidelines)/i,
  /(?:new|override|updated)\s+(?:system\s+)?instructions\s*:/i,
  /reveal\s+(your\s+)?(system\s+prompt|instructions|api\s+key|database|schema|env)/i,
  /(?:print|dump|output|show|leak|expose)\s+(?:me\s+)?(?:your\s+)?(?:env|environment\s+variables|secret\s*key|system\s+prompt|hidden\s+rules|sql\s+tables?)/i,
  /act\s+as\s+(an?\s+)?(unrestricted|jailbroken|admin|root|sql)/i,
  /bypass\s+(validation|security|auth|authentication|verification|check|kyc|guardrail)/i,
  /\b(?:i\s+am|this\s+is|acting\s+as|speaking\s+as)\s+(?:the\s+)?(?:bank\s+manager|branch\s+manager|ceo|md|compliance\s+officer|system\s+admin)\b[\s\S]{0,120}\b(?:refund|approve|credit|transfer|bypass|override|release|send)\b/i,
  /\b(?:approve|sanction|disburse|refund)\s+(?:this\s+loan|immediately|₹?\s*[\d,]+)\b[\s\S]{0,80}\b(?:no\s+check|override|skip|ignore|urgent\s+command|instructions)\b/i,
  /drop\s+table|union\s+select|insert\s+into|delete\s+from|alter\s+table/i,
  /<\s*script\b|<\s*iframe\b|javascript:/i,
  /<!--[\s\S]{0,150}(?:ignore|system|approve|refund|override|bypass)[\s\S]{0,150}-->/i,
  /show\s+(all|other|another)\s+(customers|users|applications|accounts|pan|aadhaar)/i,
  /\b(?:pichhle|purane|sabhi)\s+(?:niyam|instructions|rules)\s+(?:bhool|hata|ignore)/i,
  /(?:पिछले\s*(?:सभी\s*)?निर्देश|नियम)\s*(?:भूल|अनदेखा|छोड़)/i,
  /(?:सिस्टम\s*प्रॉम्प्ट|एपीआई\s*की|डेटाबेस\s*स्कीमा|सभी\s*ग्राहकों).{0,30}(?:दिखाओ|बताओ|लीक)/i,
];

const DOCUMENT_INJECTION_PATTERNS = [
  ...INJECTION_PATTERNS,
  /\bapprove\s+this\s+(?:loan|application|file)\b/i,
  /\bskip\s+(?:credit|kyc|verification|cibil)\s+check\b/i,
  /\boverride\s+(?:credit|underwriting|policy)\b/i,
];

function stripInvisibleChars(text) {
  return String(text || "").replace(/[\u200B-\u200D\uFEFF]/g, "");
}

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
  const normalized = stripInvisibleChars(text);
  return INJECTION_PATTERNS.some((regex) => regex.test(normalized));
}

/**
 * Scan extracted text from uploaded PDFs/documents before passing into any LLM prompt.
 */
function scanExtractedDocumentText(rawText) {
  const cleanedText = sanitizeUserInput(stripInvisibleChars(rawText || ""));
  const flaggedReasons = [];
  for (const regex of DOCUMENT_INJECTION_PATTERNS) {
    if (regex.test(cleanedText)) {
      flaggedReasons.push(regex.source.slice(0, 60));
    }
  }
  return {
    safe: flaggedReasons.length === 0,
    cleanedText,
    flaggedReasons,
  };
}

/**
 * Classify whether the customer is distressed (payment/debit urgency) or asking for prohibited external investment tips.
 */
function detectFinancialDistressOrAdvice(text) {
  const normalized = stripInvisibleChars(text);
  const isDistressed =
    /\b(money\s+(?:was\s+)?debited|amount\s+deducted|payment\s+failed|failed\s+payment|charged\s+twice|double\s+debit|unauthorized\s+debit|paise\s+kat|panic|scam|fraud)\b/i.test(
      normalized
    );
  const isExternalInvestmentAdvice =
    /\b(?:which|what|best|recommend|suggest|buy|sell|invest\s+in)\s+(?:a\s+|the\s+|this\s+)?(?:stock|stocks|share|shares|equity|crypto|bitcoin|ethereum|coin|nifty|banknifty|sensex|intraday|options\s+call|ipo|mutual\s*fund|sip)\b/i.test(
      normalized
    ) && !/\b(loan|emi|cibil|credit\s*card|plans?|subscription)\b/i.test(normalized);

  return {
    isDistressed,
    isExternalInvestmentAdvice,
  };
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
  scanExtractedDocumentText,
  detectFinancialDistressOrAdvice,
  sanitizeUserInput,
  detectLanguage,
};

