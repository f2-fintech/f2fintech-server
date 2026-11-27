/**
 * Idempotent Chatbot Database & Vector Seeder
 * Seeds approved loan catalog (29 lenders), verified company/PDF knowledge,
 * and dynamic loan application form configurations into MySQL.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const fs = require("fs");
const path = require("path");
const {
  ChatbotKnowledgeBase,
  LoanProductCatalog,
  LoanFormConfig,
  migrateLegacyRowsToSingleStore,
  dropLegacyChatbotTables,
  syncChatbotModels,
} = require("../../../model/chatbot");
const LoanProviderModel = require("../../../model/loan_provider");
const { KNOWLEDGE_SEEDS } = require("./knowledgeSeedData");
const { FORM_CONFIG_SEEDS } = require("./formConfigSeedData");
const { upsertKnowledgeVector } = require("../../../utility/vector-context");
const { invalidateChatbotCache } = require("../services/cache.service");

async function seedChatbotDatabase({ syncVectors = false, companyId = 101 } = {}) {
  await syncChatbotModels();
  const migratedFromLegacy = await migrateLegacyRowsToSingleStore();

  // Map existing MySQL loan_provider records by lowercase name
  let providerMap = new Map();
  try {
    const existingProviders = await LoanProviderModel.findAll({ attributes: ["id", "title"] });
    for (const p of existingProviders) {
      if (p.title) {
        providerMap.set(p.title.toLowerCase().trim(), p.id);
      }
    }
  } catch (err) {
    console.warn("[Seed] Could not query loan_provider for FK mapping:", err.message);
  }

  // 1. Seed Loan Product Catalog
  const catalogPath = path.join(__dirname, "catalogSeedData.json");
  const catalogRows = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  let catalogCount = 0;

  for (const row of catalogRows) {
    const provKey = String(row.provider_name || "").toLowerCase().trim();
    let matchedProviderId = providerMap.get(provKey) || null;
    if (!matchedProviderId) {
      for (const [k, v] of providerMap.entries()) {
        if (k.includes(provKey) || provKey.includes(k)) {
          matchedProviderId = v;
          break;
        }
      }
    }

    await LoanProductCatalog.upsert({
      ...row,
      company_id: companyId,
      loan_provider_id: matchedProviderId,
      approved_at: new Date(),
      updated_at: new Date(),
    });
    catalogCount++;
  }

  // 2. Seed Knowledge Base
  let kbCount = 0;
  for (const kb of KNOWLEDGE_SEEDS) {
    const [record] = await ChatbotKnowledgeBase.upsert({
      ...kb,
      company_id: companyId,
      approved_at: new Date(),
      updated_at: new Date(),
    });
    kbCount++;

    if (syncVectors && kb.status === "approved") {
      await upsertKnowledgeVector({
        id: record?.id || kb.slug,
        slug: kb.slug,
        title: kb.title,
        content: kb.content_en,
        category: kb.category,
        status: "approved",
        companyId,
        sourceRef: kb.source_ref,
      });
    }
  }

  // 3. Seed Form Configurations
  let formCount = 0;
  for (const cfg of FORM_CONFIG_SEEDS) {
    await LoanFormConfig.upsert({
      ...cfg,
      company_id: companyId,
      updated_at: new Date(),
    });
    formCount++;
  }

  invalidateChatbotCache(companyId);

  return {
    migratedFromLegacy,
    catalogCount,
    kbCount,
    formCount,
  };
}

if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
  const dropLegacy = process.argv.includes("--drop-legacy");
  seedChatbotDatabase({ syncVectors: true })
    .then(async (res) => {
      if (dropLegacy) {
        const dropped = await dropLegacyChatbotTables();
        res.droppedLegacyTables = dropped;
      }
      console.log("[SeedChatbotData] Completed:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[SeedChatbotData] Failed:", err);
      process.exit(1);
    });
}

module.exports = { seedChatbotDatabase };

