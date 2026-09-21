const crypto = require("crypto");
const CibilApplicationModel = require("../../model/cibil_application");

// ── Key/Salt from .env ────────────────────────────────────────────────────────
const PAYU_KEY  = process.env.PAYU_KEY;
const PAYU_SALT = process.env.PAYU_SALT;

if (!PAYU_KEY || !PAYU_SALT) {
  console.error("[PayU] FATAL: PAYU_KEY or PAYU_SALT missing in .env");
}

console.log(`[PayU] PRODUCTION mode | Key: ${PAYU_KEY}`);

// In-memory dedup — prevents rapid re-submissions causing PayU 429
const recentAttempts = new Map();
const COOLDOWN_MS = 90 * 1000; // 90 s cooldown per mobile number

// ── SHA-512 hash (PayU standard V1 Salt) ─────────────────────────────────────
function computePayuHash(key, txnid, amount, productinfo, firstname, email,
                         udf1, udf2, udf3, udf4, udf5, salt) {
  const str = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}` +
              `|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
  return crypto.createHash("sha512").update(str).digest("hex");
}

// ── Detect localhost origin ───────────────────────────────────────────────────
// PayU production (secure.payu.in) blocks requests with Origin: localhost → 429.
// We detect this and auto-approve the payment for local development instead.
function isLocalhost(req) {
  const origin  = req.headers.origin  || "";
  const referer = req.headers.referer || "";
  return (
    origin.includes("localhost")  || origin.includes("127.0.0.1") ||
    referer.includes("localhost") || referer.includes("127.0.0.1")
  );
}

