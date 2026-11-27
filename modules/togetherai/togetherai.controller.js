/**
 * Legacy Chat Controller (/api/v1/chat and /api/v1/api/chat)
 * Delegates all requests to the unified Gemini + Strict Internal-KB Chatbot Orchestrator
 * so legacy callers receive strict verified F2Fintech responses without Together AI.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const togetheraiService = require("./togetherai.service");

/**
 * POST /api/v1/chat or /api/v1/api/chat
 * Handle chat message from user (legacy-compatible { reply } response)
 */
exports.handleChat = async (req, res) => {
  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Please provide a valid message." });
  }

  // Guard against oversized inputs
  const cleanMessage = message.trim();
  if (cleanMessage.length > 2000) {
    return res.status(400).json({
      error: "Message exceeds maximum allowed character length (2000).",
    });
  }

  try {
    const result = await togetheraiService.generateChatCompletion(cleanMessage, req);
    const reply = (result.reply || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    return res.status(200).json({
      reply,
      sessionId: result.sessionId,
      guestToken: result.guestToken,
      intent: result.intent,
      uiPayloads: result.uiPayloads || [],
    });
  } catch (error) {
    console.error("[LegacyChat Controller] Error:", error.message);
    return res.status(500).json({
      error: "Error communicating with AI assistant. Please try again shortly.",
    });
  }
};

