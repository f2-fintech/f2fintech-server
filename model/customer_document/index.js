/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");

const CustomerDocumentModel = sequelize.define(
  "customer_document",
  {
    customer_id: {
      type: Sequelize.INTEGER,
    },
    document_url: {
      type: Sequelize.STRING,
    },
    created_at: {
      type: "TIMESTAMP",
    },
    type: {
      type: Sequelize.ENUM,
      values: [
        "aadhaar front",
        "aadhaar back",
        "pancard",
        "bank statement",
        "form 16",
        "payslips",
        "profile",
        "photo",
        "certificate",
        "audio",
      ],
    },
    company_id: {
      type: Sequelize.STRING,
      allowNull: false,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = CustomerDocumentModel;
