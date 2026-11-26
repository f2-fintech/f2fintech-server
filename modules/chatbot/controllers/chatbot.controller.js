/**
 * Chatbot Public & Authenticated Customer Controller
 * Handles sessions, Gemini conversations, deterministic tools (EMI/compare/recommend),
 * conversational loan applications, document uploads, OTP verification, and support escalation.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const crypto = require("crypto");
const {
  ChatbotSession,
  ChatbotMessage,
  ChatbotAnalyticsEvent,
  syncChatbotModels,
} = require("../../../model/chatbot");
const { hashToken } = require("../utils/piiCrypto");
const { processChatTurn } = require("../services/gemini.service");
const { calculateRepaymentDetails, compareTenureScenarios } = require("../services/repayment.service");
const { compareLoanProducts } = require("../services/comparison.service");
const { recommendLoans } = require("../services/recommendation.service");
const { getFormConfiguration } = require("../services/knowledge.service");
const {
  getOrCreateDraft,
  evaluateDraftProgress,
  updateApplicationDraft,
  uploadDraftDocument,
  buildReviewSummary,
  submitApplicationDraft,
} = require("../services/applicationOrchestrator.service");
const {
  sendVerificationOtp,
  verifyChatOtp,
  resolveAuthorizedCustomerId,
  getCustomerApplicationStatus,
  updateCustomerApplicationDetails,
  escalateSupportIssue,
} = require("../services/support.service");

function getCompanyId(req) {
  return Number(req.headers.companyid || req.headers.CompanyId || req.body?.companyId || 101);
}

async function resolveSession(req, sessionIdFromReq = null) {
  await syncChatbotModels();
  const companyId = getCompanyId(req);
  const sid = sessionIdFromReq || req.body?.sessionId || req.query?.sessionId;
  const guestToken = req.headers["x-chatbot-session-token"] || req.body?.guestToken;

  if (sid) {
    const existing = await ChatbotSession.findByPk(sid);
    if (existing) {
      // If user is authenticated via JWT/Session, enforce session ownership if bound to another customer
      if (existing.customer_id && req.user?.id && Number(existing.customer_id) !== Number(req.user.id)) {
        return null;
      }
      if (!existing.customer_id && req.user?.id) {
        await existing.update({ customer_id: req.user.id });
      }
      return existing;
    }
  }

  const newSessionId = crypto.randomUUID();
  const rawGuestToken = guestToken || crypto.randomBytes(24).toString("hex");
  const session = await ChatbotSession.create({
    id: newSessionId,
    company_id: companyId,
    customer_id: req.user?.id || null,
    guest_token_hash: hashToken(rawGuestToken),
    language: req.body?.language === "hi" ? "hi" : "en",
    context_json: {},
    status: "active",
  });

  ChatbotAnalyticsEvent.create({
    company_id: companyId,
    session_id: session.id,
    event_type: "session_started",
  }).catch(() => {});

  session._issuedGuestToken = rawGuestToken;
  return session;
}

exports.initOrResumeSession = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const session = await resolveSession(req);
    if (!session) {
      return res.status(403).json({
        success: false,
        error: "Session belongs to another customer account.",
      });
    }

    const messages = await ChatbotMessage.findAll({
      where: { session_id: session.id },
      order: [["id", "ASC"]],
      limit: 50,
    });

    const authCustomerId = await resolveAuthorizedCustomerId(req, session);
    let draftProgress = null;
    try {
      const draft = await getOrCreateDraft({
        sessionId: session.id,
        customerId: authCustomerId,
        companyId,
      });
      if (draft && draft.loan_type) {
        draftProgress = await evaluateDraftProgress(draft, companyId);
      }
    } catch {
      draftProgress = null;
    }

    const formMeta = await getFormConfiguration(null, companyId);

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      guestToken: session._issuedGuestToken || undefined,
      language: session.language,
      isAuthenticated: Boolean(authCustomerId),
      messages: messages.map((m) => ({
        id: m.id,
        from: m.sender === "user" ? "user" : "bot",
        text: m.message_text,
        uiPayloads: m.structured_payload_json || [],
        language: m.language,
        feedbackRating: m.feedback_rating,
        createdAt: m.created_at,
      })),
      activeDraft: draftProgress
        ? {
            draftId: draftProgress.draftId,
            loanType: draftProgress.loanType,
            currentStep: draftProgress.currentStep,
            isReadyForReview: draftProgress.isReadyForReview,
            documentChecklist: draftProgress.documentChecklist,
            reviewSummary: draftProgress.isReadyForReview ? buildReviewSummary(draftProgress) : null,
          }
        : null,
      loanCategories: formMeta.configs.map((c) => ({
        loanType: c.loan_type,
        loanCategory: c.loan_category,
        displayName: c.display_name,
        displayNameHi: c.display_name_hi,
      })),
    });
  } catch (err) {
    console.error("[Chatbot.initSession] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to initialize chatbot session." });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { message, sessionId, language } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, error: "Please provide a valid message." });
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ success: false, error: "Message exceeds 2000 character limit." });
    }

    const session = await resolveSession(req, sessionId);
    if (!session) {
      return res.status(403).json({ success: false, error: "Unauthorized session access." });
    }

    const authCustomerId = await resolveAuthorizedCustomerId(req, session);

    const turnResult = await processChatTurn({
      session,
      rawMessage: message,
      authorizedCustomerId: authCustomerId,
      companyId,
      preferredLanguage: language,
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      guestToken: session._issuedGuestToken || undefined,
      ...turnResult,
    });
  } catch (err) {
    console.error("[Chatbot.sendMessage] Error:", err);
    return res.status(500).json({
      success: false,
      error: "Unable to process your message right now. Please try again.",
    });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { sessionId, messageId, rating, comment } = req.body || {};

    if (![1, -1].includes(Number(rating))) {
      return res.status(400).json({ success: false, error: "Rating must be 1 or -1." });
    }

    if (messageId) {
      await ChatbotMessage.update(
        {
          feedback_rating: Number(rating),
          feedback_comment: comment ? String(comment).slice(0, 500) : null,
        },
        { where: { id: messageId } }
      );
    }

    await ChatbotAnalyticsEvent.create({
      company_id: companyId,
      session_id: sessionId || null,
      event_type: "feedback_submitted",
      rating: Number(rating),
    });

    return res.status(200).json({ success: true, message: "Thank you for your feedback!" });
  } catch (err) {
    console.error("[Chatbot.submitFeedback] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to record feedback." });
  }
};

exports.getFormConfig = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { loanType } = req.params;
    const data = await getFormConfiguration(loanType === "all" ? null : loanType, companyId);

    if (loanType && loanType !== "all" && data.configs.length === 0) {
      return res.status(404).json({ success: false, error: `No approved form configuration for "${loanType}".` });
    }

    return res.status(200).json({
      success: true,
      configs: data.configs,
      providers: data.providers,
    });
  } catch (err) {
    console.error("[Chatbot.getFormConfig] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to load form configuration." });
  }
};

exports.calculateRepayment = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const {
      principal,
      annualRatePercent,
      tenureMonths,
      extraMonthlyPayment,
      extraEmiPerYear,
      lumpSumPrepayment,
      lumpSumAtMonth,
      monthlyIncome,
      existingEmi,
      compareTenures,
      sessionId,
    } = req.body || {};

    const result = calculateRepaymentDetails({
      principal,
      annualRatePercent,
      tenureMonths,
      extraMonthlyPayment,
      extraEmiPerYear,
      lumpSumPrepayment,
      lumpSumAtMonth,
      monthlyIncome,
      existingEmi,
    });

    const tenureComparison = compareTenures
      ? compareTenureScenarios({
          principal,
          annualRatePercent,
          tenuresMonths: Array.isArray(compareTenures) ? compareTenures : undefined,
        })
      : null;

    ChatbotAnalyticsEvent.create({
      company_id: companyId,
      session_id: sessionId || null,
      event_type: "emi_calculated",
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      ...result,
      tenureComparison,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

exports.compareLoans = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { loanCategory, providerNames, loanAmount, tenureMonths, limit, sessionId } = req.body || {};

    const result = await compareLoanProducts({
      loanCategory,
      providerNames,
      loanAmount,
      tenureMonths,
      limit,
      companyId,
    });

    if (result.found) {
      ChatbotAnalyticsEvent.create({
        company_id: companyId,
        session_id: sessionId || null,
        event_type: "comparison_run",
        loan_category: result.loanCategory,
        provider_names_json: result.items.map((i) => i.providerName),
      }).catch(() => {});
    }

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("[Chatbot.compareLoans] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to run loan comparison." });
  }
};

exports.recommendLoansEndpoint = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { sessionId, ...profile } = req.body || {};

    const result = await recommendLoans(profile, companyId);

    ChatbotAnalyticsEvent.create({
      company_id: companyId,
      session_id: sessionId || null,
      event_type: "recommendation_run",
      loan_category: result.inferredCategory,
    }).catch(() => {});

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("[Chatbot.recommendLoans] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to generate recommendations." });
  }
};

exports.updateApplicationDraftEndpoint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { sessionId, fields } = req.body || {};
    const session = await resolveSession(req, sessionId);
    if (!session) {
      return res.status(403).json({ success: false, error: "Unauthorized session access." });
    }
    const authCustomerId = await resolveAuthorizedCustomerId(req, session);

    const result = await updateApplicationDraft({
      sessionId: session.id,
      customerId: authCustomerId,
      fields: fields || {},
      companyId,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, ...result });
    }

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      duplicateWarning: result.duplicateWarning,
      progress: {
        draftId: result.progress.draftId,
        loanType: result.progress.loanType,
        loanCategory: result.progress.loanCategory,
        currentStep: result.progress.currentStep,
        isReadyForReview: result.progress.isReadyForReview,
        missingPersonal: result.progress.missingPersonal,
        missingFinancial: result.progress.missingFinancial,
        missingLoanReq: result.progress.missingLoanReq,
        missingDocuments: result.progress.missingDocuments,
        documentChecklist: result.progress.documentChecklist,
        reviewSummary: result.progress.isReadyForReview ? buildReviewSummary(result.progress) : null,
      },
    });
  } catch (err) {
    console.error("[Chatbot.updateDraft] Error:", err);
    return res.status(400).json({ success: false, error: err.message });
  }
};

exports.uploadApplicationDocumentEndpoint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { sessionId, docType } = req.body || {};
    const file = req.files?.document;

    const session = await resolveSession(req, sessionId);
    if (!session) {
      return res.status(403).json({ success: false, error: "Unauthorized session access." });
    }
    const authCustomerId = await resolveAuthorizedCustomerId(req, session);

    const result = await uploadDraftDocument({
      sessionId: session.id,
      customerId: authCustomerId,
      file,
      docType,
      companyId,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, ...result });
    }

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      document: result.document,
      progress: {
        draftId: result.progress.draftId,
        loanType: result.progress.loanType,
        currentStep: result.progress.currentStep,
        isReadyForReview: result.progress.isReadyForReview,
        documentChecklist: result.progress.documentChecklist,
        missingDocuments: result.progress.missingDocuments,
        reviewSummary: result.progress.isReadyForReview ? buildReviewSummary(result.progress) : null,
      },
    });
  } catch (err) {
    console.error("[Chatbot.uploadDoc] Error:", err);
    return res.status(500).json({ success: false, error: "Document upload failed. Please try again." });
  }
};

exports.getReviewSummaryEndpoint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const session = await resolveSession(req, req.query.sessionId);
    if (!session) {
      return res.status(403).json({ success: false, error: "Unauthorized session access." });
    }
    const authCustomerId = await resolveAuthorizedCustomerId(req, session);
    const draft = await getOrCreateDraft({
      sessionId: session.id,
      customerId: authCustomerId,
      companyId,
    });
    const progress = await evaluateDraftProgress(draft, companyId);
    return res.status(200).json({
      success: true,
      review: buildReviewSummary(progress),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.submitApplicationEndpoint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { sessionId, confirmSubmission, idempotencyKey } = req.body || {};

    const session = await resolveSession(req, sessionId);
    if (!session) {
      return res.status(403).json({ success: false, error: "Unauthorized session access." });
    }
    const authCustomerId = await resolveAuthorizedCustomerId(req, session);

    const io = req.app.get("io");
    const result = await submitApplicationDraft({
      sessionId: session.id,
      customerId: authCustomerId,
      confirmSubmission: Boolean(confirmSubmission),
      idempotencyKey,
      companyId,
      io,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    });

    if (!result.success) {
      const code = result.isDuplicate ? 409 : 400;
      return res.status(code).json({ success: false, ...result });
    }

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      ...result,
    });
  } catch (err) {
    console.error("[Chatbot.submitApplication] Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to submit application. Please verify details or try again.",
    });
  }
};

exports.sendOtpEndpoint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { identifier, sessionId } = req.body || {};
    const session = await resolveSession(req, sessionId);
    if (!session) {
      return res.status(403).json({ success: false, error: "Unauthorized session access." });
    }
    const result = await sendVerificationOtp({
      identifier,
      sessionId: session.id,
      companyId,
    });
    if (!result.success) {
      return res.status(result.notFound ? 404 : 400).json(result);
    }
    return res.status(200).json({ sessionId: session.id, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to send OTP." });
  }
};

exports.verifyOtpEndpoint = async (req, res) => {
  try {
    const { identifier, otp, sessionId } = req.body || {};
    const session = await resolveSession(req, sessionId);
    if (!session) {
      return res.status(403).json({ success: false, error: "Unauthorized session access." });
    }
    const result = await verifyChatOtp({
      identifier,
      otp,
      sessionId: session.id,
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json({ sessionId: session.id, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to verify OTP." });
  }
};

exports.getApplicationStatusEndpoint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const session = req.query.sessionId ? await ChatbotSession.findByPk(req.query.sessionId) : null;
    const authCustomerId = await resolveAuthorizedCustomerId(req, session);

    const status = await getCustomerApplicationStatus({
      customerId: authCustomerId,
      applicationNo: req.query.applicationNo || null,
      companyId,
      language: req.query.language === "hi" ? "hi" : "en",
    });

    if (!status.authorized) {
      return res.status(401).json({ success: false, ...status });
    }

    return res.status(200).json({ success: true, ...status });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to fetch application status." });
  }
};

exports.updateApplicationDetailsEndpoint = async (req, res) => {
  try {
    const session = req.body?.sessionId ? await ChatbotSession.findByPk(req.body.sessionId) : null;
    const authCustomerId = await resolveAuthorizedCustomerId(req, session);
    if (!authCustomerId) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }
    const result = await updateCustomerApplicationDetails({
      customerId: authCustomerId,
      applicationId: req.body?.applicationId || null,
      updates: req.body?.updates || {},
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

exports.escalateSupportEndpoint = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { sessionId, title, description, contactInfo } = req.body || {};
    const session = sessionId ? await ChatbotSession.findByPk(sessionId) : null;
    const authCustomerId = await resolveAuthorizedCustomerId(req, session);

    const result = await escalateSupportIssue({
      customerId: authCustomerId,
      sessionId,
      title,
      description,
      contactInfo,
      companyId,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

