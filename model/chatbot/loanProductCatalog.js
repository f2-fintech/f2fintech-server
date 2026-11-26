/**
 * Loan Product Catalog Model
 * Structured provider x loan category matrix backed by approved F2Fintech data.
 * Missing attributes remain NULL and are rendered explicitly as "Not Available".
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
const { jsonColumn } = require("./jsonColumn");

const LoanProductCatalog = sequelize.define(
  "loan_product_catalog",
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
    loan_provider_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    provider_name: {
      type: Sequelize.STRING(150),
      allowNull: false,
    },
    provider_short_name: {
      type: Sequelize.STRING(80),
      allowNull: true,
    },
    provider_logo: {
      type: Sequelize.STRING(500),
      allowNull: true,
    },
    loan_category_slug: {
      type: Sequelize.STRING(80),
      allowNull: false,
    },
    product_slug: {
      type: Sequelize.STRING(180),
      allowNull: false,
      unique: true,
    },
    rate_min: {
      type: Sequelize.DECIMAL(6, 2),
      allowNull: true,
    },
    rate_max: {
      type: Sequelize.DECIMAL(6, 2),
      allowNull: true,
    },
    rate_range_text: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    apr_min: {
      type: Sequelize.DECIMAL(6, 2),
      allowNull: true,
    },
    apr_max: {
      type: Sequelize.DECIMAL(6, 2),
      allowNull: true,
    },
    processing_fee_text: {
      type: Sequelize.STRING(150),
      allowNull: true,
    },
    min_amount: {
      type: Sequelize.BIGINT,
      allowNull: true,
    },
    max_amount: {
      type: Sequelize.BIGINT,
      allowNull: true,
    },
    amount_text: {
      type: Sequelize.STRING(120),
      allowNull: true,
    },
    min_tenure_months: {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 12,
    },
    max_tenure_months: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    min_monthly_income: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    min_cibil: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    max_foir_percent: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    ltv_text: {
      type: Sequelize.STRING(80),
      allowNull: true,
    },
    prepayment_charges: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    foreclosure_charges: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    other_fees_json: jsonColumn("other_fees_json", { allowNull: true, fallback: [] }),
    eligibility_criteria_json: jsonColumn("eligibility_criteria_json", { allowNull: true, fallback: [] }),
    required_documents_json: jsonColumn("required_documents_json", { allowNull: true, fallback: [] }),
    supported_employment_types_json: jsonColumn("supported_employment_types_json", { allowNull: true, fallback: [] }),
    about_text: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    faq_json: jsonColumn("faq_json", { allowNull: true, fallback: [] }),
    is_recommended: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: Sequelize.ENUM("draft", "pending_approval", "approved", "archived"),
      allowNull: false,
      defaultValue: "approved",
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

module.exports = LoanProductCatalog;

