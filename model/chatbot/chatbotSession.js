/**
 * Chatbot Session Model
 * Stores multi-turn conversation state, verified identity bindings, and preferences.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const ChatbotSession = sequelize.define(
  "chatbot_sessions",
  {
    id: {
      type: Sequelize.STRING(64),
      primaryKey: true,
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
    guest_token_hash: {
      type: Sequelize.STRING(128),
      allowNull: true,
    },
    verified_contact: {
      type: Sequelize.STRING(20),
      allowNull: true,
    },
    verified_email: {
      type: Sequelize.STRING(180),
      allowNull: true,
    },
    otp_verified_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    language: {
      type: Sequelize.ENUM("en", "hi"),
      allowNull: false,
      defaultValue: "en",
    },
    active_intent: {
      type: Sequelize.STRING(80),
      allowNull: true,
    },
    context_json: jsonColumn("context_json", { allowNull: true, fallback: {} }),
    status: {
      type: Sequelize.ENUM("active", "closed"),
      allowNull: false,
      defaultValue: "active",
    },
    last_active_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
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

module.exports = ChatbotSession;

