const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
// const LeadsModel = require("./leads");

const LeadsInfoModel = sequelize.define(
  "leads_info",
  {
    name: {
      type: Sequelize.STRING,
    },
    contact: {
      type: Sequelize.STRING,
    },
    pan: {
      type: Sequelize.STRING,
    },
    dob: {
      type: Sequelize.STRING,
    },
    loan_category: {
      type: Sequelize.STRING,
    },
    age: {
      type: Sequelize.STRING,
    },
    income: {
      type: Sequelize.STRING,
    },
    loan_amount: {
      type: Sequelize.STRING,
    },
    loan_history: {
      type: Sequelize.STRING,   // Use TEXT because JSON.stringify can be long
      allowNull: true,
    },
    company_registration_type: {
      type: Sequelize.STRING,
    },
    gst_number: {
      type: Sequelize.STRING,
    },
    udhyam_number: {
      type: Sequelize.STRING,
    },
    itr: {
      type: Sequelize.STRING,
    },
    turnover: {
      type: Sequelize.STRING,
    },
    profit: {
      type: Sequelize.STRING,
    },
    incorporation_date: {
      type: Sequelize.STRING,
    },
    property_type: {
      type: Sequelize.STRING,
    },
    ownership_type: {
      type: Sequelize.STRING,
    },
    property_location: {
      type: Sequelize.STRING,
    },
    estimated_value: {
      type: Sequelize.STRING,
    },
    employment_type: {
      type: Sequelize.STRING,
    },
    doctor_type: {
      type: Sequelize.STRING,
    },
    // date_of_regisration: {
    //   type: Sequelize.STRING,
    // },
    degree: {
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

// const cleanPayload = (data) => {
//   const cleaned = {};
//   for (const key in data) {
//     if (allowedFields.includes(key)) {
//       cleaned[key] = data[key];
//     }
//   } return cleaned;
// };

module.exports = LeadsInfoModel;
