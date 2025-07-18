// backend/controller/channelPartnerController.js
const ChannelPartnerModel = require("../../model/channel_partner/index");
const Utility = require("../../utility");

const ChannelPartnerController = {
    createChannelPartner: (req, res) => {
        const payload = req.body;

        return new Promise((resolve, reject) => {
            ChannelPartnerModel.create(payload)
                .then((result) => {
                    resolve(res.status(200).send(Utility.formatResponse(200, result)));
                })
                .catch((err) => {
                    reject(res.status(500).send(Utility.formatResponse(500, err)));
                });
        });
    },
};

module.exports = ChannelPartnerController;
