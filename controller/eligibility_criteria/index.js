const EligibilityBasicModel = require("../../model/leads_info/leads_info");
const Utility = require("../../utility");

const EligibilityBasicController = {
    createEligibilityBasic: async (req, res) => {
        const payload = req.body;

        // 🔥 Convert loanHistory to loan_history before saving
        if (payload.loanHistory) {
            payload.loan_history = JSON.stringify(payload.loanHistory);
            delete payload.loanHistory;
        }

        try {
            const result = await EligibilityBasicModel.create(payload);
            return res.status(200).send(Utility.formatResponse(200, result));
        } catch (err) {
            return res.status(500).send(Utility.formatResponse(500, err.message));
        }
    },

    updateEligibilityBasic: async (req, res) => {
        const id = req.params.id;
        const payload = req.body;

        console.log("Updating ID:", id);
        console.log("Payload:", payload);

        // 🔥 Convert loanHistory to loan_history before updating
        if (payload.loanHistory) {
            payload.loan_history = JSON.stringify(payload.loanHistory);
            delete payload.loanHistory;
        }

        try {
            const [rowsUpdated] = await EligibilityBasicModel.update(payload, {
                where: { id },
            });

            if (rowsUpdated === 0) {
                return res.status(404).send(Utility.formatResponse(404, "Record not found"));
            }

            const updatedDoc = await EligibilityBasicModel.findOne({ where: { id } });
            return res.status(200).send(Utility.formatResponse(200, updatedDoc));
        } catch (err) {
            console.error("Update error:", err);
            return res.status(500).send(Utility.formatResponse(500, err.message));
        }
    },
    getLeadInfoById: async (req, res) => {
        const id = req.params.id;
        try {
            const leadInfo = await EligibilityBasicModel.findOne({ where: { id } });
            if (!leadInfo) {
                return res.status(404).send(Utility.formatResponse(404, "Lead not found"));
            }
            return res.status(200).send(Utility.formatResponse(200, leadInfo));
        } catch (err) {
            return res.status(500).send(Utility.formatResponse(500, err.message));
        }
    }


};


module.exports = EligibilityBasicController;
