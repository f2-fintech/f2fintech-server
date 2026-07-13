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
        gender: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        age: {
            type: Sequelize.INTEGER,
            allowNull: false,
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
