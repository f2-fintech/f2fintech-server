/**
 * Bureau Controller - TimbleGlance Experian Bureau V2 Integration
 * Enforces mandatory name, pan, and mobile fields and returns normalized report output.
 * Never logs API keys or upstream auth headers.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const digitapService = require("./digitap.service");

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const MOBILE_REGEX = /^[0-9]{10}$/;

/**
 * POST /api/v1/digitap/cibil-report
 * Calls TimbleGlance Experian_Bureau_V2 with mandatory { name, pan, mobile }.
 */
exports.getCibilReport = async (req, res) => {
  const { name, firstName, lastName, mobile, pan } = req.body || {};

  const cleanName = String(
    name || `${firstName || ""} ${lastName || ""}`
  )
    .trim()
    .replace(/\s+/g, " ");
  const cleanPan = String(pan || "").trim().toUpperCase();
  const cleanMobile = String(mobile || "").trim();

  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Full name is required to pull credit report.",
    });
  }

  if (!PAN_REGEX.test(cleanPan)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-character PAN number is required (e.g. ABCDE1234F).",
    });
  }

  if (!MOBILE_REGEX.test(cleanMobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required.",
    });
  }

  try {
    const expResult = await digitapService.requestTimbleGlanceExperian({
      name: cleanName,
      pan: cleanPan,
      mobile: cleanMobile,
    });

    const hasReport =
      Boolean(expResult.pdfUrl) ||
      Boolean(expResult.pdfBase64) ||
      Boolean(expResult.reportData && Object.keys(expResult.reportData).length > 0);

    if (!hasReport) {
      return res.status(404).json({
        success: false,
        message:
          expResult.message ||
          "No credit history found on Experian Bureau for this profile (New to Credit / NH).",
        transactionId: expResult.transactionId || null,
      });
    }

    return res.status(200).json({
      success: true,
      redirectUrl: expResult.pdfUrl || null,
      pdfBase64: expResult.pdfBase64 || null,
      creditScore: expResult.creditScore || null,
      reportData: expResult.reportData || null,
      transactionId: expResult.transactionId || null,
      bureau: "Experian V2",
      message: expResult.message || "Credit report retrieved successfully.",
    });
  } catch (err) {
    const upstreamStatus = err?.response?.status || err?.status;
    const upstreamData = err?.response?.data || {};
    const upstreamMsg =
      upstreamData.response_message ||
      upstreamData.message ||
      err.message ||
      "Could not retrieve report from Bureau at this time.";
    const upstreamCode = upstreamData.response_code || err.responseCode;

    if (upstreamCode === 102 || upstreamStatus === 400 || upstreamStatus === 404) {
      return res.status(upstreamStatus === 404 ? 404 : 400).json({
        success: false,
        responseCode: upstreamCode,
        transactionId: upstreamData.transaction_id || err.transactionId || null,
        message: upstreamMsg,
      });
    }

    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return res.status(502).json({
        success: false,
        message: "Bureau service authentication failed. Please contact support.",
      });
    }

    return res.status(502).json({
      success: false,
      message: upstreamMsg,
    });
  }
};

/**
 * POST /api/v1/proxy-digitap
 * Retired legacy Digitap proxy endpoint.
 */
exports.proxyDigitap = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: "Legacy Digitap proxy has been retired. Use /api/v1/digitap/cibil-report.",
  });
};
