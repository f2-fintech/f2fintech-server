/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const CustomerLoanInquiryModel = sequelize.define(
  "customer_loan_inquiry",
  {
    name: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    phone: {
      type: Sequelize.STRING(20),
      allowNull: false,
    },
    bank_name: {
      type: Sequelize.STRING(150),
      allowNull: true,
    },
    loan_type: {
      type: Sequelize.STRING(100),
      allowNull: true,
      defaultValue: "home_loan",
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

module.exports = CustomerLoanInquiryModel;
