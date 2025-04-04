const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const GetInTouchModel = sequelize.define(
    "leads",
    {
        name: {
            type: Sequelize.STRING,
            allowNull: false
        },
        qualification: {
            type: Sequelize.STRING,
            allowNull: false
        },
        number: {
            type: Sequelize.STRING, // Change from INTEGER to STRING if needed
            allowNull: false
        }
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = GetInTouchModel;
