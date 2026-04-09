const axios = require("axios");
const Utility = require("../../utility");
const finboxService = require("../services/finboxService");

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


const checkCibilA2Z = async (req, res) => {
  const { payload } = req.body;

  if (!payload || !payload.refid) {
    return res.status(400).json({ message: "Invalid payload or refid missing" });
  }

  try {
    const token = Utility.generateJWT(payload.refid);
    const response = await axios.post(
      "https://api.verifya2z.com/api/v1/verification/credit_report_checker",
      payload,
      {
        headers: {
          Token: token,
          Authorisedkey: "T0RneE1EWXdNREV6TlRFME5UbERUMUpRTURBd01ERXlOemM9",
          "User-Agent": "CORP00001277",
          "Content-Type": "application/json",
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(err?.response?.status || 500).json({ message: err.message });
  }
};

module.exports = { getCibilScore, checkCibilA2Z };
