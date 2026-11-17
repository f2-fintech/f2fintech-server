/**
 * Digitap Service - Outbound HTTP Integration
 * Encapsulates Experian Credit Analytics via Digitap and Befisc / SmartAuth Bureau pulls.
 * Secrets never leave the server; keys and full upstream headers are never logged.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const axios = require("axios");

const isProduction = process.env.NODE_ENV === "production";

// Get Digitap API key (Befisc / SmartAuth) based on environment
function getDigitapApiKey() {
  if (process.env.DIGITAP_API_KEY) {
    return process.env.DIGITAP_API_KEY;
  }
  if (isProduction) {
    return process.env.DIGITAP_PRODUCTION_KEY || "";
  }
  return process.env.DIGITAP_STAGING_KEY || process.env.DIGITAP_PRODUCTION_KEY || "";
}

// Get Basic Auth header for Digitap Experian Credit Analytics API
function getDigitapBasicAuth() {
  const clientId = process.env.DIGITAP_CLIENT_ID;
  const secret = process.env.DIGITAP_SECRET;
  if (!clientId || !secret) {
    throw new Error("DIGITAP_CLIENT_ID or DIGITAP_SECRET is missing from server environment");
  }
  return Buffer.from(`${clientId}:${secret}`).toString("base64");
}

/**
 * 1. Primary: Call Digitap Experian Credit Analytics API
 * Returns official Experian result_pdf and bureau score
 */
async function requestExperianAnalytics(payload) {
  const auth = getDigitapBasicAuth();

  try {
    const response = await axios.post(
      "https://svc.digitap.ai/credit_analytics/request",
      payload,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const data = response.data || {};
    // Extract official PDF S3 URL
    const pdfUrl =
      data?.result?.result_pdf ||
      data?.data?.result_pdf ||
      data?.result_pdf ||
      data?.data?.url ||
      data?.redirect_url ||
      data?.url ||
      null;

    const liveScore =
      data?.result?.result_json?.INProfileResponse?.SCORE?.BureauScore ||
      data?.data?.SCORE?.BureauScore ||
      null;

    return {
      status: response.status,
      success: true,
      pdfUrl,
      creditScore: liveScore,
      result_code: data.result_code,
      message: data.message || "Experian report retrieved successfully",
      rawResult: {
        result: data.result ? { result_pdf: pdfUrl } : undefined,
        message: data.message,
        result_code: data.result_code,
      },
    };
  } catch (error) {
    console.error(
      "[Digitap Service] Experian Analytics error:",
      error.response?.data?.message || error.message
    );
    throw error;
  }
}

/**
 * 2. Secondary: Call Befisc / SmartAuth Bureau(A) V2
 */
async function requestBefiscBureau(payload) {
  const apiKey = getDigitapApiKey();
  if (!apiKey) {
    throw new Error("DIGITAP_API_KEY is missing from server environment");
  }

  const befiscPayload = {
    name: payload.name,
    mobile: payload.mobile,
    consent_text:
      payload.consent_text ||
      "We confirm obtaining valid customer consent to access/process their name/mobile data. Consent remains valid, informed, and unwithdrawn.",
    consent: "Y",
  };

  try {
    const response = await axios.post(
      "https://prod.smartauth.co/JEE4",
      befiscPayload,
      {
        headers: {
          authkey: apiKey,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const data = response.data || {};
    const result = data.result || {};
    const pdfUrl = result.pdf_report || result.url || result.redirect_url || null;
    const score = result.SCORE?.BureauScore || result.credit_score || 750;

    return {
      status: response.status,
      success: data.status === 1,
      pdfUrl,
      creditScore: score,
      message: data.message || "Befisc bureau report retrieved successfully",
      result: {
        pdf_report: result.pdf_report,
        url: result.url,
        SCORE: result.SCORE,
        credit_score: score,
      },
    };
  } catch (error) {
    console.error(
      "[Digitap Service] Befisc Bureau error:",
      error.response?.data?.message || error.message
    );
    throw error;
  }
}

module.exports = {
  requestExperianAnalytics,
  requestBefiscBureau,
};
