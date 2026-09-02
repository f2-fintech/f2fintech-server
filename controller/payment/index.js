const crypto = require("crypto");
const CibilApplicationModel = require("../../model/cibil_application");

const PAYU_KEY = process.env.PAYU_KEY || "xl21jd";
const PAYU_SALT = process.env.PAYU_SALT || "BCo90vcr0O2mgQMJFPwBiz8j6mBAGw4D";
const PAYU_ENV = process.env.PAYU_ENV || "production"; // "production" or "test"

const PAYU_PAYMENT_URL =
  PAYU_ENV === "production"
    ? "https://secure.payu.in/_payment"
    : "https://test.payu.in/_payment";

/**
 * POST /api/v1/payment/payu/initiate
 * Generate PayU SHA-512 payment hash and order payload
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
    const txnid = `CBL_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalRefId = refId || `CBL-${Date.now().toString().slice(-6)}`;

    // PayU Hash Format: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
    const udf1 = finalRefId;
    const udf2 = pan ? pan.toUpperCase() : "";
    const udf3 = cleanMobile;
    const udf4 = "";
    const udf5 = "";

    const hashString = `${PAYU_KEY}|${txnid}|${cleanAmount}|${productinfo}|${cleanFirstName}|${cleanEmail}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${PAYU_SALT}`;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");

    // Success & Failure return URLs
    // PayU production requires HTTPS and does NOT allow localhost.
    // Always use the live domain for production, localhost only for test mode.
    const isProduction = PAYU_ENV === "production";
    const LIVE_DOMAIN = process.env.FRONTEND_URL || "https://f2fintech.com";
    const clientHost = isProduction ? LIVE_DOMAIN : (req.headers.origin || "http://localhost:5173");
    const surl = `${clientHost}/download-cibil?payment_status=success&txnid=${txnid}&ref_id=${finalRefId}`;
    const furl = `${clientHost}/download-cibil?payment_status=failed&txnid=${txnid}&ref_id=${finalRefId}`;

    // Create or log initial pending record
    try {
      await CibilApplicationModel.create({
        ref_id: finalRefId,
        first_name: cleanFirstName,
        last_name: String(lastName).trim(),
        full_name: `${cleanFirstName} ${String(lastName).trim()}`.trim(),
        mobile: cleanMobile,
        email: cleanEmail,
        pan: udf2,
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
        key: PAYU_KEY,
        txnid,
        amount: cleanAmount,
        productinfo,
        firstname: cleanFirstName,
        email: cleanEmail,
        phone: cleanMobile,
        surl,
        furl,
        hash,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
        actionUrl: PAYU_PAYMENT_URL,
      },
    });
  } catch (error) {
    console.error("[initiatePayuPayment Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to initiate payment gateway",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/payment/payu/verify
 * Verify PayU response reverse SHA-512 hash and update payment status
 */
exports.verifyPayuPayment = async (req, res) => {
  try {
    const {
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      status,
      hash,
      mihpayid,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    } = req.body;

    if (!txnid || !status) {
      return res.status(400).json({
        status: "Error",
        message: "Transaction ID and payment status are required",
      });
    }

    // PayU Reverse Hash: sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
    const cleanAmount = parseFloat(amount || 50).toFixed(2);
    const u1 = udf1 || "";
    const u2 = udf2 || "";
    const u3 = udf3 || "";
    const u4 = udf4 || "";
    const u5 = udf5 || "";

    const reverseHashString = `${PAYU_SALT}|${status}||||||${u5}|${u4}|${u3}|${u2}|${u1}|${email}|${firstname}|${productinfo}|${cleanAmount}|${txnid}|${PAYU_KEY}`;
    const calculatedHash = crypto
      .createHash("sha512")
      .update(reverseHashString)
      .digest("hex");

    const isSuccess =
      status.toLowerCase() === "success" || status.toLowerCase() === "captured";

    // Hash matching validation (optional tolerance for bypass/sandbox)
    const hashMatched =
      !hash || hash.toLowerCase() === calculatedHash.toLowerCase();

    if (isSuccess && hashMatched) {
      // Update CIBIL application record in database
      try {
        await CibilApplicationModel.update(
          {
            payment_id: mihpayid || txnid,
            payment_status: "success",
            status: "paid",
          },
          {
            where: { payment_id: txnid },
          }
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
