/**
 * Together AI Service - Outbound HTTP Integration
 * Encapsulates communication with Together AI completions API.
 * Never leaks API keys or full authorization headers in logs or errors.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const axios = require("axios");
const { searchSimilarDocs } = require("../../utility/vector-context");

const TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions";
const MODEL_NAME = "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free";

/**
 * Send chat message to Together AI model with RAG context
 */
async function generateChatCompletion(userMessage) {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_API_KEY is missing from server environment");
  }

  // Attempt to fetch context from vector store; fail gracefully if unavailable
  let context = "";
  try {
    context = await searchSimilarDocs(userMessage, 5);
  } catch (vectorErr) {
    console.warn("[TogetherAI Service] Vector context search skipped:", vectorErr.message);
  }

  const systemPrompt = `You are a helpful AI finance assistant for F2 Fintech. Use the following context extracted from official resources to answer the user's question accurately.
If the context does not contain the answer, provide helpful, polite financial guidance.
Context: ${context || "F2 Fintech provides instant personal loans, business loans, doctor loans, credit card comparison, and CIBIL score checks."}`;

  try {
    const response = await axios.post(
      TOGETHER_API_URL,
      {
        model: MODEL_NAME,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\nQuestion: ${userMessage}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content || "";
    return reply;
  } catch (error) {
    // Sanitized logging: never print full authorization header or API key
    console.error("[TogetherAI Service] Completion error:", error.message);
    throw new Error("Failed to receive response from AI model.");
  }
}

module.exports = {
  generateChatCompletion,
};
