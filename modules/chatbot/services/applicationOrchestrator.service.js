/**
 * Conversational Loan Application Orchestrator
 * Strictly reuses existing F2Fintech application workflow, validations, S3 uploads,
 * duplicate checking, customer/info/application/tracking/document tables.
 * Requires explicit customer confirmation before submitting to backend DB.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const crypto = require("crypto");
const { Op } = require("sequelize");
const sequelize = require("../../../sequelize");
const CustomerModel = require("../../../model/customer");
const CustomerInfoModel = require("../../../model/customer_info");
const CustomerApplication = require("../../../model/customer_application");
const CustomerDocumentModel = require("../../../model/customer_document");
const LoanTrackingModel = require("../../../model/loan_tracking");
const LoanProviderModel = require("../../../model/loan_provider");
const {
  LoanFormConfig,
  ChatbotApplicationDraft,
  ChatbotSession,
  ChatbotAnalyticsEvent,
  ChatbotAuditLog,
  syncChatbotModels,
} = require("../../../model/chatbot");
const Utility = require("../../../utility");
const sendEmail = require("../../../utility/email");
const { getWelcomeEmailOptions } = require("../../../email/templates/emailTemplates");
const { encryptJson, decryptJson, maskPan, maskContact } = require("../utils/piiCrypto");
const { validateUploadedDocument } = require("../utils/fileValidator");

const VALID_PREFIXES = new Set(["mr", "miss", "mrs", "dr", "ca"]);
const VALID_EMPLOYMENT_TYPES = new Set(["salaried", "business", "professional", "self_employed"]);
const VALID_LOAN_TYPES = new Set([
  "personal loan",
  "business loan",
  "professional loan",
  "home loan",
  "education loan",
  "lap",
  "machinery loan",
  "auto loan",
  "just inquiry",
  "doctor",
  "ca_cs_cma",
]);

const SECURED_LOAN_TYPES = new Set(["home loan", "lap", "auto loan", "machinery loan"]);

function normalizeLoanType(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim().replace(/[-_]/g, " ");
  if (s === "loan against property" || s === "lap") return "lap";
  if (s === "doctor loan" || s === "doctor") return "doctor";
  if (s.includes("personal")) return "personal loan";
  if (s.includes("business") || s.includes("msme")) return "business loan";
  if (s.includes("professional")) return "professional loan";
  if (s.includes("home")) return "home loan";
  if (s.includes("education")) return "education loan";
  if (s.includes("auto") || s.includes("car")) return "auto loan";
  if (s.includes("machinery") || s.includes("equipment")) return "machinery loan";
  return VALID_LOAN_TYPES.has(s) ? s : null;
}

function deriveLoanCategory(loanType) {
  return SECURED_LOAN_TYPES.has(loanType) ? "secured" : "unsecured";
}

function parseTenureToMonths(tenureInput) {
  if (tenureInput === null || tenureInput === undefined) return null;
  if (typeof tenureInput === "number") {
    return tenureInput <= 35 ? tenureInput * 12 : tenureInput;
  }
  const str = String(tenureInput).toLowerCase().trim();
  const num = parseInt(str.replace(/[^0-9]/g, ""), 10);
  if (!num || isNaN(num)) return null;
  if (str.includes("year") || str.includes("yr") || str.includes("saal")) {
    return num * 12;
  }
  if (str.includes("month") || str.includes("mo") || str.includes("mahin")) {
    return num;
  }
  return num <= 30 ? num * 12 : num;
}

function parseTenureToYears(tenureInput) {
  const months = parseTenureToMonths(tenureInput);
  if (!months) return null;
  return Math.max(1, Math.round(months / 12));
}

/**
 * Validate fields against exact rules of step1ValidationSchema.jsx, Step1Form.jsx, and Step7Form.jsx.
 */
