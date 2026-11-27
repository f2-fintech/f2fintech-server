/**
 * Single Unified Chatbot Database Table (`chatbot_store`)
 * Stores all approved Knowledge Base entries (`kb`), Loan Product Catalog (`catalog`),
 * and Loan Form Configurations (`form_config`) inside ONE MySQL table.
 * Zero chats, sessions, drafts, or analytics are persisted to MySQL.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const ChatbotStore = sequelize.define(
  "chatbot_store",
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
    record_type: {
      type: Sequelize.ENUM("kb", "catalog", "form_config"),
      allowNull: false,
    },
    record_key: {
      type: Sequelize.STRING(180),
      allowNull: false,
    },
    category: {
      type: Sequelize.STRING(120),
      allowNull: true,
    },
    title: {
      type: Sequelize.STRING(255),
      allowNull: false,
    },
    keywords: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    status: {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: "approved",
    },
    payload_json: jsonColumn("payload_json", { allowNull: false, fallback: {} }),
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
    indexes: [
      { unique: true, fields: ["company_id", "record_type", "record_key"] },
      { fields: ["company_id", "record_type", "status"] },
    ],
  }
);

module.exports = ChatbotStore;

