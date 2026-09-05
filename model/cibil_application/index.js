const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const CibilApplicationModel = sequelize.define(
  "cibil_applications",
  {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ref_id: {
      type: Sequelize.STRING(50),
      allowNull: false,
      unique: true,
    },
    first_name: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    last_name: {
      type: Sequelize.STRING(100),
      allowNull: false,
    },
    full_name: {
      type: Sequelize.STRING(200),
      allowNull: false,
    },
    mobile: {
      type: Sequelize.STRING(20),
      allowNull: false,
    },
    email: {
      type: Sequelize.STRING(200),
      allowNull: true,
    },
    pan: {
      type: Sequelize.STRING(20),
      allowNull: true,
    },
    amount: {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 50.0,
    },
    payment_id: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    payment_status: {
      type: Sequelize.STRING(50),
      defaultValue: "success",
    },
    credit_score: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    report_url: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    status: {
      type: Sequelize.STRING(50),
      defaultValue: "completed",
    },
    bureau: {
      type: Sequelize.STRING(50),
      defaultValue: "Experian",
    },
    ip_address: {
      type: Sequelize.STRING(100),
      allowNull: true,
    },
    user_agent: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    updated_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
  },
  {
    tableName: "cibil_applications",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Auto-sync table if not exists
CibilApplicationModel.sync({ alter: false }).catch((err) => {
  console.log("CibilApplicationModel sync note:", err.message);
});

module.exports = CibilApplicationModel;
