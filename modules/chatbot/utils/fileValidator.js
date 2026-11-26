/**
 * Secure Document File Validator
 * Enforces size limits (10MB), safe extensions, MIME types, and magic-byte verification.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const path = require("path");

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB matching Step3Form & Step4Form

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
]);

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function hasValidMagicBytes(ext, buffer) {
  if (!buffer || buffer.length < 4) return false;
  const hex4 = buffer.subarray(0, 4).toString("hex").toLowerCase();
  const ascii4 = buffer.subarray(0, 4).toString("ascii");

  if (ext === ".pdf") {
    return ascii4 === "%PDF";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return hex4.startsWith("ffd8ff");
  }
  if (ext === ".png") {
    return hex4 === "89504e47";
  }
  if (ext === ".webp") {
    return ascii4 === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (ext === ".docx") {
    return hex4 === "504b0304" || hex4 === "504b0506";
  }
  if (ext === ".doc") {
    return hex4 === "d0cf11e0";
  }
  return false;
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || "document")).toLowerCase().trim();
  return base
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}

function validateUploadedDocument(file) {
  if (!file || !file.data) {
    return { valid: false, error: "No file provided. Please select a valid document." };
  }

  const size = Number(file.size || file.data.length || 0);
  if (size <= 0) {
    return { valid: false, error: "Uploaded file is empty." };
  }
  if (size > MAX_FILE_BYTES) {
    return {
      valid: false,
      error: `File exceeds the maximum 10MB size limit (${(size / (1024 * 1024)).toFixed(1)} MB provided).`,
    };
  }

  const ext = path.extname(String(file.name || "")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported file extension "${ext || "unknown"}". Allowed formats: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX.`,
    };
  }

  const mime = String(file.mimetype || "").toLowerCase();
  if (mime && !ALLOWED_MIMES.has(mime)) {
    return {
      valid: false,
      error: `Unsupported file MIME type "${mime}".`,
    };
  }

  if (!hasValidMagicBytes(ext, file.data)) {
    return {
      valid: false,
      error: "File content does not match its declared file format. Please upload an uncorrupted original document.",
    };
  }

  return {
    valid: true,
    safeName: sanitizeFilename(file.name),
    ext,
    size,
    mime: mime || "application/octet-stream",
  };
}

module.exports = {
  MAX_FILE_BYTES,
  ALLOWED_EXTENSIONS,
  validateUploadedDocument,
  sanitizeFilename,
};

