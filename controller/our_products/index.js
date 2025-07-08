const ProductLeadsModel = require("../../model/our_products");
const Utility = require("../../utility");

const ProductLeadsController = {
    createProductLeads: async (req, res) => {
        const payload = req.body;
        try {
            const result = await ProductLeadsModel.create(payload);  // Sequelize's create method returns a promise
            return res.status(200).send(Utility.formatResponse(200, result));
        } catch (err) {
            console.error(err);  // Log the error for debugging
            return res.status(500).send(Utility.formatResponse(500, "An error occurred while creating the product lead."));
        }
    },
};

module.exports = ProductLeadsController;
