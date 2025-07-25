/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");

const CustomerModel = sequelize.define(
  "customer",
  {
    name: {
      type: Sequelize.STRING
    },
    password: {
      type: Sequelize.STRING
    },
    email: {
      type: Sequelize.STRING
    },
    contact: {
      type: Sequelize.STRING
    },
    gender: {
      type: Sequelize.ENUM,
      values: ["male", "female", "other"]
    },
    status: {
      type: Sequelize.ENUM,
      values: ["active", "inactive"]
    },
    dob: {
      type: Sequelize.DATE,
    },
    created_at: {
      type: "Timestamp"
    },
  },
  {
    freezeTableName: true,
    timestamps: false
  }
);

module.exports = CustomerModel;
