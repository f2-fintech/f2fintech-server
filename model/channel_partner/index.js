// backend/model/channel_partner.js
const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const ChannelPartnerModel = sequelize.define(
    "channel_partner",
    {
        organization: {
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

module.exports = ChannelPartnerModel;
