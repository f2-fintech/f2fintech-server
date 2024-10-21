/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");

const CustomerInfoModel = sequelize.define(
  "customer_info",
  {
    customer_id: {
      type: Sequelize.INTEGER
    },
    pan: {
      type: Sequelize.STRING
    },
    aadhaar: {
      type: Sequelize.STRING
    },
    bank: {
      type: Sequelize.STRING
    },
    bank_ac_type: {
      type: Sequelize.ENUM,
      values: ['current', 'savings', 'fixed deposit', 'recurring deposit'],
    },
    occupation_type: {
      type: Sequelize.ENUM,
      values: ['salaried', 'non-salaried', 'professional'],
    },
    salary: {
      type: Sequelize.INTEGER,
    },
    existing_emi: {
      type: Sequelize.INTEGER,
    },
    existing_liability: {
      type: Sequelize.INTEGER,
    },
    occupation: {
      type: Sequelize.STRING,
    },
    gst_registered: {
      type: Sequelize.BOOLEAN,
    },
    company_registered: {
      type: Sequelize.BOOLEAN,
    },
    company: {
      type: Sequelize.STRING,
    },
    gst_number: {
      type: Sequelize.STRING,
    },
    street: {
      type: Sequelize.STRING,
    },
    landmark: {
      type: Sequelize.STRING,
    },
    zipcode: {
      type: Sequelize.STRING,
    },
    city: {
      type: Sequelize.STRING,
    },
    state: {
      type: Sequelize.STRING,
    },
    referral_id: {
      type: Sequelize.INTEGER,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = CustomerInfoModel;
