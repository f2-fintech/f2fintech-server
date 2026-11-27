/**
 * Chatbot Models Registry & Safe Schema Initializer (Single-Table Architecture)
 * ONLY ONE chatbot table (`chatbot_store`) is ever synced in MySQL.
 * Zero chats, sessions, application drafts, analytics, or traces are saved to MySQL.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { safeParseJson } = require("./jsonColumn");
const ChatbotStore = require("./chatbotStore");
const {
  ChatbotKnowledgeBase,
  LoanProductCatalog,
  LoanFormConfig,
} = require("./storeAdapters");
const {
  ChatbotSession,
  ChatbotMessage,
  ChatbotApplicationDraft,
  ChatbotAnalyticsEvent,
  ChatbotAuditLog,
  ChatbotTurnTrace,
  getEphemeralAnalyticsSummary,
} = require("./ephemeralModels");

const LEGACY_CHATBOT_TABLES = [
  "chatbot_messages",
  "chatbot_sessions",
  "chatbot_application_drafts",
  "chatbot_analytics_events",
  "chatbot_audit_logs",
  "chatbot_turn_traces",
  "chatbot_knowledge_base",
  "loan_product_catalog",
  "loan_form_configurations",
];

let syncPromise = null;

async function ensureCustomerDocumentAppColumn() {
  const sequelize = require("../../sequelize");
  const [cols] = await sequelize.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'customer_document'
       AND COLUMN_NAME = 'customer_application_id'`
  );
  if (!Array.isArray(cols) || cols.length === 0) {
    await sequelize.query(
      `ALTER TABLE customer_document
       ADD COLUMN customer_application_id INT NULL AFTER customer_id,
       ADD INDEX idx_customer_document_app_id (customer_application_id)`
    );
    await sequelize.query(
      `UPDATE customer_document cd
       INNER JOIN (
         SELECT customer_id, MIN(id) AS app_id, COUNT(*) AS app_count
         FROM customer_application
         GROUP BY customer_id
       ) agg ON agg.customer_id = cd.customer_id AND agg.app_count = 1
       SET cd.customer_application_id = agg.app_id
       WHERE cd.customer_application_id IS NULL`
    );
  }
}

/**
 * Ensure customer.role ENUM supports extended RBAC roles cleanly on existing databases.
 */
async function ensureCustomerRbacRoleColumn() {
  const sequelize = require("../../sequelize");
  const [cols] = await sequelize.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'customer'
       AND COLUMN_NAME = 'role'`
  );
  const colType = String(cols?.[0]?.COLUMN_TYPE || "");
  if (colType && (!colType.includes("support_agent") || !colType.includes("compliance_officer"))) {
    await sequelize.query(
      `ALTER TABLE customer
       MODIFY COLUMN role ENUM('customer','marketing_agent','support_agent','compliance_officer','admin')
       NULL DEFAULT 'customer'`
    );
  }
}

/**
 * Copy any existing approved/custom rows from legacy content tables into `chatbot_store`
 * before dropping legacy tables (safe & idempotent on live upgrades).
 */
async function migrateLegacyRowsToSingleStore() {
  const sequelize = require("../../sequelize");
  const tableAdapters = [
    { table: "chatbot_knowledge_base", adapter: ChatbotKnowledgeBase },
    { table: "loan_product_catalog", adapter: LoanProductCatalog },
    { table: "loan_form_configurations", adapter: LoanFormConfig },
  ];
  const migrated = { chatbot_knowledge_base: 0, loan_product_catalog: 0, loan_form_configurations: 0 };

  for (const { table, adapter } of tableAdapters) {
    const [exists] = await sequelize.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tbl`,
      { replacements: { tbl: table } }
    );
    if (!Array.isArray(exists) || exists.length === 0) continue;

    const [rows] = await sequelize.query(`SELECT * FROM \`${table}\``);
    for (const rawRow of rows) {
      const clean = { ...rawRow };
      delete clean.id;
      for (const [key, val] of Object.entries(clean)) {
        if ((key.endsWith("_json") || key === "metadata") && typeof val === "string") {
          clean[key] = safeParseJson(val, null);
        }
      }
      await adapter.upsert(clean);
      migrated[table] += 1;
    }
  }
  return migrated;
}

/**
 * Drop the 8-to-9 superseded chatbot tables so only `chatbot_store` remains in MySQL.
 */
async function dropLegacyChatbotTables() {
  const sequelize = require("../../sequelize");
  const dropped = [];
  for (const tbl of LEGACY_CHATBOT_TABLES) {
    await sequelize.query(`DROP TABLE IF EXISTS \`${tbl}\``);
    dropped.push(tbl);
  }
  return dropped;
}

/**
 * Sync ONLY the single `chatbot_store` table in MySQL plus non-breaking column checks on existing website tables.
 */
async function syncChatbotModels() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    await ChatbotStore.sync();
    await ensureCustomerDocumentAppColumn();
    await ensureCustomerRbacRoleColumn();
  })().catch((err) => {
    syncPromise = null;
    throw err;
  });

  return syncPromise;
}

module.exports = {
  ChatbotStore,
  ChatbotKnowledgeBase,
  LoanProductCatalog,
  LoanFormConfig,
  ChatbotSession,
  ChatbotMessage,
  ChatbotApplicationDraft,
  ChatbotAnalyticsEvent,
  ChatbotAuditLog,
  ChatbotTurnTrace,
  getEphemeralAnalyticsSummary,
  migrateLegacyRowsToSingleStore,
  dropLegacyChatbotTables,
  syncChatbotModels,
};
