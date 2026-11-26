/**
 * PII Crypto & Masking Utility
 * Encrypts sensitive draft fields (PAN, Aadhaar, contact) with AES-256-GCM.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const crypto = require("crypto");
const config = require("../../../config");

const ALGO = "aes-256-gcm";

function getEncryptionKey() {
  const rawSecret =
    process.env.CHATBOT_ENCRYPTION_KEY ||
    process.env.SECRET ||
    config.SECRET ||
    "F2FINTECH_FALLBACK_KEY_CHANGE_ME";
  return crypto.createHash("sha256").update(String(rawSecret)).digest();
}

function encryptJson(payload) {
  if (!payload) return null;
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function decryptJson(serialized) {
  if (!serialized) return {};
  if (typeof serialized === "object") return serialized;
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || !parsed.iv || !parsed.tag || !parsed.data) {
      return typeof parsed === "object" ? parsed : {};
    }
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      ALGO,
      key,
      Buffer.from(parsed.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    console.error("[piiCrypto] Decryption failed:", err.message);
    return {};
  }
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function maskPan(pan) {
  if (!pan || String(pan).length < 10) return "******";
  const clean = String(pan).trim().toUpperCase();
  return `${clean.slice(0, 2)}******${clean.slice(-2)}`;
}

function maskContact(contact) {
  if (!contact || String(contact).length < 6) return "******";
  const clean = String(contact).trim();
  return `${"*".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

function maskEmail(email) {
  if (!email || !String(email).includes("@")) return "***";
  const [user, domain] = String(email).split("@");
  const visible = user.slice(0, 2);
  return `${visible}***@${domain}`;
}

module.exports = {
  encryptJson,
  decryptJson,
  hashToken,
  maskPan,
  maskContact,
  maskEmail,
};

