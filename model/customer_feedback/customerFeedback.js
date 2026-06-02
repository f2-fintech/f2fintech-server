/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const CustomerFeedbackModel = sequelize.define(
  "customer_feedback",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Q1 – Loan type (Single Choice)
    loan_type: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    // Q2 – Overall satisfaction (1–5 Stars)
    overall_satisfaction: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    // Q3 – Areas of improvement (Multiple Choice Checkboxes, comma-separated values)
    improvement_areas: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    // Q4 – Likelihood to recommend (1–10 Rating)
    recommend_score: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    // Q5 – Additional feedback / suggestions (Multiline Text)
    valuable_feedback: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    // Submission timestamp
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
      allowNull: false,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = CustomerFeedbackModel;
