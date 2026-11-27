/**
 * Post-Generation Output Guardrail & Compliance Filter
 * Prevents raw PAN/Aadhaar/bank account/secret leaks, removes emojis on distressed complaints,
 * and blocks prohibited "guaranteed approval" or external investment advice claims.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { STRICT_UNAVAILABLE_RESPONSE, STRICT_UNAVAILABLE_RESPONSE_HI } = require("../services/knowledge.service");
const { maskPan } = require("./piiCrypto");

const EMOJI_STRIP_REGEX =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu;

/**
 * Redact unmasked sensitive identifiers (PAN, Aadhaar, 13-19 digit card/account numbers, API secrets).
 */
function redactSensitivePiiFromOutput(text) {
  let out = String(text || "");
  const flags = [];

  // 1. Mask raw Indian PANs (5 letters + 4 digits + 1 letter, e.g., ABCDE1234F -> AB******4F)
  out = out.replace(/\b([A-Z]{5}\d{4}[A-Z])\b/g, (match) => {
    flags.push("output_pan_redacted");
    return maskPan(match);
  });

  // 2. Mask 12-digit Aadhaar-like numbers (avoiding phone prefixes, currency numbers, and longer tokens)
  out = out.replace(/(?<![+\d₹Rs.])\b(\d{4})([\s-]?)(\d{4})\2(\d{4})\b(?!\d)/g, (match, g1, sep, g2, g3) => {
    // Skip clearly non-Aadhaar year/date patterns (though 4-4-4 digits rarely occur as dates)
    flags.push("output_aadhaar_redacted");
    return `XXXX${sep}XXXX${sep}${g3}`;
  });

  // 3. Mask 13-19 digit raw bank account / payment card numbers
  out = out.replace(/(?<![+\d₹-])\b(?:\d[\s-]?){13,19}\b(?!\d)/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return match;
    flags.push("output_account_or_card_redacted");
    return `${"X".repeat(digits.length - 4)}${digits.slice(-4)}`;
  });

  // 4. Scrub accidental secret / Bearer token exposure
  out = out.replace(/\b(AIza[0-9A-Za-z_-]{20,})\b/g, () => {
    flags.push("output_secret_redacted");
    return "[REDACTED_KEY]";
  });
  out = out.replace(/\bBearer\s+[A-Za-z0-9._-]{24,}\b/gi, () => {
    flags.push("output_bearer_redacted");
    return "Bearer [REDACTED_TOKEN]";
  });

  return { text: out, flags };
}

/**
 * Enforce fintech regulatory phrasing & block unauthorized investment tips or approval guarantees.
 */
function enforceFintechComplianceOutput(text, { language = "en", isDistressed = false } = {}) {
  let out = String(text || "");
  const flags = [];

  // Block external stock/crypto/trading buy recommendations if ever generated
  if (
    /\b(?:you\s+should\s+)?(?:buy|invest\s+in|purchase)\s+(?:[a-z0-9&\s]{0,30})?(?:stocks?|shares?|equity|crypto|bitcoin|ethereum|nifty|sensex)\b/i.test(
      out
    )
  ) {
    flags.push("output_investment_advice_blocked");
    return {
      text:
        language === "hi"
          ? `${STRICT_UNAVAILABLE_RESPONSE_HI} (मैं शेयर बाज़ार, क्रिप्टो या निवेश सलाह नहीं देता।)`
          : `${STRICT_UNAVAILABLE_RESPONSE} (I cannot provide stock, crypto, or personal investment advice.)`,
      flags,
    };
  }

  // Rewrite prohibited absolute approval guarantees
  const guaranteeRegex =
    /\b(?:100%\s+)?(?:guaranteed|assured|confirmed)\s+(?:instant\s+)?(?:loan\s+)?(?:approval|sanction)\b/gi;
  if (guaranteeRegex.test(out)) {
    flags.push("output_guarantee_claim_rewritten");
    out = out.replace(
      guaranteeRegex,
      language === "hi"
        ? "प्रारंभिक पात्रता मिलान (अंतिम स्वीकृति लेंडर की जांच पर निर्भर करती है)"
        : "preliminary eligibility matching (subject to lender verification — loan approval is not guaranteed)"
    );
  }

  // Keep distressed complaint replies calm & free of playful emojis
  if (isDistressed && EMOJI_STRIP_REGEX.test(out)) {
    flags.push("output_distress_emoji_stripped");
    out = out.replace(EMOJI_STRIP_REGEX, "").replace(/[ \t]{2,}/g, " ").trim();
  }

  return { text: out, flags };
}

/**
 * Mandatory post-generation output guardrail pipeline.
 */
function applyOutputGuardrails(replyText, options = {}) {
  const original = String(replyText || "");
  const piiRes = redactSensitivePiiFromOutput(original);
  const compRes = enforceFintechComplianceOutput(piiRes.text, options);
  const flags = Array.from(new Set([...piiRes.flags, ...compRes.flags]));

  return {
    text: compRes.text,
    flags,
    modified: compRes.text !== original,
  };
}

module.exports = {
  redactSensitivePiiFromOutput,
  enforceFintechComplianceOutput,
  applyOutputGuardrails,
};
