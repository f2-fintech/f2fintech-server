const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const SecuredLoan = sequelize.define(
    "secured_loans",
    {
        // --- Step 1: Personal Information ---
        firstName: { type: Sequelize.STRING, allowNull: false },
        middleName: { type: Sequelize.STRING, allowNull: true },
        lastName: { type: Sequelize.STRING, allowNull: false },
        mobileNo: { type: Sequelize.STRING, allowNull: false },
        emailId: { type: Sequelize.STRING, allowNull: true },
        aadhaarNo: { type: Sequelize.STRING, allowNull: true },
        panNo: { type: Sequelize.STRING, allowNull: true },
        residentialStatus: { type: Sequelize.STRING, allowNull: true },

        // --- Step 2: Employment & Income ---
        applicantCategory: { type: Sequelize.STRING, allowNull: true },
        applicantType: { type: Sequelize.STRING, allowNull: true },
        companyName: { type: Sequelize.STRING, allowNull: true },
        grossSalary: { type: Sequelize.FLOAT, allowNull: true },

        // --- Step 3: Loan & Property Details ---
        expectedLoanAmount: { type: Sequelize.FLOAT, allowNull: false },
        loanTenure: { type: Sequelize.STRING, allowNull: true },
        loanType: { type: Sequelize.STRING, allowNull: true },
        loanPurpose: { type: Sequelize.STRING, allowNull: true },
        typeOfProperty: { type: Sequelize.STRING, allowNull: true },
        propertyIdentified: { type: Sequelize.STRING, allowNull: true },
        projectPropertyName: { type: Sequelize.STRING, allowNull: true },
        zipCode: { type: Sequelize.STRING, allowNull: false },
        city: { type: Sequelize.STRING, allowNull: true },
        product: { type: Sequelize.STRING, defaultValue: "HL" },

        // --- External API Fields ---
        externalLeadId: { type: Sequelize.STRING, allowNull: true },
        status: { type: Sequelize.STRING, defaultValue: "Pending" },
        documentUploaded: { type: Sequelize.BOOLEAN, defaultValue: false },
        documentId: { type: Sequelize.STRING, allowNull: true },
        currentStatus: { type: Sequelize.STRING, allowNull: true },
        sanctionAmount: { type: Sequelize.FLOAT, allowNull: true },
        disbursalAmount: { type: Sequelize.FLOAT, allowNull: true },
        rejectReason: { type: Sequelize.STRING, allowNull: true },
    },
    {
        freezeTableName: true,
        timestamps: true,
    }
);

// Auto-sync: creates the table if it doesn't exist, adds missing columns (alter: true)
SecuredLoan.sync({ alter: true }).catch((err) => {
  console.error("SecuredLoan sync error:", err.message);
});

module.exports = SecuredLoan;
