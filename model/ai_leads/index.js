/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Sequelize = require("sequelize");

const sequelize = require("../../sequelize");

const AiLeads = sequelize.define(
    "ai_leads",
    {
        name: {
            type: Sequelize.STRING,
        },
        loan_type: {
            type: Sequelize.STRING,
            // values: ['personal loan', 'business loan', 'home loan', 'ca', 'doctor', 'machinery loan']
        },
        application_date: {
            type: "Timestamp",
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = AiLeads;
