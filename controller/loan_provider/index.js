/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */
const { Op } = require("sequelize");

const LoanProviderModel = require("../../model/loan_provider");
const Utility = require("../../utility");

const LoanProviderController = {
  getLoanProvider: async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const page = parseInt(req.query.page) || 1;
      const offset = (page - 1) * limit;

      const list = await LoanProviderModel.findAndCountAll({ limit, offset });
      if (list.count > 0) {
        res.status(200).send(
          Utility.formatResponse(200, { count: list.count, rows: list.rows, page, limit })
        );
      } else {
        res.status(404).send(Utility.formatResponse(404, "No Data Found"));
      }
    } catch (err) {
      console.error("Error fetching loan providers:", err);
      res.status(500).send(Utility.formatResponse(500, err.message || "Internal Server Error"));
    }
  },

  getLoanProviderByCountry: async (req, res) => {
    try {
      const { country } = req.query;

      const list = await LoanProviderModel.findAndCountAll({
        where: { country: { [Op.eq]: country } },
      });

      if (list.count > 0) {
        res.status(200).send(Utility.formatResponse(200, { count: list.count, rows: list.rows }));
      } else {
        res.status(404).send(Utility.formatResponse(404, `No Data Found for country: ${country}`));
      }
    } catch (err) {
      console.error("Error fetching loan providers by country:", err);
      res.status(500).send(Utility.formatResponse(500, err.message || "Internal Server Error"));
    }
  },

  createLoanProvider: async (req, res) => {
    const payload = req.body;
    try {
      const loanProvider = await LoanProviderModel.create(payload);
      res.status(200).send(Utility.formatResponse(200, loanProvider));
    } catch (err) {
      console.error("Error creating loan provider:", err);
      res.status(500).send(Utility.formatResponse(500, err.message || "Internal Server Error"));
    }
  },
};

module.exports = LoanProviderController;