function validateApplicationFields(data = {}) {
  const errors = {};

  if (data.prefix !== undefined) {
    const p = String(data.prefix).toLowerCase().trim().replace(".", "");
    if (!VALID_PREFIXES.has(p)) {
      errors.prefix = "Prefix must be one of: mr, miss, mrs, dr, ca";
    }
  }
  if (data.name !== undefined) {
    const n = String(data.name).trim();
    if (n.length < 2 || n.length > 40 || !/^[a-zA-Z\s]+$/.test(n)) {
      errors.name = "Full name must be 2–40 alphabetic characters";
    }
  }
  if (data.father_name !== undefined) {
    const fn = String(data.father_name).trim();
    if (fn.length < 2 || fn.length > 40 || !/^[a-zA-Z\s]+$/.test(fn)) {
      errors.father_name = "Father's name must be 2–40 alphabetic characters";
    }
  }
  if (data.mother_name !== undefined) {
    const mn = String(data.mother_name).trim();
    if (mn.length < 2 || mn.length > 40 || !/^[a-zA-Z\s]+$/.test(mn)) {
      errors.mother_name = "Mother's name must be 2–40 alphabetic characters";
    }
  }
  if (data.contact !== undefined) {
    const c = String(data.contact).trim();
    if (!/^[6-9]\d{9}$/.test(c)) {
      errors.contact = "Contact must be a valid 10-digit Indian mobile number";
    }
  }
  if (data.email !== undefined) {
    const e = String(data.email).trim();
    if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,10})+$/.test(e)) {
      errors.email = "Invalid email address";
    }
  }
  if (data.pan !== undefined) {
    const pan = String(data.pan).trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      errors.pan = "PAN must follow format ABCDE1234F";
    }
  }
  if (data.dob !== undefined && data.dob !== null && data.dob !== "") {
    const d = new Date(data.dob);
    if (isNaN(d.getTime()) || d >= new Date()) {
      errors.dob = "Invalid date of birth";
    } else {
      const today = new Date();
      let age = today.getFullYear() - d.getFullYear();
      const m = today.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
      if (age < 20) {
        errors.dob = "Applicant must be at least 20 years old";
      }
    }
  }
  if (data.city !== undefined) {
    const city = String(data.city).trim();
    if (city.length < 2 || city.length > 30 || !/^[a-zA-Z\s]+$/.test(city)) {
      errors.city = "City must be 2–30 alphabetic characters";
    }
  }
  for (const addrKey of ["working_address", "permanent_address", "current_address"]) {
    if (data[addrKey] !== undefined) {
      const addr = String(data[addrKey]).trim();
      if (addr.length < 10 || addr.length > 240) {
        errors[addrKey] = "Address must be between 10 and 240 characters";
      }
    }
  }
  if (data.employment_type !== undefined) {
    const emp = String(data.employment_type).toLowerCase().trim().replace(/\s+/g, "_");
    if (!VALID_EMPLOYMENT_TYPES.has(emp)) {
      errors.employment_type = "Employment type must be salaried, business, professional, or self_employed";
    }
  }
  if (data.amount !== undefined && data.amount !== null && data.amount !== "") {
    const amt = Number(data.amount);
    if (isNaN(amt) || amt < 50000 || amt > 100000000) {
      errors.amount = "Loan amount must be between ₹50,000 and ₹10,00,00,000";
    }
  }
  if (data.salary !== undefined && data.salary !== null && data.salary !== "") {
    const sal = Number(data.salary);
    if (isNaN(sal) || sal < 50000 || sal > 1000000000) {
      errors.salary = "Annual salary / turnover must be between ₹50,000 and ₹100,00,00,000";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Normalize validated fields cleanly before saving in encrypted draft.
 */
function normalizeDraftFields(raw = {}) {
  const out = { ...raw };
  if (out.prefix) out.prefix = String(out.prefix).toLowerCase().trim().replace(".", "");
  if (out.name) out.name = String(out.name).trim();
  if (out.father_name) out.father_name = String(out.father_name).trim();
  if (out.mother_name) out.mother_name = String(out.mother_name).trim();
  if (out.contact) out.contact = String(out.contact).trim();
  if (out.email) out.email = String(out.email).trim().toLowerCase();
  if (out.pan) out.pan = String(out.pan).trim().toUpperCase();
  if (out.city) out.city = String(out.city).trim();
  if (out.employment_type) {
    out.employment_type = String(out.employment_type).toLowerCase().trim().replace(/\s+/g, "_");
  }
  if (out.loan_type) {
    out.loan_type = normalizeLoanType(out.loan_type) || out.loan_type;
    out.loan_category = deriveLoanCategory(out.loan_type);
  }
  if (out.amount !== undefined && out.amount !== "") out.amount = Number(out.amount);
  if (out.salary !== undefined && out.salary !== "") out.salary = Number(out.salary);
  if (out.existing_emi !== undefined && out.existing_emi !== "") out.existing_emi = Number(out.existing_emi);
  if (out.existing_liability !== undefined && out.existing_liability !== "") {
    out.existing_liability = Number(out.existing_liability);
  }
  if (out.tenure !== undefined && out.tenure !== "") {
    out.tenure_months = parseTenureToMonths(out.tenure);
    out.tenure_display = String(out.tenure);
  }
  return out;
}

/**
 * Duplicate check reusing the exact 30-day rule from CustomerApplicationController.checkDuplicateApplication.
 */
async function checkDuplicateForDraft({ mobile, pan, providers = [], companyId = 101 }) {
  if (!mobile || !pan) return { isDuplicate: false, canCreate: true };
  const normalizedMobile = String(mobile).trim();
  const normalizedPan = String(pan).trim().toUpperCase();

  let providerFilter = "";
  const replacements = {
    mobile: normalizedMobile,
    pan: normalizedPan,
    companyId,
  };
  if (Array.isArray(providers) && providers.length > 0) {
    providerFilter = "AND ca.provider IN (:providers)";
    replacements.providers = providers;
  }

  const rows = await sequelize.query(
    `SELECT ca.id AS application_id, ca.application_no, ca.provider, ca.application_date
     FROM customer_application ca
     INNER JOIN customer c ON c.id = ca.customer_id
     INNER JOIN customer_info ci ON ci.customer_id = ca.customer_id
     WHERE c.contact = :mobile
       AND ci.pan = :pan
       AND ca.company_id = :companyId
       AND ca.application_date >= NOW() - INTERVAL 30 DAY
       ${providerFilter}
     ORDER BY ca.application_date DESC
     LIMIT 1`,
    { replacements, type: sequelize.QueryTypes.SELECT }
  );

  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row) return { isDuplicate: false, canCreate: true };

  const daysElapsed = Math.floor((Date.now() - new Date(row.application_date).getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(30 - daysElapsed, 1);

  return {
    isDuplicate: true,
    canCreate: false,
    daysRemaining,
    applicationNo: row.application_no,
    provider: row.provider,
    message: `An application${row.provider ? ` with "${row.provider}"` : ""} already exists (Application #${row.application_no}). You can apply again with this lender after ${daysRemaining} day(s).`,
  };
}

/**
 * Get or initialize application draft for a session/customer.
 */
async function getOrCreateDraft({ sessionId, customerId = null, companyId = 101 }) {
  let draft = await ChatbotApplicationDraft.findOne({
    where: {
      session_id: sessionId,
      status: { [Op.in]: ["in_progress", "ready_for_review"] },
    },
    order: [["updated_at", "DESC"]],
  });

  if (!draft && customerId) {
    draft = await ChatbotApplicationDraft.findOne({
      where: {
        customer_id: customerId,
        company_id: companyId,
        status: { [Op.in]: ["in_progress", "ready_for_review"] },
      },
      order: [["updated_at", "DESC"]],
    });
  }

  if (!draft) {
    const draftId = crypto.randomUUID();
    let prefill = {};

    // Pre-populate known customer details if logged in
    if (customerId) {
      const cust = await CustomerModel.findByPk(customerId);
      const info = await CustomerInfoModel.findOne({ where: { customer_id: customerId } });
      if (cust) {
        prefill.name = cust.name || undefined;
        prefill.email = cust.email || undefined;
        prefill.contact = cust.contact || undefined;
        prefill.dob = cust.dob ? new Date(cust.dob).toISOString().slice(0, 10) : undefined;
      }
      if (info) {
        for (const k of [
          "pan", "father_name", "mother_name", "working_address", "permanent_address",
          "current_address", "city", "state", "employment_type", "salary",
          "existing_emi", "existing_liability", "company", "gst_number",
        ]) {
          if (info[k] !== null && info[k] !== undefined && info[k] !== "") {
            prefill[k] = info[k];
          }
        }
      }
    }

    draft = await ChatbotApplicationDraft.create({
      id: draftId,
      session_id: sessionId,
      company_id: companyId,
      customer_id: customerId || null,
      current_step: "category",
      form_data_encrypted: encryptJson(prefill),
      uploaded_docs_json: [],
      status: "in_progress",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    try {
      await ChatbotAnalyticsEvent.create({
        company_id: companyId,
        session_id: sessionId,
        event_type: "app_started",
      });
    } catch {
      // non-blocking
    }
  }

  return draft;
}

/**
 * Compute completion progress, next missing mandatory fields/docs, and review readiness.
 */
async function evaluateDraftProgress(draft, companyId = 101) {
  const formData = decryptJson(draft.form_data_encrypted);
  const uploadedDocs = Array.isArray(draft.uploaded_docs_json) ? draft.uploaded_docs_json : [];
  const loanType = draft.loan_type || formData.loan_type || null;

  let config = null;
  if (loanType) {
    config = await LoanFormConfig.findOne({
      where: { company_id: companyId, loan_type: loanType, status: "approved" },
    });
  }

  const mandatoryPersonalKeys = config
    ? config.mandatory_fields_json.map((f) => f.key)
    : [
        "prefix", "name", "contact", "email", "pan", "dob",
        "father_name", "mother_name", "working_address", "permanent_address", "current_address",
        "city", "state",
      ];

  const categoryFinancialKeys = config?.category_fields_json
    ? config.category_fields_json.filter((f) => f.required).map((f) => f.key)
    : ["employment_type", "salary"];

  const loanReqKeys = ["loan_type", "amount", "tenure", "providers"];

  const missingPersonal = mandatoryPersonalKeys.filter((k) => !formData[k]);
  const missingFinancial = categoryFinancialKeys.filter((k) => {
    if (k === "existing_loans") {
      return !Array.isArray(formData.existing_loans) || formData.existing_loans.length === 0;
    }
    return formData[k] === undefined || formData[k] === null || formData[k] === "";
  });
  const missingLoanReq = loanReqKeys.filter((k) => {
    if (k === "providers") {
      return !Array.isArray(formData.providers) || formData.providers.length === 0;
    }
    return !formData[k];
  });

  const mandatoryDocs = config?.mandatory_documents_json || [
    { type: "aadhaar front", label: "Aadhaar Card (Front)", maxFiles: 1 },
    { type: "pancard", label: "PAN Card", maxFiles: 1 },
    { type: "bank statement", label: "Last 6 Months Bank Statement", maxFiles: 10 },
  ];
  const optionalDocs = config?.optional_documents_json || [
    { type: "aadhaar back", label: "Aadhaar Card (Back)", maxFiles: 1 },
    { type: "photo", label: "Passport Size Photo", maxFiles: 1 },
  ];

  const uploadedTypeCounts = {};
  for (const doc of uploadedDocs) {
    if (doc.status === "uploaded") {
      const t = String(doc.type).toLowerCase();
      uploadedTypeCounts[t] = (uploadedTypeCounts[t] || 0) + 1;
    }
  }

  const documentChecklist = [
    ...mandatoryDocs.map((d) => ({
      type: d.type,
      label: d.label,
      labelHi: d.labelHi || d.label,
      required: true,
      maxFiles: d.maxFiles || 1,
      status: uploadedTypeCounts[String(d.type).toLowerCase()] > 0 ? "uploaded" : "pending",
      files: uploadedDocs.filter((u) => String(u.type).toLowerCase() === String(d.type).toLowerCase()),
    })),
    ...optionalDocs.map((d) => ({
      type: d.type,
      label: d.label,
      labelHi: d.labelHi || d.label,
      required: false,
      maxFiles: d.maxFiles || 1,
      status: uploadedTypeCounts[String(d.type).toLowerCase()] > 0 ? "uploaded" : "pending_optional",
      files: uploadedDocs.filter((u) => String(u.type).toLowerCase() === String(d.type).toLowerCase()),
    })),
  ];

  const missingDocuments = documentChecklist.filter((d) => d.required && d.status !== "uploaded");

  let nextStep = "category";
  if (!loanType) nextStep = "category";
  else if (missingPersonal.length > 0) nextStep = "personal";
  else if (missingFinancial.length > 0) nextStep = "employment";
  else if (missingLoanReq.length > 0) nextStep = "loan_requirements";
  else if (missingDocuments.length > 0) nextStep = "documents";
  else nextStep = "review";

  if (draft.status === "submitted") nextStep = "submitted";

  return {
    draftId: draft.id,
    loanType,
    loanCategory: loanType ? deriveLoanCategory(loanType) : null,
    currentStep: nextStep,
    isReadyForReview:
      Boolean(loanType) &&
      missingPersonal.length === 0 &&
      missingFinancial.length === 0 &&
      missingLoanReq.length === 0 &&
      missingDocuments.length === 0,
    missingPersonal,
    missingFinancial,
    missingLoanReq,
    missingDocuments,
    documentChecklist,
    formConfig: config,
    formData,
    uploadedDocs,
  };
}

/**
 * Update draft fields with backend validation and duplicate pre-check.
 */
async function updateApplicationDraft({ sessionId, customerId = null, fields = {}, companyId = 101 }) {
  const draft = await getOrCreateDraft({ sessionId, customerId, companyId });
  if (draft.status === "submitted") {
    throw new Error("This application has already been submitted. Start a new application if you want to apply again.");
  }

  const normalizedIncoming = normalizeDraftFields(fields);
  const validation = validateApplicationFields(normalizedIncoming);
  if (!validation.valid) {
    return {
      success: false,
      validationErrors: validation.errors,
    };
  }

  const existingData = decryptJson(draft.form_data_encrypted);
  const merged = {
    ...existingData,
    ...normalizedIncoming,
  };

  // Default lead_type & case_type aligned with Step1Form.jsx
  if (!merged.lead_type) merged.lead_type = "notion";
  if (!merged.case_type) merged.case_type = "fresh";

  // Run early 30-day duplicate warning once mobile + PAN + providers are known
  let duplicateCheck = null;
  if (merged.contact && merged.pan && Array.isArray(merged.providers) && merged.providers.length > 0) {
    duplicateCheck = await checkDuplicateForDraft({
      mobile: merged.contact,
      pan: merged.pan,
      providers: merged.providers,
      companyId,
    });
  }

  const progressPreview = await evaluateDraftProgress(
    {
      ...draft.toJSON(),
      loan_type: merged.loan_type || draft.loan_type,
      loan_category: merged.loan_category || draft.loan_category,
      form_data_encrypted: encryptJson(merged),
    },
    companyId
  );

  await draft.update({
    customer_id: customerId || draft.customer_id,
    loan_type: merged.loan_type || draft.loan_type,
    loan_category: merged.loan_category || draft.loan_category,
    current_step: progressPreview.currentStep,
    form_data_encrypted: encryptJson(merged),
    status: progressPreview.isReadyForReview ? "ready_for_review" : "in_progress",
    updated_at: new Date(),
  });

  return {
    success: true,
    duplicateWarning: duplicateCheck?.isDuplicate ? duplicateCheck : null,
    progress: progressPreview,
  };
}

/**
 * Securely validate and upload a document into S3 for an active chatbot application draft.
 */
async function uploadDraftDocument({ sessionId, customerId = null, file, docType, companyId = 101 }) {
  const draft = await getOrCreateDraft({ sessionId, customerId, companyId });

  const validation = validateUploadedDocument(file);
  if (!validation.valid) {
    try {
      await ChatbotAnalyticsEvent.create({
        company_id: companyId,
        session_id: sessionId,
        event_type: "doc_upload_failed",
        loan_category: draft.loan_category || null,
        topic_tag: String(docType || "unknown").slice(0, 100),
      });
    } catch {
      // non-blocking
    }
    return {
      success: false,
      status: "invalid",
      error: validation.error,
    };
  }

  const cleanDocType = String(docType || "certificate").toLowerCase().trim();
  const s3Key = `document/chatbot/${draft.id}/${Date.now()}_${validation.safeName}`;

  const docUrl = await Utility.uploadToS3(s3Key, file);

  // Defer inserting into customer_document until submitApplicationDraft creates each specific customer_application row,
  // so draft uploads stay strictly isolated from any earlier submitted applications of this customer.
  const currentDocs = Array.isArray(draft.uploaded_docs_json) ? [...draft.uploaded_docs_json] : [];
  // Replace single-file KYC docs rather than accumulating stale rejected entries
  const filteredDocs = ["aadhaar front", "aadhaar back", "pancard", "photo"].includes(cleanDocType)
    ? currentDocs.filter((d) => String(d.type).toLowerCase() !== cleanDocType)
    : currentDocs;

  filteredDocs.push({
    id: crypto.randomUUID(),
    type: cleanDocType,
    fileName: validation.safeName,
    size: validation.size,
    document_url: docUrl,
    status: "uploaded",
    persistedToCustomerDoc: false,
    uploadedAt: new Date().toISOString(),
  });

  await draft.update({
    uploaded_docs_json: filteredDocs,
    updated_at: new Date(),
  });

  const progress = await evaluateDraftProgress(draft, companyId);
  await draft.update({
    current_step: progress.currentStep,
    status: progress.isReadyForReview ? "ready_for_review" : "in_progress",
  });

  return {
    success: true,
    status: "uploaded",
    document: filteredDocs[filteredDocs.length - 1],
    progress,
  };
}

/**
 * Build structured, non-sensitive-masked review summary for Step 6 before final submission.
 */
function buildReviewSummary(progress) {
  const d = progress.formData;
  return {
    draftId: progress.draftId,
    isReadyForReview: progress.isReadyForReview,
    personalInfo: {
      prefix: d.prefix || null,
      name: d.name || null,
      contact: d.contact || null,
      contactMasked: maskContact(d.contact),
      email: d.email || null,
      panMasked: maskPan(d.pan),
      dob: d.dob || null,
      father_name: d.father_name || null,
      mother_name: d.mother_name || null,
      working_address: d.working_address || null,
      permanent_address: d.permanent_address || null,
      current_address: d.current_address || null,
      city: d.city || null,
      state: d.state || null,
    },
    employmentAndFinancials: {
      employment_type: d.employment_type || null,
      salary: d.salary || null,
      existing_emi: d.existing_emi ?? 0,
      existing_liability: d.existing_liability ?? 0,
      existing_loans: d.existing_loans || [],
      company: d.company || null,
      gst_number: d.gst_number || null,
      degree: d.degree || null,
      license_number: d.license_number || null,
    },
    loanRequirements: {
      loan_type: progress.loanType,
      loan_category: progress.loanCategory,
      amount: d.amount || null,
      tenure: d.tenure_display || d.tenure || null,
      tenure_months: d.tenure_months || null,
      providers: d.providers || [],
      case_type: d.case_type || "fresh",
    },
    documents: progress.documentChecklist,
    missingPersonal: progress.missingPersonal,
    missingFinancial: progress.missingFinancial,
    missingLoanReq: progress.missingLoanReq,
    missingDocuments: progress.missingDocuments.map((m) => m.label),
  };
}

/**
 * Final Atomic Submission (Step 7) — requires explicit user confirmation.
 * Executes inside Sequelize transaction + idempotency key to prevent duplicate submissions.
 */
async function submitApplicationDraft({
  sessionId,
  customerId = null,
  confirmSubmission = false,
  idempotencyKey = null,
  companyId = 101,
  io = null,
  ipAddress = null,
}) {
  if (!confirmSubmission) {
    return {
      success: false,
      requiresConfirmation: true,
      error: "Explicit customer confirmation is required before submitting your loan application.",
    };
  }

  const draft = await getOrCreateDraft({ sessionId, customerId, companyId });

  if (draft.status === "submitted" && Array.isArray(draft.submitted_application_ids_json)) {
    return {
      success: true,
      alreadySubmitted: true,
      applications: draft.submitted_application_ids_json,
      message: "Your loan application has already been submitted.",
    };
  }

  if (idempotencyKey) {
    const existingByKey = await ChatbotApplicationDraft.findOne({
      where: { idempotency_key: idempotencyKey, status: "submitted" },
    });
    if (existingByKey) {
      return {
        success: true,
        alreadySubmitted: true,
        applications: existingByKey.submitted_application_ids_json,
      };
    }
  }

  const progress = await evaluateDraftProgress(draft, companyId);
  if (!progress.isReadyForReview) {
    return {
      success: false,
      validationFailed: true,
      error: "Cannot submit yet: mandatory fields or mandatory documents are incomplete.",
      missingPersonal: progress.missingPersonal,
      missingFinancial: progress.missingFinancial,
      missingLoanReq: progress.missingLoanReq,
      missingDocuments: progress.missingDocuments.map((m) => m.label),
    };
  }

  const data = progress.formData;
  const validation = validateApplicationFields(data);
  if (!validation.valid) {
    return {
      success: false,
      validationErrors: validation.errors,
      error: "Please fix the invalid fields before submitting.",
    };
  }

  // Re-check 30-day duplicate guard right before DB write
  const providersList = Array.isArray(data.providers) && data.providers.length > 0
    ? data.providers
    : ["Let F2 Fintech decide your lender"];
  const dupCheck = await checkDuplicateForDraft({
    mobile: data.contact,
    pan: data.pan,
    providers: providersList,
    companyId,
  });
  if (dupCheck.isDuplicate) {
    return {
      success: false,
      isDuplicate: true,
      error: dupCheck.message,
      duplicateDetails: dupCheck,
    };
  }

  // Normalize prefix + name exactly like Step1Form.jsx
  const capPrefix = data.prefix
    ? data.prefix.toLowerCase() === "ca"
      ? "CA"
      : data.prefix.charAt(0).toUpperCase() + data.prefix.slice(1).toLowerCase()
    : "";
  const fullName = `${capPrefix} ${data.name}`.trim();

  await syncChatbotModels();
  const transaction = await sequelize.transaction();
  try {
    let finalCustomerId = customerId || draft.customer_id;
    let newlyRegisteredToken = null;

    if (!finalCustomerId) {
      // Check if customer already exists by contact + email + company_id
      const existingCustomer = await CustomerModel.findOne({
        where: {
          [Op.or]: [
            { contact: data.contact, company_id: companyId },
            { email: data.email, company_id: companyId },
          ],
        },
        transaction,
      });

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
      } else {
        const rawPassword = `${String(data.name).replace(/\s/g, "")}@${crypto.randomInt(1000, 9999)}`;
        const passwordHash = await Utility.createHash(rawPassword);
        const createdCust = await CustomerModel.create(
          {
            name: fullName,
            email: data.email,
            contact: data.contact,
            dob: data.dob,
            password: passwordHash,
            status: "active",
            role: "customer",
            company_id: companyId,
          },
          { transaction }
        );
        finalCustomerId = createdCust.id;
        newlyRegisteredToken = Utility.getSignedToken(finalCustomerId);

        // Non-blocking welcome email matching CustomerController.register
        sendEmail(getWelcomeEmailOptions(createdCust, rawPassword)).catch((err) =>
          console.warn("[ChatbotSubmit] Welcome email skipped:", err.message)
        );
      }
    }

    // Upsert customer_info
    const existingInfo = await CustomerInfoModel.findOne({
      where: { customer_id: finalCustomerId },
      transaction,
    });

    const infoPayload = {
      customer_id: finalCustomerId,
      company_id: companyId,
      pan: data.pan,
      father_name: data.father_name,
      mother_name: data.mother_name,
      working_address: data.working_address,
      permanent_address: data.permanent_address,
      current_address: data.current_address,
      city: data.city,
      state: data.state,
      employment_type: data.employment_type,
      salary: Number(data.salary) || null,
      existing_emi: data.existing_emi !== undefined ? Number(data.existing_emi) : 0,
      existing_liability: data.existing_liability !== undefined ? Number(data.existing_liability) : 0,
      company: data.company || null,
      gst_number: data.gst_number || null,
    };

    if (existingInfo) {
      await existingInfo.update(infoPayload, { transaction });
    } else {
      await CustomerInfoModel.create(infoPayload, { transaction });
    }

    // Create 1 application + loan_tracking row per selected provider, then persist draft documents scoped strictly per created application_id
    const enumValues = CustomerDocumentModel.rawAttributes?.type?.values || [];
    const draftUploadedDocs = progress.uploadedDocs.filter(
      (doc) => doc.status === "uploaded" && doc.document_url
    );
    const updatedUploadedDocs = [];
    const submittedApps = [];
    const tenureNumeric = Number(data.tenure_months) || parseTenureToMonths(data.tenure) || 12;
    const tenureYears = parseTenureToYears(data.tenure_display || data.tenure || tenureNumeric) || 1;

    for (const providerName of providersList) {
      const appNo = crypto.randomInt(10000000, 99999999);
      const customProviderAmt =
        data.provider_amounts && data.provider_amounts[providerName]
          ? Number(data.provider_amounts[providerName])
          : Number(data.amount);

      const createdApp = await CustomerApplication.create(
        {
          customer_id: finalCustomerId,
          company_id: companyId,
          application_no: appNo,
          amount: customProviderAmt,
          tenure: tenureYears,
          provider: providerName,
          loan_type: progress.loanType,
          loan_category: progress.loanCategory,
          business_entity_type: data.business_entity_type || null,
          lead_type: data.lead_type || "notion",
          existing_loans: JSON.stringify(
            (data.existing_loans || []).map((l) => ({
              has_running_loans: l.has_running_loans === "yes" || l.has_running_loans === 1 ? 1 : 0,
              which_loan: l.which_loan || "",
              loan_amount: l.loan_amount ? Number(l.loan_amount) : null,
              running_emi: l.running_emi ? Number(l.running_emi) : null,
            }))
          ),
          case_type: data.case_type || "fresh",
          source: "chatbot",
        },
        { transaction }
      );

      await LoanTrackingModel.create(
        {
          customer_application_id: createdApp.id,
          status: "submitted",
          company_id: companyId,
        },
        { transaction }
      );

      for (const doc of draftUploadedDocs) {
        const rawType = String(doc.type || "certificate").toLowerCase().trim();
        const validDocType = enumValues.includes(rawType) ? rawType : "certificate";
        const createdDoc = await CustomerDocumentModel.create(
          {
            customer_id: finalCustomerId,
            customer_application_id: createdApp.id,
            document_url: doc.document_url,
            type: validDocType,
            company_id: String(companyId),
          },
          { transaction }
        );
        if (submittedApps.length === 0) {
          updatedUploadedDocs.push({ ...doc, id: createdDoc.id, persistedToCustomerDoc: true });
        }
      }

      submittedApps.push({
        applicationId: createdApp.id,
        applicationNo: appNo,
        provider: providerName,
        loanType: progress.loanType,
        amount: customProviderAmt,
        tenure: `${tenureYears} ${tenureYears === 1 ? "Year" : "Years"}`,
        tenureYears,
        tenureMonths: tenureNumeric,
        trackingStatus: "submitted",
      });
    }

    await draft.update(
      {
        customer_id: finalCustomerId,
        current_step: "submitted",
        uploaded_docs_json: updatedUploadedDocs,
        submitted_application_ids_json: submittedApps,
        idempotency_key: idempotencyKey || `draft_${draft.id}`,
        status: "submitted",
        updated_at: new Date(),
      },
      { transaction }
    );

    await ChatbotSession.update(
      { customer_id: finalCustomerId },
      { where: { id: sessionId }, transaction }
    );

    await transaction.commit();

    // Emit existing WebSocket notification per application
    if (io) {
      for (const app of submittedApps) {
        io.emit("new-application", { applicationId: app.applicationId });
      }
    }

    // Analytics & Audit Log (no PII in analytics)
    ChatbotAnalyticsEvent.create({
      company_id: companyId,
      session_id: sessionId,
      event_type: "app_completed",
      loan_category: progress.loanCategory,
      provider_names_json: providersList,
    }).catch(() => {});

    ChatbotAuditLog.create({
      actor_id: finalCustomerId,
      actor_role: "customer",
      action: "chatbot_application_submitted",
      resource_type: "customer_application",
      resource_id: submittedApps.map((a) => a.applicationNo).join(","),
      ip_address: ipAddress,
      metadata_json: { draftId: draft.id, count: submittedApps.length },
    }).catch(() => {});

    return {
      success: true,
      customerId: finalCustomerId,
      token: newlyRegisteredToken,
      applications: submittedApps,
      nextSteps: [
        "Our F2 Fintech loan executive will contact you within 30 minutes to review your file.",
        "You can track live milestones or upload additional documents anytime right inside this assistant.",
      ],
    };
  } catch (err) {
    await transaction.rollback();
    console.error("[ChatbotAppSubmit] Transaction rolled back:", err.message);
    throw err;
  }
}

module.exports = {
  normalizeLoanType,
  deriveLoanCategory,
  parseTenureToMonths,
  validateApplicationFields,
  checkDuplicateForDraft,
  getOrCreateDraft,
  evaluateDraftProgress,
  updateApplicationDraft,
  uploadDraftDocument,
  buildReviewSummary,
  submitApplicationDraft,
};

