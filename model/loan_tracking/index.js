/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");

const LoanTrackingModel = sequelize.define(
  "loan_tracking",
  {
    customer_application_id: {
      type: Sequelize.INTEGER,
    },
    status: {
      type: Sequelize.ENUM,
      values: [
        'submitted',
        'under credit review',
        'login',
        'carry forward',
        'drop',
        'relook',
        'approved',
        'rejected'
      ],
    },
    updated_at: {
      type: "Timestamp",
    },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false
    }
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = LoanTrackingModel;
