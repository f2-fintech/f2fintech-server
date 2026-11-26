/**
 * Chatbot Message Model
 * Stores conversation turns and structured UI payloads per session.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const ChatbotMessage = sequelize.define(
  "chatbot_messages",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    session_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
    },
    sender: {
      type: Sequelize.ENUM("user", "assistant", "system"),
      allowNull: false,
    },
    message_text: {
      type: Sequelize.TEXT("long"),
      allowNull: false,
    },
    structured_payload_json: jsonColumn("structured_payload_json", { allowNull: true, fallback: [] }),
    language: {
      type: Sequelize.ENUM("en", "hi"),
      allowNull: false,
      defaultValue: "en",
    },
    intent: {
      type: Sequelize.STRING(80),
      allowNull: true,
    },
    feedback_rating: {
      type: Sequelize.TINYINT,
      allowNull: true,
    },
    feedback_comment: {
      type: Sequelize.STRING(500),
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

module.exports = ChatbotMessage;

