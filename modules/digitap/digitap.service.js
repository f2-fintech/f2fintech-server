/**
 * Bureau Service - Outbound HTTP Integration (TimbleGlance Experian Bureau V2)
 * Secrets never leave the server; keys, PII, and upstream auth headers are never logged.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const axios = require("axios");

const DEFAULT_TIMBLEGLANCE_URL = "https://www.timbleglance.com/api/Experian_Bureau_V2";

function getTimbleGlanceConfig() {
  const apiKey = process.env.TIMBLEGLANCE_API_KEY;
  if (!apiKey) {
    throw new Error("TIMBLEGLANCE_API_KEY is missing from server environment");
  }
  const url = process.env.TIMBLEGLANCE_URL || DEFAULT_TIMBLEGLANCE_URL;
  return { apiKey, url };
}

function isTruthyFlag(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function looksLikeHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function looksLikeBase64Pdf(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || looksLikeHttpUrl(trimmed)) return false;
  return (
    trimmed.startsWith("data:application/pdf;base64,") ||
    trimmed.startsWith("JVBERi0") ||
    (trimmed.length > 256 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed))
  );
}

function firstMatchingValue(candidates, predicate) {
  for (const candidate of candidates) {
    if (predicate(candidate)) {
      return candidate.trim();
    }
  }
  return null;
}

function findScoreDeep(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;

  const scoreKeys = [
    "bureauscore",
    "credit_score",
    "creditscore",
    "bureau_score",
    "cibil_score",
    "experian_score",
  ];

  if (!Array.isArray(node)) {
    for (const [key, val] of Object.entries(node)) {
      const lower = key.toLowerCase();
      if (scoreKeys.includes(lower) && val !== undefined && val !== null && val !== "") {
        const parsed = parseInt(String(val).trim(), 10);
        if (!Number.isNaN(parsed) && parsed >= 300 && parsed <= 900) {
          return parsed;
        }
      }
    }
    for (const val of Object.values(node)) {
      if (val && typeof val === "object") {
        const found = findScoreDeep(val, depth + 1);
        if (found !== null) return found;
      }
    }
  } else {
    for (const item of node) {
      const found = findScoreDeep(item, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function extractCreditScore(data, result) {
  const responseData = result?.response?.data || result?.data || {};
  const creditReport = responseData?.credit_report || result?.credit_report || {};

  const candidates = [
    creditReport?.SCORE?.BureauScore,
    creditReport?.SCORE?.score,
    responseData?.credit_score,
    responseData?.creditScore,
    responseData?.bureau_score,
    responseData?.score,
    responseData?.SCORE?.BureauScore,
    result?.INProfileResponse?.SCORE?.BureauScore,
    result?.credit_report?.INProfileResponse?.SCORE?.BureauScore,
    result?.data?.INProfileResponse?.SCORE?.BureauScore,
    result?.SCORE?.BureauScore,
    result?.score_details?.score,
    result?.credit_score,
    result?.creditScore,
    result?.bureau_score,
    result?.cibil_score,
    result?.score,
    result?.cCRResponse?.cIRReportDataLst?.[0]?.cIRReportData?.scoreDetails?.[0]?.value,
    data?.credit_score,
    data?.creditScore,
    data?.score,
  ];

  for (const val of candidates) {
    if (val !== undefined && val !== null && val !== "") {
      const parsed = parseInt(String(val).trim(), 10);
      if (!Number.isNaN(parsed) && parsed >= 300 && parsed <= 900) {
        return parsed;
      }
    }
  }

  return findScoreDeep(result);
}

function stripPdfBlobs(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripPdfBlobs);

  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (looksLikeBase64Pdf(val)) continue;
    cleaned[key] = typeof val === "object" && val !== null ? stripPdfBlobs(val) : val;
  }
  return cleaned;
}

/**
 * Call TimbleGlance Experian_Bureau_V2 API.
 * All three fields (`name`, `pan`, `mobile`) are mandatory.
 */
async function requestTimbleGlanceExperian({ name, pan, mobile }) {
  const { apiKey, url } = getTimbleGlanceConfig();

  const requestBody = {
    name: String(name).trim(),
    pan: String(pan).trim().toUpperCase(),
    mobile: String(mobile).trim(),
  };

  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    const data = response.data || {};
    const result =
      data.result && typeof data.result === "object" ? data.result : data.data || {};
    const responseData = result?.response?.data || result?.data || {};
    const creditReport = responseData?.credit_report || result?.credit_report || {};

    const resultKeys = result && typeof result === "object" ? Object.keys(result) : [];
    const responseDataKeys =
      responseData && typeof responseData === "object" ? Object.keys(responseData) : [];
    const creditReportKeys =
      creditReport && typeof creditReport === "object" ? Object.keys(creditReport) : [];

    console.log("[TimbleGlance] Response summary:", {
      httpStatus: response.status,
      response_code: data.response_code,
      success: data.success,
      billable: data.billable,
      transaction_id: data.transaction_id,
      resultKeys,
      responseDataKeys,
      creditReportKeys,
    });

    const urlCandidates = [
      result?.pdf_url,
      result?.result_pdf,
      result?.pdf_report,
      result?.report_pdf_url,
      result?.report_url,
      result?.pdf_link,
      result?.report_link,
      result?.s3_url,
      result?.download_url,
      result?.redirect_url,
      result?.url,
      responseData?.pdf_url,
      responseData?.result_pdf,
      responseData?.report_url,
      responseData?.redirect_url,
      responseData?.url,
      data?.pdf_url,
      data?.result_pdf,
      data?.report_url,
      data?.redirect_url,
      data?.url,
    ];

    const base64Candidates = [
      result?.pdf_base64,
      result?.pdf_report,
      result?.result_pdf,
      result?.report_pdf,
      result?.pdf,
      result?.base64,
      responseData?.pdf_base64,
      responseData?.pdf_report,
      responseData?.pdf,
      data?.pdf_base64,
      data?.pdf,
    ];

    const pdfUrl = firstMatchingValue(urlCandidates, looksLikeHttpUrl);
    const pdfBase64 = pdfUrl ? null : firstMatchingValue(base64Candidates, looksLikeBase64Pdf);
    const creditScore = extractCreditScore(data, result);
    const hasStructuredResult = resultKeys.length > 0;
    const isSuccess =
      isTruthyFlag(data.success) || data.response_code === 100 || data.response_code === 200;

    if (!isSuccess && !pdfUrl && !pdfBase64 && !hasStructuredResult) {
      const err = new Error(
        data.response_message || data.message || "Could not retrieve Experian report."
      );
      err.status = response.status >= 400 ? response.status : 400;
      err.responseCode = data.response_code;
      err.transactionId = data.transaction_id;
      throw err;
    }

    const reportData = hasStructuredResult ? stripPdfBlobs(result) : null;

    return {
      status: response.status,
      success: true,
      pdfUrl,
      pdfBase64,
      creditScore,
      reportData,
      transactionId: data.transaction_id || null,
      responseCode: data.response_code || 200,
      message: data.response_message || data.message || "Experian report retrieved successfully",
    };
  } catch (error) {
    const upstreamData = error.response?.data;
    if (upstreamData) {
      console.error("[TimbleGlance] Upstream error summary:", {
        httpStatus: error.response?.status,
        response_code: upstreamData.response_code,
        response_message: upstreamData.response_message || upstreamData.message,
        billable: upstreamData.billable,
        transaction_id: upstreamData.transaction_id,
      });
    } else {
      console.error("[TimbleGlance] Request error:", error.message);
    }
    throw error;
  }
}

module.exports = {
  requestTimbleGlanceExperian,
};
