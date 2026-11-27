/**
 * Customer Support, Application Status, Missing Document Guidance & Escalation Service
 * Enforces strict authentication / verified OTP session + ownership checks before
 * returning any customer application, document, or personal status data.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const crypto = require("crypto");
const sequelize = require("../../../sequelize");
const { Op } = require("sequelize");
const twilio = require("twilio");
const CustomerModel = require("../../../model/customer");
const CustomerInfoModel = require("../../../model/customer_info");
const CustomerApplication = require("../../../model/customer_application");
const CustomerDocumentModel = require("../../../model/customer_document");
const LoanTrackingModel = require("../../../model/loan_tracking");
const QueryModel = require("../../../model/query");
const NotificationModel = require("../../../model/notification");
const {
  LoanFormConfig,
  ChatbotSession,
  ChatbotAnalyticsEvent,
  syncChatbotModels,
} = require("../../../model/chatbot");
const sendEmail = require("../../../utility/email");
const { getOtpEmailOptions } = require("../../../email/templates/emailTemplates");
const Utility = require("../../../utility");
const { validateUploadedDocument } = require("../utils/fileValidator");
const { projectCustomerRecordByRole, hasPermission } = require("../utils/rbacPolicy");

// Short-lived in-memory OTP store scoped per session+identifier (expires in 10 mins)
const chatOtpStore = new Map();

const STATUS_EXPLANATIONS = {
  submitted: {
    en: "Your application has been submitted and registered in F2 Fintech's queue. Our credit team will verify your documents shortly.",
    hi: "आपका आवेदन सफलतापूर्वक सबमिट हो चुका है। हमारी टीम जल्द ही आपके दस्तावेज़ों की जांच करेगी।",
    nextStep: "Ensure all mandatory KYC and income/bank statement documents are uploaded.",
  },
  "under credit review": {
    en: "Your application and uploaded documents are actively being verified by the credit team.",
    hi: "आपका आवेदन और दस्तावेज़ वर्तमान में क्रेडिट टीम द्वारा जांचे जा रहे हैं।",
    nextStep: "Keep your phone reachable in case our executive requests clarification or additional documents.",
  },
  operations: {
    en: "Your picked application is with the operations team for document & compliance verification.",
    hi: "आपका आवेदन दस्तावेज़ और अनुपालन सत्यापन के लिए ऑपरेशंस टीम के पास है।",
    nextStep: "Ensure all mandatory KYC and income/bank documents are uploaded.",
  },
  "pendency in file": {
    en: "Your application has pending items/documents flagged by the credit team.",
    hi: "क्रेडिट टीम द्वारा आपके आवेदन में कुछ लंबित दस्तावेज़ या विवरण चिह्नित किए गए हैं।",
    nextStep: "Upload any missing documents below or contact your advisor.",
  },
  "file send to banker": {
    en: "Your file has been sent to the lender/banker for credit evaluation and sanction decision.",
    hi: "आपकी फाइल क्रेडिट मूल्यांकन और स्वीकृति निर्णय के लिए बैंकर/लेंडर को भेज दी गई है।",
    nextStep: "Lender underwriting typically updates status within 24–72 hours.",
  },
  "file sent to banker": {
    en: "Your file has been sent to the lender/banker for credit evaluation and sanction decision.",
    hi: "आपकी फाइल क्रेडिट मूल्यांकन और स्वीकृति निर्णय के लिए बैंकर/लेंडर को भेज दी गई है।",
    nextStep: "Lender underwriting typically updates status within 24–72 hours.",
  },
  "to be approved": {
    en: "Your application is in the final approval stage with the credit/lender team.",
    hi: "आपका आवेदन क्रेडिट/लेंडर टीम के पास अंतिम स्वीकृति चरण में है।",
    nextStep: "Approval confirmation will be shared shortly.",
  },
  "to be disbursed": {
    en: "Your loan is approved and queued for disbursement.",
    hi: "आपका लोन स्वीकृत हो चुका है और डिस्बर्समेंट के लिए कतार में है।",
    nextStep: "Complete any final bank/mandate signing steps for payout.",
  },
  hold: {
    en: "Your application is currently on hold pending clarification or document verification.",
    hi: "स्पष्टीकरण या दस्तावेज़ सत्यापन के कारण आपका आवेदन वर्तमान में होल्ड पर है।",
    nextStep: "Check missing documents below or reach support@f2fintech.com.",
  },
  "awaiting response": {
    en: "Our team is awaiting a response or pending information from you/the lender.",
    hi: "हमारी टीम आपकी या लेंडर की प्रतिक्रिया की प्रतीक्षा कर रही है।",
    nextStep: "Keep your phone reachable or upload any missing documents below.",
  },
  disbursed: {
    en: "Congratulations! Your loan amount has been disbursed.",
    hi: "बधाई हो! आपकी लोन राशि सफलतापूर्वक डिस्बर्स (Disbursed) कर दी गई है।",
    nextStep: "Thank you for choosing F2 Fintech.",
  },
  login: {
    en: "Your file has been logged in with the selected lending partner for underwriting.",
    hi: "आपकी फाइल मूल्यांकन के लिए लेंडिंग पार्टनर के पास लॉग-इन हो चुकी है।",
    nextStep: "Lender underwriting typically completes within 24–72 hours.",
  },
  "carry forward": {
    en: "Your application is carried forward pending additional documentation or verification.",
    hi: "अतिरिक्त दस्तावेज़ या सत्यापन के लिए आपका आवेदन आगे बढ़ाया गया है।",
    nextStep: "Check missing documents below or contact support@f2fintech.com for assistance.",
  },
  relook: {
    en: "Your application has been sent for re-evaluation / relook with updated inputs or partner options.",
    hi: "अपडेट की गई जानकारी के साथ आपके आवेदन का पुनः मूल्यांकन किया जा रहा है।",
    nextStep: "Our team will update you once the relook decision is ready.",
  },
  approved: {
    en: "Congratulations! Your loan application has been approved by the lender.",
    hi: "बधाई हो! आपका लोन आवेदन स्वीकृत (Approved) हो गया है।",
    nextStep: "Complete final sanction agreement formalities for disbursal.",
  },
  rejected: {
    en: "This lender application was declined based on underwriting policy.",
    hi: "लेंडर नीति के अनुसार यह आवेदन अस्वीकृत हुआ है।",
    nextStep: "Our advisors can help match you with alternative lenders from our 40+ partner network.",
  },
  drop: {
    en: "This application was marked dropped/closed.",
    hi: "यह आवेदन बंद/ड्रॉप चिह्नित किया गया है।",
    nextStep: "You can start a fresh application or request support review.",
  },
};

const SUPPORT_CHANNELS = {
  supportEmail: "support@f2fintech.com",
  grievanceEmail: "wecare@f2fintech.com",
  helplines: ["+91 81300 60135", "+91 88106 00135", "+91 88606 00555"],
  grievanceOfficer: "Mr. Abhinav Awal (Co-Founder & MD)",
  turnaroundSupport: "Within 7 working days",
  turnaroundGro: "Within 15 working days",
};

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

function normalizePhoneDigits(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

function formatIndianE164(raw) {
  const str = String(raw || "").trim();
  const digits = str.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (str.startsWith("+")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

function getOtpStoreKey(sessionId, identifier) {
  const clean = String(identifier || "").trim();
  if (clean.includes("@")) {
    return `${sessionId}:email:${clean.toLowerCase()}`;
  }
  return `${sessionId}:phone:${normalizePhoneDigits(clean) || clean.toLowerCase()}`;
}

function maskEmailAddress(email) {
  if (!email) return null;
  return String(email).replace(/(.{2}).+(@.+)/, "$1***$2");
}

function maskPhoneNumber(phone) {
  const e164 = formatIndianE164(phone);
  if (!e164 || e164.length < 6) return null;
  return `${e164.slice(0, 3)}******${e164.slice(-4)}`;
}

function formatTwilioErrorHint(err) {
  const code = err?.code;
  if (code === 21608 || code === 60200) {
    return "In Twilio Trial mode, verify this mobile number under Phone Numbers -> Manage -> Verified Caller IDs (or upgrade your Twilio account).";
  }
  if (code === 21408 || code === 60205) {
    return "Enable India (+91) under Messaging / Verify Geo Permissions in your Twilio Console.";
  }
  if (code === 21211) {
    return "The customer mobile number format is invalid for SMS.";
  }
  if (code === 20404) {
    return "Twilio Verify Service SID was not found. Check TWILIO_VERIFY_SERVICE_SID.";
  }
  return err?.message || "SMS dispatch failed.";
}

async function findMatchingCustomersByPhone(rawPhone, companyId = null) {
  const cleanId = String(rawPhone || "").trim();
  const tenDigit = normalizePhoneDigits(cleanId);
  const candidates = Array.from(
    new Set(
      [
        cleanId,
        tenDigit,
        tenDigit ? `+91${tenDigit}` : null,
        tenDigit ? `91${tenDigit}` : null,
        tenDigit ? `0${tenDigit}` : null,
      ].filter(Boolean)
    )
  );
  if (candidates.length === 0) return [];

  if (companyId) {
    const scoped = await CustomerModel.findAll({
      where: { contact: { [Op.in]: candidates }, company_id: companyId },
      order: [["id", "DESC"]],
    });
    if (scoped.length > 0) return scoped;
  }

  return CustomerModel.findAll({
    where: { contact: { [Op.in]: candidates } },
    order: [["id", "DESC"]],
  });
}

async function resolveCustomerIdsForStatus({ customerId, verifiedContact = null, verifiedEmail = null }) {
  const idSet = new Set();
  if (customerId) {
    idSet.add(Number(customerId));
  }

  if (verifiedContact) {
    const phoneCustomers = await findMatchingCustomersByPhone(verifiedContact);
    for (const cust of phoneCustomers) {
      idSet.add(Number(cust.id));
    }
  }

  let emailToMatch = verifiedEmail ? String(verifiedEmail).trim().toLowerCase() : null;
  if (!emailToMatch && customerId) {
    const primary = await CustomerModel.findByPk(customerId, { attributes: ["id", "email"] });
    if (primary?.email) {
      emailToMatch = String(primary.email).trim().toLowerCase();
    }
  }

  if (emailToMatch) {
    const emailCustomers = await CustomerModel.findAll({
      where: { email: emailToMatch },
      attributes: ["id"],
    });
    for (const cust of emailCustomers) {
      idSet.add(Number(cust.id));
    }
  }

  return Array.from(idSet).filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Send OTP to verify customer identity inside chat before showing personal application records.
 */
