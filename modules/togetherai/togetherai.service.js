/**
 * Legacy Chat Service Proxy
 * Delegates to the unified Gemini + Strict F2Fintech Internal-KB Chatbot Orchestrator.
 * Never invents external lenders, unverified rates, or leaks API keys.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const crypto = require("crypto");
const { ChatbotSession, syncChatbotModels } = require("../../model/chatbot");
const { hashToken } = require("../chatbot/utils/piiCrypto");
const { processChatTurn } = require("../chatbot/services/gemini.service");
const { resolveAuthorizedCustomerId } = require("../chatbot/services/support.service");

/**
 * Process legacy chat message using the strict internal-data Gemini orchestrator.
 */
async function generateChatCompletion(userMessage, req = null) {
  await syncChatbotModels();
  const companyId = Number(req?.headers?.companyid || req?.headers?.CompanyId || req?.body?.companyId || 101);
  const requestedSid = req?.body?.sessionId;
  const preferredLanguage = req?.body?.language;

  let session = requestedSid ? await ChatbotSession.findByPk(requestedSid) : null;
  let issuedGuestToken;

  if (session && session.customer_id && req?.user?.id && Number(session.customer_id) !== Number(req.user.id)) {
    session = null;
  }

  if (!session) {
    const rawGuestToken = req?.headers?.["x-chatbot-session-token"] || crypto.randomBytes(24).toString("hex");
    issuedGuestToken = rawGuestToken;
    session = await ChatbotSession.create({
      id: crypto.randomUUID(),
      company_id: companyId,
      customer_id: req?.user?.id || null,
      guest_token_hash: hashToken(rawGuestToken),
      language: preferredLanguage === "hi" ? "hi" : "en",
      context_json: {},
      status: "active",
    });
  }

  const authorizedCustomerId = req ? await resolveAuthorizedCustomerId(req, session) : null;
  const turn = await processChatTurn({
    session,
    rawMessage: userMessage,
    authorizedCustomerId,
    companyId,
    preferredLanguage,
  });

  return {
    reply: turn.reply,
    sessionId: session.id,
    guestToken: issuedGuestToken,
    intent: turn.intent,
    uiPayloads: turn.uiPayloads || [],
  };
}

module.exports = {
  generateChatCompletion,
};

