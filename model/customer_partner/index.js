/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const CustomerPartnerModel = sequelize.define(
  "customer_partner",
  {
    customer_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    company_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    role: {
      type: Sequelize.ENUM,
      values: ["director", "partner"],
    },
    aadhaar: {
      type: Sequelize.STRING,
    },
    pan: {
      type: Sequelize.STRING,
    },
    mobile: {
      type: Sequelize.STRING,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = CustomerPartnerModel;
