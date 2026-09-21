const PayU = require("payu-websdk").default || require("payu-websdk");
const CibilApplicationModel = require("../../model/cibil_application");

const PAYU_ENV = (process.env.PAYU_ENV || "production").toUpperCase();
const isTest = PAYU_ENV === "TEST";

const payuClient = new PayU(
  {
    key: process.env.PAYU_KEY,
    salt: process.env.PAYU_SALT,
  },
  isTest ? "TEST" : "PROD"
);

console.log(`[PayU] Initialized official SDK in ${isTest ? "TEST" : "PROD"} mode with Key: ${process.env.PAYU_KEY}`);

/**
 * POST /api/v1/payment/payu/initiate
 * Generate PayU payment payload and auto-submitting HTML form via official payu-websdk
 */
exports.initiatePayuPayment = async (req, res) => {
  try {
    const {
      amount = 50,
      firstName,
      lastName = "",
      email = "",
      mobile,
      pan = "",
      refId,
      productinfo = "Official Experian CIBIL Credit Report",
    } = req.body;

    if (!mobile || !firstName) {
      return res.status(400).json({
        status: "Error",
        message: "Customer name and mobile number are required for payment.",
      });
    }

    const cleanFirstName = String(firstName).trim();
    const cleanEmail = email && email.trim() ? email.trim() : "support@f2fintech.com";
    const cleanMobile = String(mobile).replace(/\D/g, "").slice(-10);
    const cleanAmount = parseFloat(amount || 50).toFixed(2);
    const txnid = `TXN_${Date.now()}`;
    const finalRefId = refId || `CBL-${Date.now().toString().slice(-6)}`;

    const backendUrl = process.env.BACKEND_URL || "https://web.f2fintech.in/api/v1";
    const surl = `${backendUrl}/payment/payu/response`;
    const furl = `${backendUrl}/payment/payu/response`;

    const basePayload = {
      txnid,
      amount: cleanAmount,
      productinfo: productinfo || "Official Experian CIBIL Credit Report",
      firstname: cleanFirstName,
      email: cleanEmail,
      phone: cleanMobile,
      surl,
      furl,
      udf1: finalRefId,
      udf2: pan ? pan.toUpperCase() : "",
      udf3: cleanMobile,
      udf4: "",
      udf5: "",
    };

    const html = payuClient.paymentInitiate(basePayload);

    // Pre-save pending CIBIL application record
    try {
      await CibilApplicationModel.create({
        ref_id: finalRefId,
        first_name: cleanFirstName,
        last_name: String(lastName).trim(),
        full_name: `${cleanFirstName} ${String(lastName).trim()}`.trim(),
        mobile: cleanMobile,
        email: cleanEmail,
        pan: pan ? pan.toUpperCase() : "",
        amount: parseFloat(cleanAmount),
        payment_id: txnid,
        payment_status: "pending",
        status: "pending",
        bureau: "Experian",
      });
    } catch (dbErr) {
      console.warn("Could not pre-save CIBIL payment record:", dbErr.message);
    }

    return res.status(200).json({
      status: "Success",
      data: {
        txnid,
        html,
        key: process.env.PAYU_KEY,
        amount: cleanAmount,
        productinfo: basePayload.productinfo,
        firstname: cleanFirstName,
        email: cleanEmail,
        phone: cleanMobile,
        surl,
        furl,
        hash: basePayload.hash,
        udf1: basePayload.udf1,
        udf2: basePayload.udf2,
        udf3: basePayload.udf3,
        udf4: basePayload.udf4,
        udf5: basePayload.udf5,
        actionUrl: isTest ? "https://test.payu.in/_payment" : "https://secure.payu.in/_payment",
      },
    });
  } catch (error) {
    console.error("[PayU initiatePayuPayment Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to initiate payment gateway",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/payment/payu/verify
 * Verify PayU response hash or via payuClient.verifyPayment
 */
exports.verifyPayuPayment = async (req, res) => {
  try {
    const { txnid, status, mihpayid } = req.body;

    if (!txnid) {
      return res.status(400).json({
        status: "Error",
        message: "Transaction ID is required",
      });
    }

    let isSuccess =
      status && (status.toLowerCase() === "success" || status.toLowerCase() === "captured");

    try {
      const verifyResult = await payuClient.verifyPayment(txnid);
      console.log("[PayU] verifyPayment result:", verifyResult);
      if (verifyResult?.transaction_details?.[txnid]?.status === "success") {
        isSuccess = true;
      }
    } catch (vErr) {
      console.warn("[PayU] verifyPayment API call:", vErr.message);
    }

    if (isSuccess) {
      try {
        await CibilApplicationModel.update(
          {
            payment_id: mihpayid || txnid,
            payment_status: "success",
            status: "paid",
          },
          { where: { payment_id: txnid } }
        );
      } catch (updErr) {
        console.warn("Could not update paid status:", updErr.message);
      }

      return res.status(200).json({
        status: "Success",
        message: "Payment verified successfully",
        paymentId: mihpayid || txnid,
        txnid,
        verified: true,
      });
    } else {
      return res.status(400).json({
        status: "Failed",
        message: "Payment verification failed or was declined.",
        verified: false,
      });
    }
  } catch (error) {
    console.error("[verifyPayuPayment Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal error verifying payment",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/payment/payu/response
 * Handles browser redirect POST from PayU (surl/furl) and redirects to frontend SPA
 */
exports.handlePayuResponse = async (req, res) => {
  try {
    const { status, txnid, mihpayid, udf1 } = req.body;
    const redirectBase = process.env.FRONTEND_URL || "https://f2fintech.com";
    const isSuccess =
      status && (status.toLowerCase() === "success" || status.toLowerCase() === "captured");

    console.log("[PayU Response]:", { status, txnid, mihpayid, udf1 });

    if (isSuccess && txnid) {
      try {
        await CibilApplicationModel.update(
          {
            payment_id: mihpayid || txnid,
            payment_status: "success",
            status: "paid",
          },
          { where: { payment_id: txnid } }
        );
      } catch (dbErr) {
        console.warn("Could not update database in PayU callback:", dbErr.message);
      }

      return res.redirect(
        `${redirectBase}/download-cibil?payment_status=success&txnid=${mihpayid || txnid}&ref_id=${udf1 || ""}`
      );
    } else {
      return res.redirect(
        `${redirectBase}/download-cibil?payment_status=failed&txnid=${txnid || ""}&ref_id=${udf1 || ""}`
      );
    }
  } catch (err) {
    console.error("[handlePayuResponse Error]:", err);
    const redirectBase = process.env.FRONTEND_URL || "https://f2fintech.com";
    return res.redirect(`${redirectBase}/download-cibil?payment_status=failed`);
  }
};
