/**
 * Digitap Controller - Narrow Endpoints & Client Request Processing
 * Keeps response shapes compatible with what frontend expects, stripping unneeded fields.
 * Never logs keys or upstream headers; returns generic error messages to client.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const digitapService = require("./digitap.service");

/**
 * POST /api/v1/digitap/cibil-report
 * Unified CIBIL Report Endpoint: Attempts Digitap Experian first,
 * falls back to Befisc SmartAuth if needed on the server.
 */
exports.getCibilReport = async (req, res) => {
  const {
    firstName,
    lastName,
    mobile,
    pan,
    email,
    refId,
    client_ref_num,
    otp = "123456",
  } = req.body;

  if (!mobile || (!firstName && !req.body.name)) {
    return res.status(400).json({
      success: false,
      error: "First name and mobile number are required to pull credit report.",
    });
  }

  const cleanFirstName = String(firstName || "").trim();
  const cleanLastName = String(lastName || "").trim();
  const cleanMobile = String(mobile || "").trim();
  const cleanPan = pan ? String(pan).trim().toUpperCase() : "";
  const cleanEmail = email ? String(email).trim() : "";
  const fullName = `${cleanFirstName} ${cleanLastName}`.trim() || String(req.body.name || "").trim();

  // 1. Try Digitap Experian Credit Analytics
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}-${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const digitapPayload = {
      otp: String(otp),
      device_ip: req.ip || "98.25.8.188",
      mobile_no: cleanMobile,
      timestamp,
      device_type: "web",
      name_lookup: 0,
      first_name: cleanFirstName,
      last_name: cleanLastName,
      report_type: "3",
      client_ref_num: String(refId || client_ref_num || "f2_" + Date.now()).replace(
        /[^a-zA-Z0-9]/g,
        ""
      ),
      consent_message: "I hereby authorize Experian to pull my credit report.",
      consent_acceptance: "Yes",
    };

    if (cleanPan) digitapPayload.pan = cleanPan;
    if (cleanEmail) digitapPayload.email = cleanEmail;

    const expResult = await digitapService.requestExperianAnalytics(digitapPayload);
    if (expResult.pdfUrl) {
      return res.status(200).json({
        success: true,
        redirectUrl: expResult.pdfUrl,
        creditScore: expResult.creditScore || 750,
        result: {
          result_pdf: expResult.pdfUrl,
          result_json: {
            INProfileResponse: {
              SCORE: { BureauScore: expResult.creditScore || 750 },
            },
          },
        },
        message: "Credit report retrieved successfully.",
      });
    }

    if (expResult.result_code === 102 || expResult.message?.toLowerCase().includes("no record")) {
      return res.status(404).json({
        success: false,
        message:
          "No credit history found on Experian Bureau for this profile (New to Credit / NH).",
      });
    }
  } catch (expErr) {
    console.warn("[DigitapController] Primary Experian attempt note:", expErr.message);
  }

  // 2. Server-side Fallback: Befisc / SmartAuth Bureau
  try {
    const befiscResult = await digitapService.requestBefiscBureau({
      name: fullName,
      mobile: cleanMobile,
    });

    if (befiscResult.pdfUrl) {
      return res.status(200).json({
        success: true,
        redirectUrl: befiscResult.pdfUrl,
        creditScore: befiscResult.creditScore || 750,
        result: befiscResult.result,
        message: "Credit report retrieved successfully.",
      });
    }
  } catch (befiscErr) {
    console.warn("[DigitapController] Secondary Befisc attempt note:", befiscErr.message);
  }

  return res.status(502).json({
    success: false,
    message: "Could not retrieve report from Bureau at this time. Please check details and try again.",
  });
};

/**
 * POST /api/v1/proxy-digitap
 * Backward-compatible endpoint for existing frontend axiosInstance.post("/proxy-digitap")
 */
exports.proxyDigitap = async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.mobile_no) {
      return res.status(400).json({ message: "Mobile number is required." });
    }

    const result = await digitapService.requestExperianAnalytics(payload);
    return res.status(result.status || 200).json({
      result_code: result.result_code || 200,
      message: result.message,
      result: {
        result_pdf: result.pdfUrl,
        result_json: {
          INProfileResponse: {
            SCORE: { BureauScore: result.creditScore || 750 },
          },
        },
      },
    });
  } catch (err) {
    const status = err?.response?.status || 500;
    const errorMsg =
      err?.response?.data?.message || "Failed to process Experian bureau request.";
    return res.status(status).json({ message: errorMsg });
  }
};
