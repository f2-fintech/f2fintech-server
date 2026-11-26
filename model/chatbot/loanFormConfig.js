/**
 * Loan Form Configurations Model
 * Single backend source of truth mirroring existing frontend multi-step
 * application fields, validations, tenure options, and document requirements.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const LoanFormConfig = sequelize.define(
  "loan_form_configurations",
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
    loan_type: {
      type: Sequelize.STRING(80),
      allowNull: false,
      unique: true,
    },
    loan_category: {
      type: Sequelize.ENUM("secured", "unsecured"),
      allowNull: false,
    },
    display_name: {
      type: Sequelize.STRING(120),
      allowNull: false,
    },
    display_name_hi: {
      type: Sequelize.STRING(120),
      allowNull: true,
    },
    amount_min: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 50000,
    },
    amount_max: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 100000000,
    },
    tenure_options_json: jsonColumn("tenure_options_json", { allowNull: false, fallback: [] }),
    mandatory_fields_json: jsonColumn("mandatory_fields_json", { allowNull: false, fallback: [] }),
    optional_fields_json: jsonColumn("optional_fields_json", { allowNull: false, fallback: [] }),
    category_fields_json: jsonColumn("category_fields_json", { allowNull: true, fallback: [] }),
    mandatory_documents_json: jsonColumn("mandatory_documents_json", { allowNull: false, fallback: [] }),
    optional_documents_json: jsonColumn("optional_documents_json", { allowNull: false, fallback: [] }),
    supports_bankkaro: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    supports_sammaan: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: Sequelize.ENUM("draft", "pending_approval", "approved", "archived"),
      allowNull: false,
      defaultValue: "approved",
    },
    approved_by: {
      type: Sequelize.INTEGER,
      allowNull: true,
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

module.exports = LoanFormConfig;