async function sendVerificationOtp({ identifier, sessionId, companyId = 101 }) {
  const cleanId = String(identifier || "").trim();
  if (!cleanId) {
    return { success: false, error: "Please provide your registered email address or 10-digit mobile number." };
  }

  const isEmail = cleanId.includes("@");
  let matchedCustomers = [];

  if (isEmail) {
    const emailLower = cleanId.toLowerCase();
    matchedCustomers = await CustomerModel.findAll({
      where: { email: emailLower, company_id: companyId },
      order: [["id", "DESC"]],
    });
    if (matchedCustomers.length === 0) {
      matchedCustomers = await CustomerModel.findAll({
        where: { email: emailLower },
        order: [["id", "DESC"]],
      });
    }
  } else {
    matchedCustomers = await findMatchingCustomersByPhone(cleanId, companyId);
  }

  if (matchedCustomers.length === 0) {
    return {
      success: false,
      notFound: true,
      error: "No F2 Fintech customer account was found matching this email/mobile number.",
    };
  }

  // When duplicate customer rows exist for the same phone/email, prefer the newest row that has applications
  let customer = matchedCustomers[0];
  if (matchedCustomers.length > 1) {
    const latestApp = await CustomerApplication.findOne({
      where: { customer_id: { [Op.in]: matchedCustomers.map((c) => c.id) } },
      order: [["application_date", "DESC"], ["id", "DESC"]],
      attributes: ["customer_id"],
    });
    if (latestApp) {
      customer = matchedCustomers.find((c) => c.id === latestApp.customer_id) || customer;
    }
  }

  const otp = String(crypto.randomInt(100000, 999999));
  const storeKey = getOtpStoreKey(sessionId, cleanId);
  const toPhone = customer.contact ? formatIndianE164(customer.contact) : null;
  const maskedEmail = maskEmailAddress(customer.email);
  const maskedPhone = toPhone ? maskPhoneNumber(toPhone) : null;

  const twilioClient = getTwilioClient();
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;

  let smsSent = false;
  let smsErrorHint = null;
  let mode = "local";

  if (!isEmail && twilioClient && toPhone) {
    if (verifyServiceSid) {
      try {
        await twilioClient.verify.v2
          .services(verifyServiceSid)
          .verifications.create({ to: toPhone, channel: "sms" });
        smsSent = true;
        mode = "twilio_verify";
      } catch (twilioErr) {
        smsErrorHint = formatTwilioErrorHint(twilioErr);
        console.warn("[SupportService] Twilio Verify SMS warning:", twilioErr.code, twilioErr.message);
      }
    } else if (twilioFromNumber) {
      try {
        await twilioClient.messages.create({
          from: twilioFromNumber,
          to: toPhone,
          body: `Your F2 Fintech verification OTP is ${otp}. Valid for 10 minutes.`,
        });
        smsSent = true;
        mode = "local";
      } catch (twilioErr) {
        smsErrorHint = formatTwilioErrorHint(twilioErr);
        console.warn("[SupportService] Twilio SMS dispatch warning:", twilioErr.code, twilioErr.message);
      }
    }
  }

  let emailSent = false;
  if (!smsSent && customer.email) {
    try {
      const mailOptions = getOtpEmailOptions(customer.email, otp, customer.name);
      const info = await sendEmail(mailOptions);
      emailSent = Boolean(info);
    } catch (mailErr) {
      console.warn("[SupportService] OTP email dispatch warning:", mailErr.message);
    }
  }

  if (!isEmail && smsErrorHint && !emailSent) {
    return {
      success: false,
      error: `Could not deliver SMS OTP to ${maskedPhone || cleanId}. ${smsErrorHint}`,
    };
  }

  chatOtpStore.set(storeKey, {
    mode,
    otp: mode === "local" ? otp : null,
    toPhone,
    customerId: customer.id,
    email: customer.email,
    contact: customer.contact,
    expiry: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  return {
    success: true,
    smsSent,
    emailSent,
    maskedPhone,
    maskedEmail,
    message: smsSent
      ? `A 6-digit verification OTP has been sent via SMS to ${maskedPhone || toPhone}.`
      : "A 6-digit verification OTP has been sent to your registered email.",
    ...(mode === "local" && process.env.NODE_ENV !== "production" && !emailSent ? { devOtpPreview: otp } : {}),
  };
}

/**
 * Verify in-chat OTP and bind customer_id securely to ChatbotSession.
 */
async function verifyChatOtp({ identifier, otp, sessionId }) {
  const storeKey = getOtpStoreKey(sessionId, identifier);
  const entry = chatOtpStore.get(storeKey);

  if (!entry) {
    return { success: false, error: "No pending OTP verification found. Please request a new OTP." };
  }
  if (Date.now() > entry.expiry) {
    chatOtpStore.delete(storeKey);
    return { success: false, error: "OTP has expired. Please request a new OTP." };
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    chatOtpStore.delete(storeKey);
    return { success: false, error: "Too many failed OTP attempts. Please request a new OTP." };
  }

  const cleanOtp = String(otp || "").trim();
  if (!cleanOtp) {
    return { success: false, error: "Please enter the 6-digit OTP." };
  }

  if (entry.mode === "twilio_verify") {
    const twilioClient = getTwilioClient();
    const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!twilioClient || !verifyServiceSid) {
      return { success: false, error: "Twilio Verify service is not configured on the server." };
    }
    try {
      const check = await twilioClient.verify.v2
        .services(verifyServiceSid)
        .verificationChecks.create({ to: entry.toPhone, code: cleanOtp });
      if (check.status !== "approved") {
        return { success: false, error: "Invalid OTP. Please check and try again." };
      }
    } catch (verifyErr) {
      console.warn("[SupportService] Twilio Verify check warning:", verifyErr.code, verifyErr.message);
      if (verifyErr?.code === 20404) {
        chatOtpStore.delete(storeKey);
        return { success: false, error: "OTP has expired or was already used. Please request a new OTP." };
      }
      if (verifyErr?.code === 60202) {
        chatOtpStore.delete(storeKey);
        return { success: false, error: "Too many failed OTP attempts. Please request a new OTP." };
      }
      return { success: false, error: "Failed to verify OTP with Twilio. Please try again." };
    }
  } else if (cleanOtp !== entry.otp) {
    return { success: false, error: "Invalid OTP. Please check and try again." };
  }

  chatOtpStore.delete(storeKey);

  await ChatbotSession.update(
    {
      customer_id: entry.customerId,
      verified_contact: entry.contact,
      verified_email: entry.email,
      otp_verified_at: new Date(),
    },
    { where: { id: sessionId } }
  );

  const token = Utility.getSignedToken(entry.customerId);
  return {
    success: true,
    customerId: entry.customerId,
    token,
    message: "Identity verified successfully. You can now view and manage your applications.",
  };
}

/**
 * Resolve verified customerId from JWT/Session user OR OTP-verified ChatbotSession.
 * Prevents cross-customer data leakage.
 */
async function resolveAuthorizedCustomerId(req, session = null) {
  if (req?.user?.id) {
    return Number(req.user.id);
  }
  if (session && session.customer_id && session.otp_verified_at) {
    return Number(session.customer_id);
  }
  return null;
}

function getUploadedTypesForApplication(app, uploadedDocs) {
  const types = new Set();
  const appId = Number(app.id);
  const appCustomerId = Number(app.customer_id);

  for (const d of uploadedDocs) {
    const urlMatch = String(d.document_url || "").match(/\/app_(\d+)\//i);
    const explicitAppId = d.customer_application_id
      ? Number(d.customer_application_id)
      : urlMatch
        ? Number(urlMatch[1])
        : null;

    if (explicitAppId !== null) {
      // Strictly scoped to the exact application this document was uploaded for
      if (explicitAppId === appId) {
        const cleanType = String(d.type || "").toLowerCase().trim();
        if (cleanType) types.add(cleanType);
      }
    } else if (Number(d.customer_id) === appCustomerId) {
      // Website / legacy uploads without customer_application_id belong strictly to that customer_id's application
      const cleanType = String(d.type || "").toLowerCase().trim();
      if (cleanType) types.add(cleanType);
    }
  }

  return types;
}

/**
 * Fetch authenticated customer's applications, tracking statuses, and missing document gaps.
 */
async function getCustomerApplicationStatus({
  customerId,
  verifiedContact = null,
  verifiedEmail = null,
  applicationNo = null,
  companyId = 101,
  language = "en",
}) {
  if (!customerId) {
    return {
      authorized: false,
      requiresVerification: true,
      message:
        language === "hi"
          ? "अपने आवेदन की स्थिति और दस्तावेज़ देखने के लिए कृपया पहले लॉग-इन करें या पंजीकृत ईमेल/मोबाइल पर OTP से सत्यापन करें।"
          : "To protect your financial privacy, please sign in or verify via OTP on your registered email/mobile before viewing application statuses.",
    };
  }

  await syncChatbotModels();

  const customerIds = await resolveCustomerIdsForStatus({
    customerId,
    verifiedContact,
    verifiedEmail,
  });

  const where = {
    customer_id: customerIds.length > 1 ? { [Op.in]: customerIds } : customerIds[0],
  };
  if (applicationNo) {
    where.application_no = Number(applicationNo);
  }

  const applications = await CustomerApplication.findAll({
    where,
    order: [["application_date", "DESC"], ["id", "DESC"]],
    limit: 10,
  });

  if (!applications || applications.length === 0) {
    return {
      authorized: true,
      hasApplications: false,
      applications: [],
      message:
        language === "hi"
          ? "आपके खाते से जुड़ा कोई लोन आवेदन नहीं मिला। क्या आप नया लोन आवेदन शुरू करना चाहेंगे?"
          : "No loan applications were found for your account yet. Would you like to start a new application?",
    };
  }

  const appIds = applications.map((a) => Number(a.id));
  const uploadedDocs = await CustomerDocumentModel.findAll({
    where: {
      [Op.or]: [
        { customer_id: customerIds.length > 1 ? { [Op.in]: customerIds } : customerIds[0] },
        { customer_application_id: appIds.length > 1 ? { [Op.in]: appIds } : appIds[0] },
      ],
    },
    attributes: ["id", "customer_id", "customer_application_id", "type", "document_url", "created_at"],
  });

  const formConfigs = await LoanFormConfig.findAll({
    where: { company_id: companyId, status: "approved" },
  });
  const configByLoanType = new Map(formConfigs.map((c) => [c.loan_type.toLowerCase(), c]));

  const detailed = [];
  for (const app of applications) {
    const tracking = await LoanTrackingModel.findOne({
      where: { customer_application_id: app.id },
      order: [["updated_at", "DESC"]],
    });

    // Fetch ONLY current ticket status (when application is picked by credit team); never history logs
    let latestTicket = null;
    try {
      const ticketRows = await sequelize.query(
        `SELECT id, status, updated_at
         FROM tickets
         WHERE customer_application_id = :appId
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        {
          replacements: { appId: app.id },
          type: sequelize.QueryTypes.SELECT,
        }
      );
      if (Array.isArray(ticketRows) && ticketRows.length > 0) {
        latestTicket = ticketRows[0];
      }
    } catch (ticketErr) {
      console.warn("[SupportService] Ticket status lookup skipped:", ticketErr.message);
    }

    const isPicked = Number(app.is_picked) === 1 || Boolean(latestTicket);
    const trackingStatus = tracking?.status || "submitted";
    const trackingKey = String(trackingStatus).toLowerCase().trim();
    const ticketStatus = latestTicket?.status || null;
    const ticketKey = ticketStatus ? String(ticketStatus).toLowerCase().trim() : null;

    // If credit team has picked the file and ticket status is more specific than "submitted", use its explanation
    const primaryStatusKey =
      isPicked && ticketKey && trackingKey === "submitted"
        ? ticketKey
        : trackingKey;
    const statusInfo =
      STATUS_EXPLANATIONS[primaryStatusKey] ||
      (ticketKey && STATUS_EXPLANATIONS[ticketKey]) ||
      STATUS_EXPLANATIONS.submitted;

    // Match documents strictly to THIS application (never leak documents across applications)
    const uploadedTypes = getUploadedTypesForApplication(app, uploadedDocs);

    const cfg = configByLoanType.get(String(app.loan_type || "").toLowerCase());
    const mandatoryDocs = cfg?.mandatory_documents_json || [
      { type: "aadhaar front", label: "Aadhaar Card (Front)" },
      { type: "pancard", label: "PAN Card" },
      { type: "bank statement", label: "Last 6 Months Bank Statement" },
    ];

    const missingDocuments = mandatoryDocs
      .filter((doc) => !uploadedTypes.has(String(doc.type).toLowerCase()))
      .map((doc) => ({ type: doc.type, label: doc.label }));

    const pendingActions = [];
    if (missingDocuments.length > 0) {
      pendingActions.push(`Upload missing mandatory document(s): ${missingDocuments.map((d) => d.label).join(", ")}`);
    }
    if (statusInfo.nextStep) {
      pendingActions.push(statusInfo.nextStep);
    }

    const tenureRaw = app.tenure;
    let tenureYears = null;
    if (tenureRaw !== null && tenureRaw !== undefined && tenureRaw !== "") {
      const num = Number(String(tenureRaw).replace(/[^0-9.]/g, ""));
      if (Number.isFinite(num) && num > 0) {
        tenureYears = app.source === "chatbot" && num > 30 ? Math.max(1, Math.round(num / 12)) : num;
      }
    }
    const tenureLabel = tenureYears ? `${tenureYears} ${tenureYears === 1 ? "Year" : "Years"}` : null;

    detailed.push({
      applicationId: app.id,
      applicationNo: app.application_no,
      provider: app.provider,
      loanType: app.loan_type,
      loanCategory: app.loan_category,
      amount: app.amount ? Number(app.amount) : null,
      tenure: tenureLabel || app.tenure,
      tenureYears,
      tenureUnit: "years",
      applicationDate: app.application_date,
      isPicked,
      trackingStatus,
      trackingUpdatedAt: tracking?.updated_at || app.application_date,
      ticket: isPicked && latestTicket
        ? {
            id: latestTicket.id,
            status: latestTicket.status,
            updatedAt: latestTicket.updated_at,
          }
        : null,
      explanation: language === "hi" ? statusInfo.hi : statusInfo.en,
      uploadedDocumentTypes: Array.from(uploadedTypes),
      missingDocuments,
      pendingActions,
    });
  }

  return {
    authorized: true,
    hasApplications: true,
    applications: detailed,
    supportChannels: SUPPORT_CHANNELS,
  };
}

/**
 * Correct editable customer/application details strictly for verified owner.
 */
async function updateCustomerApplicationDetails({
  customerId,
  verifiedContact = null,
  verifiedEmail = null,
  applicationId = null,
  updates = {},
  companyId = 101,
  language = "en",
}) {
  if (!customerId) {
    throw new Error("Unauthorized: verified identity required to modify application details.");
  }

  const customerIds = await resolveCustomerIdsForStatus({
    customerId,
    verifiedContact,
    verifiedEmail,
  });

  let targetApp = null;
  if (applicationId) {
    targetApp = await CustomerApplication.findOne({
      where: {
        id: Number(applicationId),
        customer_id: customerIds.length > 1 ? { [Op.in]: customerIds } : customerIds[0],
      },
    });
    if (!targetApp) {
      throw new Error("Application not found or access denied.");
    }
  }

  const allowedInfoFields = [
    "working_address",
    "permanent_address",
    "current_address",
    "city",
    "state",
    "zipcode",
    "company",
    "company_official_email",
    "salary",
    "existing_emi",
    "existing_liability",
  ];

  const infoUpdate = {};
  for (const key of allowedInfoFields) {
    if (updates[key] !== undefined && updates[key] !== null && String(updates[key]).trim() !== "") {
      infoUpdate[key] = typeof updates[key] === "string" ? updates[key].trim() : updates[key];
    }
  }

  const targetInfoCustomerIds = targetApp
    ? Array.from(new Set([Number(targetApp.customer_id), ...customerIds]))
    : customerIds;

  if (Object.keys(infoUpdate).length > 0) {
    const primaryTargetCid = targetApp ? Number(targetApp.customer_id) : Number(customerId);
    const existingInfo = await CustomerInfoModel.findOne({
      where: { customer_id: primaryTargetCid },
    });
    if (existingInfo) {
      await CustomerInfoModel.update(infoUpdate, {
        where: {
          customer_id:
            targetInfoCustomerIds.length > 1 ? { [Op.in]: targetInfoCustomerIds } : primaryTargetCid,
        },
      });
    } else {
      await CustomerInfoModel.create({
        customer_id: primaryTargetCid,
        company_id: String(companyId),
        ...infoUpdate,
      });
    }
  }

  const appUpdate = {};
  if (targetApp) {
    if (updates.amount !== undefined && updates.amount !== null && String(updates.amount).trim() !== "") {
      const parsedAmount = Number(String(updates.amount).replace(/,/g, ""));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Please enter a valid loan amount.");
      }
      appUpdate.amount = parsedAmount;
    }
    if (updates.tenure !== undefined && updates.tenure !== null && String(updates.tenure).trim() !== "") {
      const parsedTenure = parseInt(String(updates.tenure).replace(/[^0-9]/g, ""), 10);
      if (!Number.isFinite(parsedTenure) || parsedTenure <= 0) {
        throw new Error("Please enter a valid tenure in years.");
      }
      appUpdate.tenure = Math.min(30, Math.max(1, parsedTenure));
    }
    if (Object.keys(appUpdate).length > 0) {
      await targetApp.update(appUpdate);
    }
  }

  const status = await getCustomerApplicationStatus({
    customerId,
    verifiedContact,
    verifiedEmail,
    companyId,
    language,
  });

  return {
    success: true,
    updatedInfoFields: Object.keys(infoUpdate),
    updatedApplicationFields: Object.keys(appUpdate),
    status,
  };
}

/**
 * Upload a missing document directly against an existing verified customer application.
 */
async function uploadCustomerApplicationDocument({
  customerId,
  verifiedContact = null,
  verifiedEmail = null,
  applicationId = null,
  docType,
  file,
  companyId = 101,
  language = "en",
}) {
  if (!customerId) {
    return {
      success: false,
      unauthorized: true,
      error: "Authentication required to upload documents for an application.",
    };
  }

  const validation = validateUploadedDocument(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  await syncChatbotModels();

  const customerIds = await resolveCustomerIdsForStatus({
    customerId,
    verifiedContact,
    verifiedEmail,
  });

  let targetApp = null;
  if (applicationId) {
    targetApp = await CustomerApplication.findOne({
      where: {
        id: Number(applicationId),
        customer_id: customerIds.length > 1 ? { [Op.in]: customerIds } : customerIds[0],
      },
    });
    if (!targetApp) {
      return { success: false, error: "Application not found or access denied." };
    }
  } else {
    targetApp = await CustomerApplication.findOne({
      where: {
        customer_id: customerIds.length > 1 ? { [Op.in]: customerIds } : customerIds[0],
      },
      order: [["application_date", "DESC"], ["id", "DESC"]],
    });
    if (!targetApp) {
      return {
        success: false,
        error: "Target application not found. Documents can only be uploaded for a specific application.",
      };
    }
  }

  const targetCustomerId = Number(targetApp.customer_id);
  const rawType = String(docType || "certificate").toLowerCase().trim();
  const enumValues = CustomerDocumentModel.rawAttributes?.type?.values || [];
  const validDocType = enumValues.includes(rawType) ? rawType : "certificate";

  const s3Key = `document/customer_${targetCustomerId}/app_${targetApp.id}/${Date.now()}_${validation.safeName}`;
  const docUrl = await Utility.uploadToS3(s3Key, file);

  const createdDoc = await CustomerDocumentModel.create({
    customer_id: targetCustomerId,
    customer_application_id: targetApp.id,
    document_url: docUrl,
    type: validDocType,
    company_id: String(companyId),
  });

  const status = await getCustomerApplicationStatus({
    customerId,
    verifiedContact,
    verifiedEmail,
    companyId,
    language,
  });

  return {
    success: true,
    document: {
      id: createdDoc.id,
      customerApplicationId: targetApp.id,
      applicationNo: targetApp.application_no,
      type: validDocType,
      fileName: validation.safeName,
      document_url: docUrl,
    },
    status,
  };
}

/**
 * Escalate an unresolved customer issue into the existing `query` & `notification` tables.
 */
async function escalateSupportIssue({
  customerId = null,
  sessionId = null,
  title = "general inquiry",
  description,
  contactInfo = null,
  companyId = 101,
}) {
  if (!description || !String(description).trim()) {
    throw new Error("Please provide a brief description of your issue so our support team can assist.");
  }

  const validTitles = new Set([
    "general inquiry",
    "technical support",
    "billing",
    "bank statement",
    "repayment",
    "foreclosure",
    "disbursement",
    "restructuring",
    "grievance",
  ]);
  const cleanTitle = validTitles.has(String(title).toLowerCase()) ? String(title).toLowerCase() : "general inquiry";

  const finalDesc = contactInfo
    ? `${String(description).trim()}\n[Contact Info: ${contactInfo}]`
    : String(description).trim();

  const created = await QueryModel.create({
    customer_id: customerId || null,
    title: cleanTitle,
    description: finalDesc,
    status: "open",
  });

  if (customerId) {
    try {
      await NotificationModel.create({
        customer_id: customerId,
        message: `Support ticket #${created.id} (${cleanTitle}) created via AI Assistant.`,
        type: "support",
        status: "unread",
      });
    } catch (notifErr) {
      console.warn("[SupportService] Notification creation warning:", notifErr.message);
    }
  }

  try {
    await ChatbotAnalyticsEvent.create({
      company_id: companyId,
      session_id: sessionId || null,
      event_type: "support_escalated",
      topic_tag: cleanTitle,
    });
  } catch (e) {
    // non-blocking
  }

  return {
    ticketId: created.id,
    title: cleanTitle,
    status: created.status || "open",
    supportChannels: SUPPORT_CHANNELS,
  };
}

/**
 * Staff role-scoped customer application lookup (masked for support_agent, full KYC for compliance/admin).
 */
async function lookupApplicationForStaff({ role, viewerCustomerId = null, applicationNo = null, customerId = null }) {
  if (!hasPermission(role, "application:read_masked") && !hasPermission(role, "application:read_full_kyc")) {
    return {
      allowed: false,
      error: "Access denied: staff permissions required.",
    };
  }
  await syncChatbotModels();

  const where = {};
  if (applicationNo) where.application_no = Number(applicationNo);
  else if (customerId) where.customer_id = Number(customerId);
  else return { allowed: false, error: "Please specify applicationNo or customerId." };

  const app = await CustomerApplication.findOne({ where, order: [["id", "DESC"]] });
  if (!app) {
    return { allowed: true, found: false, message: "Application record not found." };
  }

  const [customer, customerInfo, tracking, docs] = await Promise.all([
    CustomerModel.findByPk(app.customer_id),
    CustomerInfoModel.findOne({ where: { customer_id: app.customer_id } }),
    LoanTrackingModel.findOne({ where: { customer_application_id: app.id }, order: [["updated_at", "DESC"]] }),
    CustomerDocumentModel.findAll({ where: { customer_id: app.customer_id } }),
  ]);

  const appDocs = docs.filter((d) => !d.customer_application_id || Number(d.customer_application_id) === Number(app.id));

  const projected = projectCustomerRecordByRole({
    role,
    viewerCustomerId,
    ownerCustomerId: app.customer_id,
    customer: customer || {},
    customerInfo: customerInfo || {},
    application: {
      id: app.id,
      applicationNo: app.application_no,
      loanType: app.loan_type,
      provider: app.provider,
      amount: app.amount,
      trackingStatus: tracking?.status || "submitted",
      isPicked: Number(app.is_picked) === 1,
    },
    documents: appDocs,
  });

  return { ...projected, found: true };
}

module.exports = {
  SUPPORT_CHANNELS,
  getUploadedTypesForApplication,
  sendVerificationOtp,
  verifyChatOtp,
  resolveAuthorizedCustomerId,
  getCustomerApplicationStatus,
  lookupApplicationForStaff,
  updateCustomerApplicationDetails,
  uploadCustomerApplicationDocument,
  escalateSupportIssue,
};

