/**
 * Customer Support, Application Status, Missing Document Guidance & Escalation Service
 * Enforces strict authentication / verified OTP session + ownership checks before
 * returning any customer application, document, or personal status data.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const crypto = require("crypto");
const CustomerModel = require("../../../model/customer");
const CustomerInfoModel = require("../../../model/customer_info");
const CustomerApplication = require("../../../model/customer_application");
const CustomerDocumentModel = require("../../../model/customer_document");
const LoanTrackingModel = require("../../../model/loan_tracking");
const QueryModel = require("../../../model/query");
const NotificationModel = require("../../../model/notification");
const { LoanFormConfig, ChatbotSession, ChatbotAnalyticsEvent } = require("../../../model/chatbot");
const sendEmail = require("../../../utility/email");
const { getOtpEmailOptions } = require("../../../email/templates/emailTemplates");
const Utility = require("../../../utility");

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

/**
 * Send OTP to verify customer identity inside chat before showing personal application records.
 */
async function sendVerificationOtp({ identifier, sessionId, companyId = 101 }) {
  const cleanId = String(identifier || "").trim();
  if (!cleanId) {
    return { success: false, error: "Please provide your registered email address or 10-digit mobile number." };
  }

  const isEmail = cleanId.includes("@");
  const where = isEmail
    ? { email: cleanId.toLowerCase(), company_id: companyId }
    : { contact: cleanId, company_id: companyId };

  let customer = await CustomerModel.findOne({ where });
  if (!customer && !isEmail) {
    customer = await CustomerModel.findOne({ where: { contact: cleanId } });
  }
  if (!customer) {
    return {
      success: false,
      notFound: true,
      error: "No F2 Fintech customer account was found matching this email/mobile number.",
    };
  }

  const otp = String(crypto.randomInt(100000, 999999));
  const storeKey = `${sessionId}:${cleanId.toLowerCase()}`;
  chatOtpStore.set(storeKey, {
    otp,
    customerId: customer.id,
    email: customer.email,
    contact: customer.contact,
    expiry: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  if (customer.email) {
    try {
      const mailOptions = getOtpEmailOptions(customer.email, otp, customer.name);
      await sendEmail(mailOptions);
    } catch (mailErr) {
      console.warn("[SupportService] OTP email dispatch warning:", mailErr.message);
    }
  }

  return {
    success: true,
    maskedEmail: customer.email ? customer.email.replace(/(.{2}).+(@.+)/, "$1***$2") : null,
    message: "A 6-digit verification OTP has been sent to your registered email.",
    ...(process.env.NODE_ENV !== "production" && !process.env.SMTP_PASS ? { devOtpPreview: otp } : {}),
  };
}

/**
 * Verify in-chat OTP and bind customer_id securely to ChatbotSession.
 */
async function verifyChatOtp({ identifier, otp, sessionId }) {
  const cleanId = String(identifier || "").trim().toLowerCase();
  const storeKey = `${sessionId}:${cleanId}`;
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
  if (String(otp).trim() !== entry.otp) {
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

/**
 * Fetch authenticated customer's applications, tracking statuses, and missing document gaps.
 */
async function getCustomerApplicationStatus({ customerId, applicationNo = null, companyId = 101, language = "en" }) {
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

  const where = { customer_id: customerId };
  if (applicationNo) {
    where.application_no = Number(applicationNo);
  }

  const applications = await CustomerApplication.findAll({
    where,
    order: [["application_date", "DESC"]],
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

  const uploadedDocs = await CustomerDocumentModel.findAll({
    where: { customer_id: customerId },
    attributes: ["id", "type", "document_url", "created_at"],
  });
  const uploadedTypes = new Set(uploadedDocs.map((d) => String(d.type).toLowerCase()));

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

    const statusKey = String(tracking?.status || "submitted").toLowerCase();
    const statusInfo = STATUS_EXPLANATIONS[statusKey] || STATUS_EXPLANATIONS.submitted;

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

    detailed.push({
      applicationId: app.id,
      applicationNo: app.application_no,
      provider: app.provider,
      loanType: app.loan_type,
      loanCategory: app.loan_category,
      amount: app.amount ? Number(app.amount) : null,
      tenure: app.tenure,
      applicationDate: app.application_date,
      trackingStatus: tracking?.status || "submitted",
      trackingUpdatedAt: tracking?.updated_at || app.application_date,
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
async function updateCustomerApplicationDetails({ customerId, applicationId = null, updates = {} }) {
  if (!customerId) {
    throw new Error("Unauthorized: verified identity required to modify application details.");
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
    if (updates[key] !== undefined && updates[key] !== null && updates[key] !== "") {
      infoUpdate[key] = updates[key];
    }
  }

  if (Object.keys(infoUpdate).length > 0) {
    await CustomerInfoModel.update(infoUpdate, { where: { customer_id: customerId } });
  }

  if (applicationId && (updates.amount !== undefined || updates.tenure !== undefined)) {
    const app = await CustomerApplication.findOne({
      where: { id: applicationId, customer_id: customerId },
    });
    if (!app) {
      throw new Error("Application not found or access denied.");
    }
    const appUpdate = {};
    if (updates.amount !== undefined) appUpdate.amount = updates.amount;
    if (updates.tenure !== undefined) appUpdate.tenure = parseInt(updates.tenure, 10) || app.tenure;
    await app.update(appUpdate);
  }

  return {
    success: true,
    updatedInfoFields: Object.keys(infoUpdate),
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

module.exports = {
  SUPPORT_CHANNELS,
  sendVerificationOtp,
  verifyChatOtp,
  resolveAuthorizedCustomerId,
  getCustomerApplicationStatus,
  updateCustomerApplicationDetails,
  escalateSupportIssue,
};

