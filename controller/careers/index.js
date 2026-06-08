const CareersModel = require("../../model/careers/index");
const Utility = require("../../utility");

const CareersController = {
    createCareer: (req, res) => {
        const payload = req.body;

        return new Promise((resolve, reject) => {
            CareersModel.create(payload)
                .then((result) => {
                    resolve(res.status(200).send(Utility.formatResponse(200, result)));
                })
                .catch((err) => {
                    reject(res.status(500).send(Utility.formatResponse(500, err)));
                });
        });
    },
};

module.exports = CareersController;
