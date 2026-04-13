/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");
const CustomerModel = require("../customer");

const CustomerReviewModel = sequelize.define(
  "customer_review",
  {
    customer_id: {
      type: Sequelize.INTEGER,
      references: {
        model: CustomerModel,
        key: "id",
      },
    },
    rating: {
      type: Sequelize.DECIMAL,
    },
    review: {
      type: Sequelize.STRING,
    },
    thumbnail: {
      type: Sequelize.STRING,
    },
    created_at: {
      type: 'Timestamp'
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = CustomerReviewModel;
