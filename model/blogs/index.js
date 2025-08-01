const Sequelize = require("sequelize");
const sequelize = require("../../sequelize");

const BlogModel = sequelize.define(
    "blog",
    {
        title: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        excerpt: {
            type: Sequelize.TEXT,
        },
        category: {
            type: Sequelize.STRING,
        },
        author: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        route: {
            type: Sequelize.STRING,
        },
        readTime: {
            type: Sequelize.STRING,
            field: "read_time",
        },
        featured: {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        image: {
            type: Sequelize.STRING,
        },
        content: {
            type: Sequelize.TEXT("long"),
            allowNull: false,
        },
        href: {
            type: Sequelize.STRING,
        },
        date: {
            type: Sequelize.STRING,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    }
);

module.exports = BlogModel;
