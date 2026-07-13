// backend/controller/dsa/index.js
const DsaModel = require("../../model/dsa/index");
const Utility = require("../../utility");

const DsaController = {
    createDsa: (req, res) => {
        const payload = req.body;

        return new Promise((resolve, reject) => {
            DsaModel.create(payload)
                .then((result) => {
                    resolve(res.status(200).send(Utility.formatResponse(200, result)));
                })
                .catch((err) => {
                    reject(res.status(500).send(Utility.formatResponse(500, err)));
                });
        });
    },

    getAllDsas: (req, res) => {
        return new Promise((resolve, reject) => {
            DsaModel.findAll({ order: [["created_at", "DESC"]] })
                .then((result) => {
                    resolve(res.status(200).send(Utility.formatResponse(200, result)));
                })
                .catch((err) => {
                    reject(res.status(500).send(Utility.formatResponse(500, err)));
                });
        });
    },
};

module.exports = DsaController;
