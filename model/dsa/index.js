// backend/model/dsa/index.js
const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const DsaModel = sequelize.define(
    "dsa",
    {
        name: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        email: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        mobile: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        company_gst: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        gender: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        age: {
            type: Sequelize.INTEGER,
            allowNull: true,
        },
        city: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        experience: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        aadhaar_doc: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        pan_doc: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        bank_proof_doc: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        photo_doc: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        rera_gst_doc: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        created_at: {
            type: "TIMESTAMP",
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = DsaModel;
