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

  // Digitap / Bureau
  const isProduction = process.env.NODE_ENV === "production";
  const digitapApiKey =
    process.env.DIGITAP_API_KEY ||
    (isProduction
      ? process.env.DIGITAP_PRODUCTION_KEY
      : process.env.DIGITAP_STAGING_KEY || process.env.DIGITAP_PRODUCTION_KEY);

  if (!digitapApiKey) {
    missing.push(
      isProduction
        ? "DIGITAP_API_KEY or DIGITAP_PRODUCTION_KEY"
        : "DIGITAP_API_KEY or DIGITAP_STAGING_KEY"
    );
  }
  if (!process.env.DIGITAP_CLIENT_ID) {
    missing.push("DIGITAP_CLIENT_ID");
  }
  if (!process.env.DIGITAP_SECRET) {
    missing.push("DIGITAP_SECRET");
  }

  // Together AI
  if (!process.env.TOGETHER_API_KEY) {
    missing.push("TOGETHER_API_KEY");
  }

  if (missing.length > 0) {
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

