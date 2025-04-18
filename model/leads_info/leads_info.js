const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
// const LeadsModel = require("./leads");

const LeadsInfoModel = sequelize.define(
  "leads_info",
  {
    pan: {
      type: Sequelize.STRING,
    },
    dob: {
      type: Sequelize.STRING,
    },
    loan_category: {
      type: Sequelize.STRING,
    },
    income: {
      type: Sequelize.STRING,
    },
    employment_type: {
      type: Sequelize.STRING,
    },
    loan_amount: {
      type: Sequelize.STRING,
    },
    loan_history: {
      type: Sequelize.STRING,
    },
    company_registration: {
      type: Sequelize.STRING,
    },
    gst_number: {
      type: Sequelize.STRING,
    },
    itr_years: {
      type: Sequelize.STRING,
    },
    incorporation_date: {
      type: Sequelize.STRING,
    },
    property_location: {
      type: Sequelize.STRING,
    },
    property_value: {
      type: Sequelize.STRING,
    },
    profession_type: {
      type: Sequelize.STRING,
    },
    experience_years: {
      type: Sequelize.STRING,
    },
    license_number: {
      type: Sequelize.STRING,
    },
    existing_obligations: {
      type: Sequelize.STRING,
    },
    requested_emi: {
      type: Sequelize.STRING,
    },
    cibil: {
      type: Sequelize.STRING,
    },
  },
  {
    freezeTableName: true,
    timestamps: false,
  }
);

// One-to-One Relationship with Leads
// LeadsModel.hasOne(LeadsInfoModel, {
//   foreignKey: "lead_id",
//   onDelete: "CASCADE",
// });

// LeadsInfoModel.belongsTo(LeadsModel, {
//   foreignKey: "lead_id",
// });

module.exports = LeadsInfoModel;
