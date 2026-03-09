/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");

const CustomerApplication = sequelize.define(
  "customer_application",
  {
    customer_id: {
      type: Sequelize.INTEGER,
    },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    applied_by: {
      type: Sequelize.INTEGER,
    },
    application_no: {
      type: Sequelize.INTEGER,
    },
    provider: {
      type: Sequelize.STRING,
    },
    loan_type: {
      type: Sequelize.ENUM,
      values: ['personal loan', 'business loan', 'professional loan', 'home loan', 'education loan', 'lap', 'machinery loan', 'auto loan', 'just inquiry']
    },
    lead_type: {
      type: Sequelize.ENUM,
      values: ['notion', 'dialler', 'field visit', 'sourcer', 'channel partner', 'ref from customer', 'left employee follow up']
    },
    loan_category: {
      type: Sequelize.ENUM,
      values: ['secured', 'unsecured']
    },
    amount: {
      type: Sequelize.DECIMAL,
    },
    tenure: {
      type: Sequelize.INTEGER,
    },
    interest_rate: {
      type: Sequelize.DECIMAL,
    },
    emi_amount: {
      type: Sequelize.DECIMAL,
    },
    emi_count: {
      type: Sequelize.INTEGER,
    },
    is_picked: {
      type: Sequelize.TINYINT,
    },
    application_date: {
      type: "Timestamp",
    },
    start_date: {
      type: "Timestamp",
    },
    end_date: {
      type: Sequelize.DATE,
    },
    last_updated: {
      type: "Timestamp",
    },
    has_running_loans: {
      type: Sequelize.TINYINT,
    },
    which_loan: {
      type: Sequelize.STRING,
    },
    running_loan_amount: {
      type: Sequelize.DECIMAL,
    },
    case_type: {
      type: Sequelize.ENUM,
      values: ['top_up', 'fresh']
    },
    utm_attributes: {
      type: Sequelize.JSON,
    },
    source: {
      type: Sequelize.STRING,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = CustomerApplication;
