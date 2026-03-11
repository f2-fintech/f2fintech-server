const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const SendQueryModel = sequelize.define(
    "send_query",
    {
        name: {
            type: Sequelize.STRING,
            allowNull: false
        },
        number: {
            type: Sequelize.STRING,
            allowNull: false
        },
        email: {
            type: Sequelize.STRING,
            allowNull: false
        },
        query_type: {
            type: Sequelize.ENUM,
            values: [
                "send Query for loan",
                "send query for channel partner",
                "send query for job",
                "send query for any other association",
                "others"
            ],
            allowNull: false
        },
        created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        }
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = SendQueryModel;
