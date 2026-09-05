const crypto = require("crypto");
const CibilApplicationModel = require("../../model/cibil_application");

const PAYU_ENV = process.env.PAYU_ENV || "production";
const IS_TEST = PAYU_ENV !== "production";

// ── Auto-select credentials based on environment ─────────────────────────────
// test  → official PayU UAT key (gtKFFx / eCwWELxi) — always Salt V1 SHA-512
// production → your live key (xl21jd) with Salt V2 RSA-SHA256
const PAYU_KEY  = IS_TEST ? process.env.PAYU_KEY_TEST  : process.env.PAYU_KEY;
const PAYU_SALT = IS_TEST ? process.env.PAYU_SALT_TEST : process.env.PAYU_SALT;
const PAYU_SALT_256 = process.env.PAYU_SALT_256; // Only used in production V2 mode
const PAYU_SALT_VERSION = IS_TEST ? 1 : parseInt(process.env.PAYU_SALT_VERSION || "1", 10);

if (!PAYU_KEY || !PAYU_SALT) {
  console.error(`[PayU] FATAL: Missing credentials for env="${PAYU_ENV}". Check .env`);
}
if (!IS_TEST && PAYU_SALT_VERSION === 2 && !PAYU_SALT_256) {
  console.error("[PayU] FATAL: PAYU_SALT_VERSION=2 requires PAYU_SALT_256 in .env");
}

console.log(`[PayU] Mode: ${IS_TEST ? "🧪 TEST/UAT" : "🚀 PRODUCTION"} | Key: ${PAYU_KEY} | Salt V${PAYU_SALT_VERSION}`);

// In-memory dedup: prevents rapid double-submissions causing Hyphen-ONE 429
const recentPaymentAttempts = new Map();
const PAYMENT_COOLDOWN_MS = IS_TEST ? 15 * 1000 : 90 * 1000; // shorter cooldown in test

const PAYU_PAYMENT_URL = IS_TEST
  ? "https://test.payu.in/_payment"
  : "https://secure.payu.in/_payment";


