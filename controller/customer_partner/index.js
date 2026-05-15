/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const CustomerPartnerModel = require("../../model/customer_partner");
const Utility = require("../../utility");

const CustomerPartnerController = {
  createPartners: (req, res) => {
    const payload = req.body; // Expecting an array of partner objects
    const companyId = req.headers.companyid;

    if (!companyId) {
      return res.status(400).send(Utility.formatResponse(400, "companyid header is required"));
    }

    if (!Array.isArray(payload) || payload.length === 0) {
      return res.status(400).send(Utility.formatResponse(400, "Payload must be a non-empty array"));
    }

    // Ensure company_id is attached to every partner object
    const partners = payload.map(partner => ({
      ...partner,
      company_id: partner.company_id || companyId
    }));

    return new Promise((resolve, reject) => {
      CustomerPartnerModel.bulkCreate(partners)
        .then((result) => {
          resolve(res.status(200).send(Utility.formatResponse(200, result)));
        })
        .catch((err) => {
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
  },

  getPartnersByCustomerId: (req, res) => {
    const customerId = req.params.customerId;
    const companyId = req.headers.companyid;

    if (!companyId) {
      return res.status(400).send(Utility.formatResponse(400, "companyid header is required"));
    }

    return new Promise((resolve, reject) => {
      CustomerPartnerModel.findAll({
        where: { customer_id: customerId, company_id: companyId }
      })
        .then((result) => {
          if (result && result.length > 0) {
            resolve(res.status(200).send(Utility.formatResponse(200, result)));
          } else {
            resolve(res.status(404).send(Utility.formatResponse(404, "Partners not found")));
          }
        })
        .catch((err) => {
          reject(res.status(500).send(Utility.formatResponse(500, err.message)));
        });
    });
  }
};

module.exports = CustomerPartnerController;
