/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");

const LoanProviderModel = sequelize.define(
  "loan_provider",
  {
    max_tenure: {
      type: Sequelize.INTEGER,
    },
    max_amount: {
      type: Sequelize.INTEGER,
    },
    min_amount: {
      type: Sequelize.INTEGER,
    },
    is_home: {
      type: Sequelize.BOOLEAN,
    },
    home_image: {
      type: Sequelize.STRING,
    },
    title: {
      type: Sequelize.STRING,
    },
    interest_rate: {
      type: Sequelize.STRING,
    },
    description: {
      type: Sequelize.STRING,
    },
    short_description: {
      type: Sequelize.STRING,
    },
    long_description: {
      type: Sequelize.STRING,
    },
    charges: {
      type: Sequelize.STRING,
    },
    minimum_kyc: {
      type: Sequelize.STRING,
    },
    document_required: {
      type: Sequelize.STRING,
    },
    created_at: {
      type: "Timestamp"
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = LoanProviderModel;
