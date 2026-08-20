const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const CreditCardClickModel = sequelize.define(
  "credit_card_click",
  {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    card_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    card_name: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    card_alias: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    campaign_id: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    click_id: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    tracking_url: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    customer_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    user_agent: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    ip_address: {
      type: Sequelize.STRING(64),
      allowNull: true,
    },
    referrer: {
      type: Sequelize.STRING(512),
      allowNull: true,
    },
    card_type: {
      type: Sequelize.STRING(50),
      allowNull: true,
    },
    bank_name: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    card_tags: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    joining_fee_text: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    commissionable: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
    },
    created_at: {
      type: "TIMESTAMP",
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: "TIMESTAMP",
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = CreditCardClickModel;
