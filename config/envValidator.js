/**
 * Environment Variables Validator - Fail Fast on Startup
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

function validateRequiredSecrets() {
  const missing = [];

  // BankKaro
  if (!process.env.BANKKARO_API_KEY) {
    missing.push("BANKKARO_API_KEY");
  }
  if (!process.env.BANKKARO_BASE_URL) {
    missing.push("BANKKARO_BASE_URL");
  }

  // TimbleGlance / Experian Bureau V2
  const isProduction = process.env.NODE_ENV === "production";
  if (!process.env.TIMBLEGLANCE_API_KEY) {
    missing.push("TIMBLEGLANCE_API_KEY");
  }

  // AI Assistant (Google Gemini primary, Together AI optional legacy)
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.warn(
      "[Startup Warning] GEMINI_API_KEY is not set. Conversational AI NLU endpoints will require GEMINI_API_KEY before live LLM responses."
    );
  }

  if (missing.length > 0) {
    if (!isProduction) {
      console.warn(
        `[Startup Warning] Running in ${process.env.NODE_ENV || "local"} environment. Missing optional server secret(s): ${missing.join(
          ", "
        )}. Server started in development mode without these secrets.`
      );
      return;
    }

    const errorMsg = `[Startup Error] Missing required server environment variable(s): ${missing.join(
      ", "
    )}. Server cannot start without these secrets.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log("All required secret environment variables validated successfully.");
}

module.exports = {
  validateRequiredSecrets,
};

