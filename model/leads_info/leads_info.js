const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");
// const LeadsModel = require("./leads");

const LeadsInfoModel = sequelize.define(
  "leads_info",
  {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    phone: {
      type: Sequelize.STRING(15),
      allowNull: false,
    },
    email: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    persona: {
      type: Sequelize.STRING, // Or ENUM if types are defined
      allowNull: false,
    },
    degree: {
      type: Sequelize.STRING,
    },
    experience_years: {
      type: Sequelize.INTEGER,
    },
    employment_type: {
      type: Sequelize.STRING, // Or ENUM
    },
    cibil_band: {
      type: Sequelize.STRING,
    },
    declared_income: {
      type: Sequelize.INTEGER,
    },
    existing_emi: {
      type: Sequelize.INTEGER,
    },
    product: {
      type: Sequelize.STRING, // Or ENUM
    },
    requested_limit: {
      type: Sequelize.INTEGER,
    },
    tenure_months: {
      type: Sequelize.INTEGER,
    },
    city: {
      type: Sequelize.STRING,
    },
    pincode: {
      type: Sequelize.STRING(10),
    },
    foreign_degree: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    college_on_list: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },

    // KYC Details
    aadhaar_number: {
      type: Sequelize.STRING(20),
    },
    pan_number: {
      type: Sequelize.STRING(10),
    },
    dob: {
      type: Sequelize.DATEONLY,
    },
    address: {
      type: Sequelize.TEXT,
    },

    // Banking + Income Details
    verified_income: {
      type: Sequelize.INTEGER,
    },
    professional_income: {
      type: Sequelize.INTEGER,
    },
    abb: {
      type: Sequelize.INTEGER,
    },
    amc: {
      type: Sequelize.INTEGER,
    },
    banking_vintage_months: {
      type: Sequelize.INTEGER,
    },
    bounces_6m: {
      type: Sequelize.INTEGER,
    },
    live_usl: {
      type: Sequelize.INTEGER,
    },
    verified_emi: {
      type: Sequelize.INTEGER,
    },
    emi_count: {
      type: Sequelize.INTEGER,
    },
    od_cc_present: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },

    // Legacy / Other Potential Fields (Kept if needed for DB consistency, but aligned types if possible)
    loan_category: {
      type: Sequelize.STRING,
    },
    age: {
      type: Sequelize.STRING,
    },
    loan_history: {
      type: Sequelize.TEXT,
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
    doctor_type: {
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
    provider: {
      type: Sequelize.STRING,
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
    },
    updated_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW
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
