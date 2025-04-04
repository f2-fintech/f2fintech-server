const GetInTouchModel = require("../../model/get_in_touch/getInTouch"); // Ensure correct model
const Utility = require("../../utility");

const GetInTouchController = {
    createGetInTouch: async (req, res) => {
        try {
            const { name, qualification, number } = req.body;

            if (!name || !qualification || !number) {
                return res.status(400).send(Utility.formatResponse(400, "Name, Qualification, and Number are required"));
            }

            // Create a new record without customer_id
            const newEntry = await GetInTouchModel.create({ name, qualification, number });

            return res.status(201).send(Utility.formatResponse(201, newEntry));
        } catch (error) {
            return res.status(500).send(Utility.formatResponse(500, error.message));
        }
    },
};

module.exports = GetInTouchController;
