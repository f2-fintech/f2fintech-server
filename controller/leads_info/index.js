const LeadsInfoModel = require("../../model/leads_info/leads_info");
const Utility = require("../../utility");

const LeadsInfoController = {
    createLeadsInfo: async (req, res) => {
        try {
            const payload = req.body;
            // Directly create with the payload as-is
            const result = await LeadsInfoModel.create(payload);
            return res.status(200).send(
                Utility.formatResponse(200, {
                    message: "Lead info created successfully",
                    data: result
                })
            );

        } catch (err) {
            console.error("Error creating lead info:", err);
            return res.status(500).send(
                Utility.formatResponse(500, err.message || "Internal server error")
            );
        }
    },

    updateLeadsInfo: async (req, res) => {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Check if lead exists
            const lead = await LeadsInfoModel.findByPk(id);

            if (!lead) {
                return res.status(404).send(
                    Utility.formatResponse(404, "Lead not found")
                );
            }

            // Update the lead with new data
            await lead.update(updateData);

            // Fetch the updated lead
            const updatedLead = await LeadsInfoModel.findByPk(id);

            return res.status(200).send(
                Utility.formatResponse(200, {
                    message: "Lead info updated successfully",
                    data: updatedLead
                })
            );

        } catch (err) {
            console.error("Error updating lead info:", err);
            return res.status(500).send(
                Utility.formatResponse(500, err.message || "Internal server error")
            );
        }
    },

    // Optional: Get all leads info
    getAllLeadsInfo: async (req, res) => {
        try {
            const leads = await LeadsInfoModel.findAll();
            return res.status(200).send(
                Utility.formatResponse(200, leads)
            );
        } catch (err) {
            return res.status(500).send(
                Utility.formatResponse(500, err.message)
            );
        }
    },
};

module.exports = LeadsInfoController;