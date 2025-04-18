const LeadsInfoModel = require("../../model/leads_info/leads_info");
const Utility = require("../../utility");

const LeadsInfoController = {
    createLeadsInfo: (req, res) => {
        const payload = req.body;

        return new Promise((resolve, reject) => {
            LeadsInfoModel.create(payload)
                .then((result) => {
                    resolve(res.status(200).send(Utility.formatResponse(200, result)));
                })
                .catch((err) => {
                    reject(res.status(500).send(Utility.formatResponse(500, err.message)));
                });
        });
    }
};

module.exports = LeadsInfoController;
