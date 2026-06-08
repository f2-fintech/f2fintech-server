const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const CareersModel = sequelize.define(
    "careers",
    {
        organization: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        position: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        name: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        contact: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        email: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        state: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        city: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        description: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        created_at: {
            type: "Timestamp"
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = CareersModel;
