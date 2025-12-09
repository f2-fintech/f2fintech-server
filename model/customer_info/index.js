/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require( "sequelize" );

const sequelize = require( "../../sequelize" );

const CustomerInfoModel = sequelize.define(
  "customer_info",
  {
    customer_id: {
      type: Sequelize.INTEGER,
    },
    mother_name: {
      type: Sequelize.STRING,
    },
    pan: {
      type: Sequelize.STRING,
    },
    father_name: {
      type: Sequelize.STRING,
    },
    mother_name: {
      type: Sequelize.STRING,
    },
    working_address: {
      type: Sequelize.STRING,
    },
    permanent_address: {
      type: Sequelize.STRING,
    },
    current_address: {
      type: Sequelize.STRING,
    },
    aadhaar: {
      type: Sequelize.STRING,
    },
    bank: {
      type: Sequelize.STRING,
    },
    bank_ac_type: {
      type: Sequelize.ENUM,
      values: [ "current", "savings", "fixed deposit", "recurring deposit" ],
    },
    employment_type: {
      type: Sequelize.ENUM,
      values: [ "salaried", "self_employed", "professional" ],
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

module.exports = CustomerInfoModel;