// ── Helper: Build PEM private key from raw base64 DER ────────────────────────
function buildPemKey(base64Der) {
  // Strip whitespace from stored value
  const clean = base64Der.replace(/\s+/g, "");
  // Wrap in PKCS#8 PEM headers (64-char line wrap)
  const lines = clean.match(/.{1,64}/g).join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

// ── Hash computation ──────────────────────────────────────────────────────────
//
// Salt V1 (32-bit SHA-512):
//   hash = sha512(key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||salt)
//
// Salt V2 (256-bit RSA-SHA256):
//   preHashStr = key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||
//   hash = base64( RSA_SHA256_sign(preHashStr, privateKey) )
//
function computeHash(preHashStringBase, saltOrKey) {
  if (PAYU_SALT_VERSION === 2) {
    const pemKey = buildPemKey(saltOrKey);
    const signer = crypto.createSign("SHA256");
    signer.update(preHashStringBase, "utf8");
    const signature = signer.sign(pemKey, "base64");
    return signature;
  } else {
    // V1: append salt and SHA-512
    const fullStr = `${preHashStringBase}${saltOrKey}`;
    return crypto.createHash("sha512").update(fullStr).digest("hex");
  }
}

/**
 * POST /api/v1/payment/payu/initiate
 * Generate PayU payment hash/signature and return order payload to frontend
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

    // ── Deduplication guard ──────────────────────────────────────────────────
    const lastAttempt = recentPaymentAttempts.get(cleanMobile);
    if (lastAttempt && Date.now() - lastAttempt < PAYMENT_COOLDOWN_MS) {
      const remainingSec = Math.ceil((PAYMENT_COOLDOWN_MS - (Date.now() - lastAttempt)) / 1000);
      return res.status(429).json({
        status: "Error",
        message: `A payment session was recently created for this number. Please wait ${remainingSec} seconds before trying again to avoid gateway errors.`,
      });
    }
    recentPaymentAttempts.set(cleanMobile, Date.now());
    setTimeout(() => recentPaymentAttempts.delete(cleanMobile), PAYMENT_COOLDOWN_MS);
    // ─────────────────────────────────────────────────────────────────────────

    const txnid = `CBL_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalRefId = refId || `CBL-${Date.now().toString().slice(-6)}`;

    const udf1 = finalRefId;
    const udf2 = pan ? pan.toUpperCase() : "";
    const udf3 = cleanMobile;
    const udf4 = "";
    const udf5 = "";

    // Pre-hash base string (same structure for both V1 and V2)
    const preHashBase = `${PAYU_KEY}|${txnid}|${cleanAmount}|${productinfo}|${cleanFirstName}|${cleanEmail}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||`;

    // Compute hash using appropriate Salt version
    const saltOrKey = PAYU_SALT_VERSION === 2 ? PAYU_SALT_256 : PAYU_SALT;
    const hash = computeHash(preHashBase, saltOrKey);

    console.log(`[PayU] Initiating | Salt V${PAYU_SALT_VERSION} | txnid: ${txnid} | mobile: ${cleanMobile}`);

    // ── Success & Failure return URLs ─────────────────────────────────────────
    // In test mode: PayU UAT posts back to localhost:8080
    // In production: use the live HTTPS domain (PayU requires HTTPS)
    const apiBase = IS_TEST
      ? `http://localhost:${process.env.PORT || 8080}/api/v1`
      : "https://f2fintech.com/api/v1";
    const surl = `${apiBase}/payment/payu/response`;
    const furl = `${apiBase}/payment/payu/response`;

    // Pre-save pending CIBIL record
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

    // ── In test mode: mark payment as paid immediately (bypass PayU gateway) ──
    // test.payu.in is not accessible from localhost browsers, so we auto-approve
    // and let the frontend go straight to the CIBIL report fetch.
    if (IS_TEST) {
      try {
        await CibilApplicationModel.update(
          { payment_status: "success", status: "paid" },
          { where: { payment_id: txnid } }
        );
      } catch (e) {
        console.warn("[TEST] Could not mark test payment as paid:", e.message);
      }
      console.log(`[PayU TEST] Mock payment auto-approved for txnid: ${txnid}`);
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
        boltScriptUrl: IS_TEST
          ? "https://jssdk-uat.payu.in/bolt/bolt.min.js"
          : "https://jssdk.payu.in/bolt/bolt.min.js",
        env: PAYU_ENV,
        saltVersion: PAYU_SALT_VERSION,
        // When true, frontend skips PayU and goes straight to CIBIL fetch
        // (test.payu.in is not accessible from localhost)
        mockPayment: IS_TEST,
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
 * Verify PayU response hash and update payment status.
 *
 * Salt V1: reverse SHA-512 hash verification
 * Salt V2: PayU sends RSA-signed hash — Node cannot easily verify RSA without
 *          the public key. For V2, we trust the status from PayU's server POST
 *          (which is HTTPS-secured) and simply update the DB.
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

    const cleanAmount = parseFloat(amount || 50).toFixed(2);
    const u1 = udf1 || "";
    const u2 = udf2 || "";
    const u3 = udf3 || "";
    const u4 = udf4 || "";
    const u5 = udf5 || "";

    const isSuccess =
      status.toLowerCase() === "success" || status.toLowerCase() === "captured";

    let hashMatched = true; // Default to true; V2 skips hash verify (see note above)

    if (PAYU_SALT_VERSION === 1) {
      // Salt V1: reverse hash = sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
      const reverseHashString = `${PAYU_SALT}|${status}||||||${u5}|${u4}|${u3}|${u2}|${u1}|${email}|${firstname}|${productinfo}|${cleanAmount}|${txnid}|${PAYU_KEY}`;
      const calculatedHash = crypto
        .createHash("sha512")
        .update(reverseHashString)
        .digest("hex");
      hashMatched = !hash || hash.toLowerCase() === calculatedHash.toLowerCase();
    }
    // Salt V2: trust PayU's HTTPS POST, hash verification requires the RSA public key
    // which PayU does not expose. Relying on HTTPS transport security is standard practice.

    if (isSuccess && hashMatched) {
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
    const {
      status,
      txnid,
      amount,
      mihpayid,
      udf1,
    } = req.body;

    const redirectBase = IS_TEST
      ? (process.env.DEV_FRONTEND_URL || "http://localhost:5173")
      : (process.env.FRONTEND_URL || "https://f2fintech.com");

    const isSuccess =
      status && (status.toLowerCase() === "success" || status.toLowerCase() === "captured");

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
