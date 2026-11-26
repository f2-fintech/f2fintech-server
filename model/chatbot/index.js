/**
 * Chatbot Models Registry & Safe Schema Initializer
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const ChatbotKnowledgeBase = require("./chatbotKnowledgeBase");
const LoanProductCatalog = require("./loanProductCatalog");
const LoanFormConfig = require("./loanFormConfig");
const ChatbotSession = require("./chatbotSession");
const ChatbotMessage = require("./chatbotMessage");
const ChatbotApplicationDraft = require("./chatbotApplicationDraft");
const { ChatbotAnalyticsEvent, ChatbotAuditLog } = require("./chatbotAnalytics");

let syncPromise = null;

/**
 * Ensures chatbot tables exist in MySQL without altering existing legacy tables.
 */
async function syncChatbotModels() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const models = [
      ChatbotKnowledgeBase,
      LoanProductCatalog,
      LoanFormConfig,
      ChatbotSession,
      ChatbotMessage,
      ChatbotApplicationDraft,
      ChatbotAnalyticsEvent,
      ChatbotAuditLog,
    ];
    for (const model of models) {
      await model.sync();
    }
  })().catch((err) => {
    syncPromise = null;
    throw err;
  });

  return syncPromise;
}

module.exports = {
  ChatbotKnowledgeBase,
  LoanProductCatalog,
  LoanFormConfig,
  ChatbotSession,
  ChatbotMessage,
  ChatbotApplicationDraft,
  ChatbotAnalyticsEvent,
  ChatbotAuditLog,
  syncChatbotModels,
};

