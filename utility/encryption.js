const crypto = require("crypto");
const axios = require("axios");

function encryptAES256(plaintext, keyStr, ivStr) {
  const key = Buffer.from(keyStr, "utf8");
  const iv = Buffer.from(ivStr, "utf8");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function decryptAES256(encryptedBase64, keyStr, ivStr) {
  const key = Buffer.from(keyStr, "utf8");
  const iv = Buffer.from(ivStr, "utf8");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function prepareRequestData(jsonData, keyStr, ivStr) {
  const jsonStr = JSON.stringify(jsonData);
  const base64EncodedPlaintext = Buffer.from(jsonStr, "utf8").toString("base64");
  return encryptAES256(base64EncodedPlaintext, keyStr, ivStr);
}

function prepareRequestDataDirectJson(jsonData, keyStr, ivStr) {
  const jsonStr = JSON.stringify(jsonData);
  return encryptAES256(jsonStr, keyStr, ivStr);
}

function parseResponseData(encryptedResponseData, keyStr, ivStr) {
  const decrypted = decryptAES256(encryptedResponseData, keyStr, ivStr);
  const trimmed = decrypted.trim();

  // 1. Try direct JSON parse first
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed);
    }
  } catch (e) {
    // not direct valid JSON, continue to Base64 decode
  }

  // 2. Check if decrypted string is Base64 encoded JSON
  try {
    const decodedJsonStr = Buffer.from(decrypted, "base64").toString("utf8").trim();
    if (decodedJsonStr.startsWith("{") || decodedJsonStr.startsWith("[")) {
      return JSON.parse(decodedJsonStr);
    }
  } catch (e) {
    // Not base64 encoded JSON, fall through to direct JSON parse
  }

  return JSON.parse(decrypted);
}

async function getBearerToken(clientId, clientSecret) {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("scope", "4a8e1fe6-5938-43a9-b18f-6bc8b6b419a5/.default");

  const response = await axios.post(
    "https://login.microsoftonline.com/cc189639-817e-4763-ac0b-3d792562a585/oauth2/v2.0/token",
    params,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return response.data.access_token;
}

module.exports = {
  encryptAES256,
  decryptAES256,
  prepareRequestData,
  prepareRequestDataDirectJson,
  parseResponseData,
  getBearerToken,
};
