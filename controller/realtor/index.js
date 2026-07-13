// backend/controller/realtor/index.js
const RealtorModel = require("../../model/realtor/index");
const Utility = require("../../utility");

const RealtorController = {
    createRealtor: (req, res) => {
        const payload = req.body;

        return new Promise((resolve, reject) => {
            RealtorModel.create(payload)
                .then((result) => {
                    resolve(res.status(200).send(Utility.formatResponse(200, result)));
                })
                .catch((err) => {
                    reject(res.status(500).send(Utility.formatResponse(500, err)));
                });
        });
    },

    getAllRealtors: (req, res) => {
        return new Promise((resolve, reject) => {
            RealtorModel.findAll({ order: [["created_at", "DESC"]] })
                .then((result) => {
                    resolve(res.status(200).send(Utility.formatResponse(200, result)));
                })
                .catch((err) => {
                    reject(res.status(500).send(Utility.formatResponse(500, err)));
                });
        });
    },
};

module.exports = RealtorController;
