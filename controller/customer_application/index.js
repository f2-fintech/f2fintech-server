/**
* Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
*
* This software is the confidential information of F2FINTECH., and is licensed as
* restricted rights software. The use, reproduction, or disclosure of this software is subject to
* restrictions set forth in your license agreement with F2 FINTECH.
*/

const { Op } = require("sequelize");
const CustomerLoanApplication = require("../../model/customer_application");
const Customer = require("../../model/customer");
const Utility = require("../../utility");
const sequelize = require("../../sequelize");

const CustomerApplicationController = {
  createApplication: async (req, res) => {
    const payload = req.body;

    const companyId = req.headers.companyid;
    if (companyId && !payload.company_id) {
      payload.company_id = companyId;
    }

    try {
      const result = await CustomerLoanApplication.create(payload);
      const io = req.app.get("io");
      if (io) {
        io.emit("new-application", { applicationId: result.id });
      }
      return res.status(200).send(Utility.formatResponse(200, { applicationId: result.id }));

    } catch (err) {
      console.error("[createApplication] Error:", err.message || err);
      return res.status(500).send(Utility.formatResponse(500, err.message || err));
    }
  },

  getApplications: (req, res) => {
    const { offset = 0 } = req.body;
    const companyId = req.headers['companyid'] || req.headers['CompanyId'];

    const whereClause = {};
    if (companyId) {
      whereClause.company_id = companyId;
    }

    return new Promise((resolve, reject) => {
      CustomerLoanApplication.findAndCountAll({
        offset: parseInt(offset),
        order: [["application_date", "ASC"]],
      })
        .then((list) => {
          const { count, rows } = list;
          if (count > 0) {
            resolve(res.status(200).send(Utility.formatResponse(200, rows)));
          } else {
            resolve(
              res.status(404).send(Utility.formatResponse(404, `No Data Found`))
            );
          }
        })
        .catch((err) => {
          reject(
            res.status(500).send(Utility.formatResponse(500, err.message))
          );
        });
    });
  },

  getApplicationById: (req, res) => {
    const { id } = req.params;
    const companyId = req.headers['companyid'] || req.headers['CompanyId'];

    // Build where clause
    const whereClause = { customer_id: id };
    if (companyId) {
      whereClause.company_id = companyId;
    }

    return new Promise((resolve, reject) => {
      CustomerLoanApplication.findOne({
        where: { customer_id: id },
        order: [['application_date', 'DESC']]
      })
        .then((data) => {
          if (data) {
            resolve(res.status(200).send(Utility.formatResponse(200, data)));
          } else {
            resolve(
              res.status(404).send(Utility.formatResponse(404, `No Data Found`))
            );
          }
        })
        .catch((err) => {
          reject(
            res.status(500).send(Utility.formatResponse(500, err.message))
          );
        });
    });
  },

  getApplicationByIdWeb: (req, res) => {
    const { id } = req.params;
    const companyId = req.headers['companyid'] || req.headers['CompanyId'];

    // Build where clause
    const whereClause = { customer_id: id };
    if (companyId) {
      whereClause.company_id = companyId;
    }

    return new Promise((resolve, reject) => {
      CustomerLoanApplication.findAll({
        where: { customer_id: id },
        order: [['application_date', 'DESC']]
      })
        .then((data) => {
          if (data) {
            resolve(res.status(200).send(Utility.formatResponse(200, data)));
          } else {
            resolve(
              res.status(404).send(Utility.formatResponse(404, `No Data Found`))
            );
          }
        })
        .catch((err) => {
          reject(
            res.status(500).send(Utility.formatResponse(500, err.message))
          );
        });
    });
  },

  getApplicationsByApplicationId: (req, res) => {
    const { applicationId } = req.params;
    const companyId = req.headers['companyid'] || req.headers['CompanyId'];
    const whereClause = { id: applicationId };
    if (companyId) {
      whereClause.company_id = companyId;
    }

    return new Promise((resolve, reject) => {
      CustomerLoanApplication.findAll({
        where: { id: applicationId },
        order: [['application_date', 'DESC']]
      })
        .then((data) => {
          if (data) {
            resolve(res.status(200).send(Utility.formatResponse(200, data)));
          } else {
            resolve(
              res.status(404).send(Utility.formatResponse(404, `No Data Found`))
            );
          }
        })
        .catch((err) => {
          reject(
            res.status(500).send(Utility.formatResponse(500, err.message))
          );
        });
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Duplicate-application check
  // Checks whether a mobile + PAN combination already has a loan application
  // created within the last 30 days, scoped to the current tenant (company_id).
  //
  // POST /api/v1/check-duplicate-application
  // Body: { mobile: string, pan: string }
  // Header: companyid (required for per-tenant isolation)
  // ─────────────────────────────────────────────────────────────────────────
  checkDuplicateApplication: async (req, res) => {
    try {
      const { mobile, pan } = req.body;
      const companyId = req.headers['companyid'] || req.headers['CompanyId'];

      // --- Input validation ---
      if (!mobile || !pan) {
        return res
          .status(400)
          .send(Utility.formatResponse(400, "mobile and pan are required"));
      }

      const normalizedMobile = String(mobile).trim();
      const normalizedPan = String(pan).trim().toUpperCase();

      if (!/^[0-9]{7,15}$/.test(normalizedMobile)) {
        return res
          .status(400)
          .send(Utility.formatResponse(400, "Invalid mobile number"));
      }

      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(normalizedPan)) {
        return res
          .status(400)
          .send(Utility.formatResponse(400, "Invalid PAN format"));
      }

      // --- Build query with optional per-tenant scoping ---
      const companyFilter = companyId
        ? `AND ca.company_id = :companyId`
        : "";

      const query = `
        SELECT ca.application_date
        FROM customer_application ca
        INNER JOIN customer c ON c.id = ca.customer_id
        INNER JOIN customer_info ci ON ci.customer_id = ca.customer_id
        WHERE c.contact = :mobile
          AND ci.pan = :pan
          AND ca.application_date >= NOW() - INTERVAL 30 DAY
          ${companyFilter}
        ORDER BY ca.application_date DESC
        LIMIT 1
      `;

      const replacements = { mobile: normalizedMobile, pan: normalizedPan };
      if (companyId) replacements.companyId = companyId;

      const [rows] = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      });

      if (rows && rows.application_date) {
        // Calculate remaining days
        const applicationDate = new Date(rows.application_date);
        const now = new Date();
        const msElapsed = now - applicationDate;
        const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(30 - daysElapsed, 1);

        return res.status(200).send(
          Utility.formatResponse(200, {
            isDuplicate: true,
            canCreate: false,
            daysRemaining,
            message: `An application with this mobile number and PAN already exists. You can create a new application after ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
          })
        );
      }

      // No duplicate found
      return res.status(200).send(
        Utility.formatResponse(200, {
          isDuplicate: false,
          canCreate: true,
        })
      );
    } catch (err) {
      console.error("[checkDuplicateApplication] Error:", err.message || err);
      return res
        .status(500)
        .send(Utility.formatResponse(500, err.message || "Internal server error"));
    }
  },
};

module.exports = CustomerApplicationController;
