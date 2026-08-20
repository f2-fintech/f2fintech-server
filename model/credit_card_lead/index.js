const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const CreditCardLeadModel = sequelize.define(
  "credit_card_lead",
  {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    full_name: {
      type: Sequelize.STRING(150),
      allowNull: false,
    },
    mobile: {
      type: Sequelize.STRING(15),
      allowNull: false,
    },
    email: {
      type: Sequelize.STRING(200),
      allowNull: true,
    },
    city: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    pincode: {
      type: Sequelize.STRING(10),
      allowNull: true,
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
    bank_name: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    card_type: {
      type: Sequelize.STRING(50),
      allowNull: true,
    },
    joining_fee_text: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    campaign_id: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    click_id: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    tracking_url: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    customer_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    ip_address: {
      type: Sequelize.STRING(64),
      allowNull: true,
    },
    status: {
      type: Sequelize.ENUM("initiated", "converted", "lost"),
      defaultValue: "initiated",
    },
    admin_notes: {
      type: Sequelize.TEXT,
      allowNull: true,
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

module.exports = CreditCardLeadModel;
