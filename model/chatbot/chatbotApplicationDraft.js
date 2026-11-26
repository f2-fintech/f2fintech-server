/**
 * Chatbot Application Draft Model
 * Persists encrypted conversational loan application progress, uploaded docs,
 * and idempotency keys to support resumption and prevent duplicate submission.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const ChatbotApplicationDraft = sequelize.define(
  "chatbot_application_drafts",
  {
    id: {
      type: Sequelize.STRING(64),
      primaryKey: true,
    },
    session_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
    },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 101,
    },
    customer_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    loan_type: {
      type: Sequelize.STRING(80),
      allowNull: true,
    },
    loan_category: {
      type: Sequelize.ENUM("secured", "unsecured"),
      allowNull: true,
    },
    current_step: {
      type: Sequelize.ENUM(
        "category",
        "personal",
        "employment",
        "loan_requirements",
        "documents",
        "review",
        "submitted"
      ),
      allowNull: false,
      defaultValue: "category",
    },
    form_data_encrypted: {
      type: Sequelize.TEXT("long"),
      allowNull: true,
    },
    uploaded_docs_json: jsonColumn("uploaded_docs_json", { allowNull: true, fallback: [] }),
    submitted_application_ids_json: jsonColumn("submitted_application_ids_json", { allowNull: true, fallback: [] }),
    idempotency_key: {
      type: Sequelize.STRING(128),
      allowNull: true,
      unique: true,
    },
    status: {
      type: Sequelize.ENUM("in_progress", "ready_for_review", "submitted", "abandoned"),
      allowNull: false,
      defaultValue: "in_progress",
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    updated_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = ChatbotApplicationDraft;

