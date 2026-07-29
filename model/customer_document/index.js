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
        'aadhaar front', 'aadhaar back', 'pancard', 'bank statement', 'form 16', 'itr', 'salary slip',
        'computation of income', 'financials', 'udhyam certificate', 'gst', 'form 26 as', 'list of directors',
        'list of shareholders', 'aoa', 'moa', 'company pan', 'directors kyc', 'partnership deed', 'ug certificate',
        'pg certificate', 'registration', 'photo', 'profile photo', 'certificate', 'audio', 'current address proof',
        'cop', 'com', 'firm card', 'cancel cheque', 'company id card', 'co-applicant aadhaar front', 'co-applicant aadhaar back', 'co-applicant pan',
        'marksheet 10', 'marksheet 12', 'graduation marksheet', 'offer letter', 'fee structure', 'entrance exam result',
        'property papers', 'seller kyc', 'allotment letter', 'title deed', 'board resolution', 'mca report', 'coi', 'ptm',
        'tpa', 'project noc', 'lod', 'ats', 'electricity bill', 'utility bill', 'ownership proof', 'share holding pattern'
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
