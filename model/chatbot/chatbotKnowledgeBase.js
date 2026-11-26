/**
 * Chatbot Knowledge Base Model
 * Stores approved internal F2Fintech company info, FAQs, policies, and guides.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const ChatbotKnowledgeBase = sequelize.define(
  "chatbot_knowledge_base",
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
    slug: {
      type: Sequelize.STRING(180),
      allowNull: false,
      unique: true,
    },
    category: {
      type: Sequelize.ENUM(
        "company_info",
        "loan_category",
        "policy",
        "faq",
        "application_guide",
        "support",
        "blog_summary"
      ),
      allowNull: false,
      defaultValue: "faq",
    },
    title: {
      type: Sequelize.STRING(255),
      allowNull: false,
    },
    content_en: {
      type: Sequelize.TEXT("long"),
      allowNull: false,
    },
    content_hi: {
      type: Sequelize.TEXT("long"),
      allowNull: true,
    },
    keywords: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    metadata_json: jsonColumn("metadata_json", { allowNull: true, fallback: {} }),
    source_ref: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    status: {
      type: Sequelize.ENUM("draft", "pending_approval", "approved", "archived"),
      allowNull: false,
      defaultValue: "draft",
    },
    version: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    created_by: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    approved_by: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    approved_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    vector_synced_at: {
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

module.exports = ChatbotKnowledgeBase;

