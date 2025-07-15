// controller/credit_score/index.js
const finboxService = require("../services/finboxService"); // corrected path

const getCibilScore = async (req, res) => {
    const { name, pan, phone, dob } = req.body;

    try {
        const score = await finboxService.fetchCibilScore({ name, pan, phone, dob });
        res.status(200).json({ cibilScore: score });
    } catch (err) {
        console.error("Error fetching CIBIL score:", err);
        res.status(500).json({ error: "Failed to retrieve score" });
    }
};

module.exports = { getCibilScore };
