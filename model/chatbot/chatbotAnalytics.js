/**
 * Chatbot Analytics & Audit Log Models
 * Analytics strictly exclude customer PII; audit logs track sensitive actions.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const ChatbotAnalyticsEvent = sequelize.define(
  "chatbot_analytics_events",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 101,
    },
    session_id: {
      type: Sequelize.STRING(64),
      allowNull: true,
    },
    event_type: {
      type: Sequelize.ENUM(
        "session_started",
        "faq_asked",
        "category_explored",
        "comparison_run",
        "recommendation_run",
        "emi_calculated",
        "app_started",
        "app_completed",
        "app_abandoned",
        "doc_upload_failed",
        "unresolved_query",
        "feedback_submitted",
        "support_escalated"
      ),
      allowNull: false,
    },
    loan_category: {
      type: Sequelize.STRING(80),
      allowNull: true,
    },
    provider_names_json: jsonColumn("provider_names_json", { allowNull: true, fallback: [] }),
    topic_tag: {
      type: Sequelize.STRING(150),
      allowNull: true,
    },
    rating: {
      type: Sequelize.TINYINT,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

const ChatbotAuditLog = sequelize.define(
  "chatbot_audit_logs",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    actor_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    actor_role: {
      type: Sequelize.STRING(50),
      allowNull: true,
    },
    action: {
      type: Sequelize.STRING(120),
      allowNull: false,
    },
    resource_type: {
      type: Sequelize.STRING(80),
      allowNull: true,
    },
    resource_id: {
      type: Sequelize.STRING(120),
      allowNull: true,
    },
    ip_address: {
      type: Sequelize.STRING(64),
      allowNull: true,
    },
    metadata_json: jsonColumn("metadata_json", { allowNull: true, fallback: {} }),
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = {
  ChatbotAnalyticsEvent,
  ChatbotAuditLog,
};

