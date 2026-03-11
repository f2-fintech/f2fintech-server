const SendQueryModel = require("../../model/send_query");
const Utility = require("../../utility");

const SendQueryController = {
    createSendQuery: async (req, res) => {
        try {
            const { name, number, email, query_type } = req.body;

            if (!name || !number || !email || !query_type) {
                return res.status(400).send(Utility.formatResponse(400, "Name, Number, Email, and Query Type are required"));
            }

            const newEntry = await SendQueryModel.create({ 
                name, 
                number, 
                email, 
                query_type 
            });

            return res.status(201).send(Utility.formatResponse(201, newEntry));
        } catch (error) {
            return res.status(500).send(Utility.formatResponse(500, error.message));
        }
    },

    getSendQueries: async (req, res) => {
        try {
            const { limit = 10, offset = 0 } = req.query;
            const list = await SendQueryModel.findAndCountAll({
                order: [['created_at', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset),
            });

            const { count, rows } = list;
            if (count > 0) {
                return res.status(200).send(Utility.formatResponse(200, rows, count));
            } else {
                return res.status(404).send(Utility.formatResponse(404, "No Data Found"));
            }
        } catch (error) {
            return res.status(500).send(Utility.formatResponse(500, error.message));
        }
    }
};

module.exports = SendQueryController;
