// model/our_products/index.js
const { Sequelize, DataTypes } = require("sequelize");
const sequelize = require("../../sequelize");

const ProductLeadsModel = sequelize.define("product_leads", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    organization_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    contact: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    product: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    tableName: "product_leads",
    timestamps: false,
});

module.exports = ProductLeadsModel;