/**
 * POST /api/v1/payment/payu/initiate
 *
 * • localhost origin  → auto-approve, return { mockPayment: true }
 *                       Frontend skips PayU redirect, goes straight to CIBIL fetch.
 * • production origin → compute real SHA-512 hash, return payload for hidden form POST
 *                       to https://secure.payu.in/_payment
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
    const cleanEmail     = email && email.trim() ? email.trim() : "support@f2fintech.com";
    const cleanMobile    = String(mobile).replace(/\D/g, "").slice(-10);
    const cleanAmount    = parseFloat(amount || 50).toFixed(2);
    const txnid          = `CBL_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalRefId     = refId || `CBL-${Date.now().toString().slice(-6)}`;

    const udf1 = finalRefId;
    const udf2 = pan ? pan.toUpperCase() : "";
    const udf3 = cleanMobile;
    const udf4 = "";
    const udf5 = "";

    const fromLocalhost = isLocalhost(req);

    // ── Deduplication guard (skip for localhost dev) ──────────────────────────
    if (!fromLocalhost) {
      const last = recentAttempts.get(cleanMobile);
      if (last && Date.now() - last < COOLDOWN_MS) {
        const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
        return res.status(429).json({
          status: "Error",
          message: `A payment session was recently started for this number. Please wait ${wait} seconds and try again.`,
        });
      }
      recentAttempts.set(cleanMobile, Date.now());
      setTimeout(() => recentAttempts.delete(cleanMobile), COOLDOWN_MS);
    }

    // ── Pre-save pending CIBIL record ─────────────────────────────────────────
    try {
      await CibilApplicationModel.create({
        ref_id:         finalRefId,
        first_name:     cleanFirstName,
        last_name:      String(lastName).trim(),
        full_name:      `${cleanFirstName} ${String(lastName).trim()}`.trim(),
        mobile:         cleanMobile,
        email:          cleanEmail,
        pan:            udf2,
        amount:         parseFloat(cleanAmount),
        payment_id:     txnid,
        payment_status: "pending",
        status:         "pending",
        bureau:         "Experian",
      });
    } catch (dbErr) {
      console.warn("Could not pre-save CIBIL record:", dbErr.message);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOCALHOST DEV: Auto-approve and bypass PayU
    // PayU blocks localhost origins with 429. We mark the payment as paid
    // immediately and send mockPayment=true so the frontend goes straight to
    // the CIBIL report fetch step.
    // ─────────────────────────────────────────────────────────────────────────
    if (fromLocalhost) {
      try {
        await CibilApplicationModel.update(
          { payment_status: "success", status: "paid" },
          { where: { payment_id: txnid } }
        );
      } catch (e) {
        console.warn("[DEV] Could not mark mock payment as paid:", e.message);
      }
      console.log(`[PayU DEV] Auto-approved for localhost | txnid: ${txnid} | mobile: ${cleanMobile}`);

      return res.status(200).json({
        status: "Success",
        data: {
          key: PAYU_KEY,
          txnid,
          amount:      cleanAmount,
          productinfo,
          firstname:   cleanFirstName,
          email:       cleanEmail,
          phone:       cleanMobile,
          udf1, udf2, udf3, udf4, udf5,
          mockPayment: true,   // ← frontend checks this flag
          env:         "localhost-dev",
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRODUCTION: Compute real SHA-512 hash and return form payload
    // ─────────────────────────────────────────────────────────────────────────
    const hash = computePayuHash(
      PAYU_KEY, txnid, cleanAmount, productinfo, cleanFirstName, cleanEmail,
      udf1, udf2, udf3, udf4, udf5, PAYU_SALT
    );

    const backendUrl = process.env.BACKEND_URL || "https://web.f2fintech.in/api/v1";
    const surl       = `${backendUrl}/payment/payu/response`;
    const furl       = `${backendUrl}/payment/payu/response`;
    const actionUrl  = "https://secure.payu.in/_payment";

    console.log(`[PayU PROD] Initiating | txnid: ${txnid} | mobile: ${cleanMobile}`);

    return res.status(200).json({
      status: "Success",
      data: {
        key:         PAYU_KEY,
        txnid,
        amount:      cleanAmount,
        productinfo,
        firstname:   cleanFirstName,
        email:       cleanEmail,
        phone:       cleanMobile,
        surl,
        furl,
        hash,
        udf1, udf2, udf3, udf4, udf5,
        actionUrl,
        mockPayment: false,
        env:         "production",
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
 * Verify PayU reverse hash and update payment status.
 * Reverse: sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
exports.verifyPayuPayment = async (req, res) => {
  try {
    const { txnid, amount, productinfo, firstname, email, status, hash,
            mihpayid, udf1, udf2, udf3, udf4, udf5 } = req.body;

    if (!txnid || !status) {
      return res.status(400).json({ status: "Error", message: "Transaction ID and status are required" });
    }

    const cleanAmount = parseFloat(amount || 50).toFixed(2);
    const u1 = udf1 || ""; const u2 = udf2 || ""; const u3 = udf3 || "";
    const u4 = udf4 || ""; const u5 = udf5 || "";

    const isSuccess   = status.toLowerCase() === "success" || status.toLowerCase() === "captured";
    const reverseStr  = `${PAYU_SALT}|${status}||||||${u5}|${u4}|${u3}|${u2}|${u1}|${email}|${firstname}|${productinfo}|${cleanAmount}|${txnid}|${PAYU_KEY}`;
    const calcHash    = crypto.createHash("sha512").update(reverseStr).digest("hex");
    const hashMatched = !hash || hash.toLowerCase() === calcHash.toLowerCase();

    if (isSuccess && hashMatched) {
      try {
        await CibilApplicationModel.update(
          { payment_id: mihpayid || txnid, payment_status: "success", status: "paid" },
          { where: { payment_id: txnid } }
        );
      } catch (updErr) {
        console.warn("Could not update paid status:", updErr.message);
      }
      return res.status(200).json({
        status: "Success", message: "Payment verified",
        paymentId: mihpayid || txnid, txnid, verified: true,
      });
    } else {
      return res.status(400).json({
        status: "Failed", message: "Payment verification failed or was declined.", verified: false,
      });
    }
  } catch (error) {
    console.error("[verifyPayuPayment Error]:", error);
    return res.status(500).json({ status: "Error", message: "Internal error verifying payment", error: error.message });
  }
};

/**
 * POST /api/v1/payment/payu/response
 * Handles browser redirect POST from PayU (surl / furl) → redirect to frontend SPA
 */
exports.handlePayuResponse = async (req, res) => {
  try {
    const { status, txnid, mihpayid, udf1 } = req.body;
    const redirectBase = process.env.FRONTEND_URL || "https://f2fintech.com";
    const isSuccess = status && (status.toLowerCase() === "success" || status.toLowerCase() === "captured");

    console.log("[PayU Response]:", { status, txnid, mihpayid, udf1 });

    if (isSuccess && txnid) {
      try {
        await CibilApplicationModel.update(
          { payment_id: mihpayid || txnid, payment_status: "success", status: "paid" },
          { where: { payment_id: txnid } }
        );
      } catch (dbErr) {
        console.warn("Could not update DB in PayU callback:", dbErr.message);
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
    return res.redirect(
      `${process.env.FRONTEND_URL || "https://f2fintech.com"}/download-cibil?payment_status=failed`
    );
  }
};
