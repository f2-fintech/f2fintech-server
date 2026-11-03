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
  //
  // When a duplicate is found:
  //   - Always returns application_no, loan_type, loan_category, provider, application_date
  //   - If is_picked = 0: the application has NOT been picked up by internal team yet
  //   - If is_picked = 1: joins with tickets table and returns ticket id + status
  // ─────────────────────────────────────────────────────────────────────────
  checkDuplicateApplication: async (req, res) => {
    try {
      let { mobile, pan, providers, excludeApplicationId, exclude_application_id, applicationId } = req.body;
      const companyId = req.headers['companyid'] || req.headers['CompanyId'];
      const excludeId = excludeApplicationId || exclude_application_id || applicationId;

      // Auto-lookup mobile & pan if customerId or customer_id is provided
      if ((!mobile || !pan) && (req.body.customerId || req.body.customer_id)) {
        const cId = req.body.customerId || req.body.customer_id;
        const custRows = await sequelize.query(`
          SELECT c.contact, ci.pan 
          FROM customer c 
          LEFT JOIN customer_info ci ON ci.customer_id = c.id 
          WHERE c.id = :cId LIMIT 1
        `, { replacements: { cId }, type: sequelize.QueryTypes.SELECT });
        if (custRows && custRows.length > 0) {
          if (!mobile && custRows[0].contact) mobile = custRows[0].contact;
          if (!pan && custRows[0].pan) pan = custRows[0].pan;
        }
      }

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

      // --- Build query with optional per-tenant scoping and exclusion ---
      const companyFilter = companyId
        ? `AND ca.company_id = :companyId`
        : "";

      let excludeFilter = "";
      const replacements = { mobile: normalizedMobile, pan: normalizedPan };

      if (excludeId) {
        excludeFilter = "AND ca.id != :excludeId";
        replacements.excludeId = Number(excludeId) || excludeId;
      }

      let providerFilter = "";
      if (providers && Array.isArray(providers) && providers.length > 0) {
        providerFilter = "AND ca.provider IN (:providers)";
        replacements.providers = providers;
      } else if (providers && typeof providers === "string") {
        providerFilter = "AND ca.provider IN (:providers)";
        replacements.providers = [providers];
      }

      const query = `
        SELECT
          ca.id              AS application_id,
          ca.application_no,
          ca.is_picked,
          ca.loan_type,
          ca.loan_category,
          ca.provider,
          ca.application_date,
          t.id               AS ticket_id,
          t.status           AS ticket_status,
          t.created_at       AS ticket_created_at
        FROM customer_application ca
        INNER JOIN customer      c  ON c.id              = ca.customer_id
        INNER JOIN customer_info ci ON ci.customer_id    = ca.customer_id
        LEFT  JOIN tickets       t  ON t.customer_application_id = ca.id
        WHERE c.contact = :mobile
          AND ci.pan    = :pan
          AND ca.application_date >= NOW() - INTERVAL 30 DAY
          ${excludeFilter}
          ${companyFilter}
          ${providerFilter}
        ORDER BY ca.application_date DESC
        LIMIT 1
      `;

      if (companyId) replacements.companyId = companyId;

      const results = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      });

      const row = Array.isArray(results) && results.length > 0 ? results[0] : (results && results.application_date ? results : null);

      if (row && row.application_date) {
        // Calculate remaining days in the 30-day window
        const applicationDate = new Date(row.application_date);
        const now = new Date();
        const msElapsed = now - applicationDate;
        const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(30 - daysElapsed, 1);

        const isPicked = Number(row.is_picked) === 1;
        const providerText = row.provider ? ` with lender "${row.provider}"` : "";

        return res.status(200).send(
          Utility.formatResponse(200, {
            isDuplicate: true,
            canCreate: false,
            daysRemaining,
            message: `An application${providerText} already exists for this customer (Application #${row.application_no}). You can apply with this lender after ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
            // --- Application details for banner ---
            application: {
              id: row.application_id,
              application_no: row.application_no,
              loan_type: row.loan_type,
              loan_category: row.loan_category,
              provider: row.provider,
              application_date: row.application_date,
              is_picked: Number(row.is_picked),
            },
            // --- Ticket details (only when is_picked = 1 and ticket exists) ---
            ticket: isPicked && row.ticket_id
              ? {
                id: row.ticket_id,
                status: row.ticket_status,
                created_at: row.ticket_created_at,
              }
              : null,
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

  updateApplication: async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;
      const targetId = id || payload.applicationId || payload.id || payload.customer_application_id;

      if (!targetId) {
        return res
          .status(400)
          .send(Utility.formatResponse(400, "applicationId is required"));
      }

      const isNumeric = !isNaN(Number(targetId));
      const whereCondition = isNumeric
        ? {
          [Op.or]: [
            { id: Number(targetId) },
            { application_no: Number(targetId) }
          ]
        }
        : { id: targetId };

      const existingApp = await CustomerLoanApplication.findOne({ where: whereCondition });
      if (!existingApp) {
        return res.status(404).send(Utility.formatResponse(404, "Application not found"));
      }

      // Duplicate prevention safeguard: if provider is being updated, verify no other application exists within 30 days
      if (payload.provider && existingApp.customer_id) {
        const dupCheckQuery = `
          SELECT ca.id, ca.application_no, ca.provider, ca.application_date
          FROM customer_application ca
          WHERE ca.customer_id = :custId
            AND ca.provider = :provider
            AND ca.id != :currentAppId
            AND ca.application_date >= NOW() - INTERVAL 30 DAY
          ORDER BY ca.application_date DESC
          LIMIT 1
        `;
        const dupRows = await sequelize.query(dupCheckQuery, {
          replacements: {
            custId: existingApp.customer_id,
            provider: payload.provider,
            currentAppId: existingApp.id
          },
          type: sequelize.QueryTypes.SELECT
        });
        const dup = Array.isArray(dupRows) && dupRows.length > 0 ? dupRows[0] : null;
        if (dup) {
          return res.status(409).send(Utility.formatResponse(409, {
            isDuplicate: true,
            canCreate: false,
            message: `Cannot update application: An application with lender "${payload.provider}" already exists for this customer (Application #${dup.application_no}) within 30 days.`,
            application: dup
          }));
        }
      }

      const updateData = {};
      if (payload.amount !== undefined) updateData.amount = payload.amount;
      if (payload.tenure !== undefined) updateData.tenure = payload.tenure;
      if (payload.provider !== undefined) updateData.provider = payload.provider;
      if (payload.loan_type !== undefined || payload.loanType !== undefined) {
        updateData.loan_type = payload.loan_type || payload.loanType;
      }
      if (payload.loan_category !== undefined || payload.loanCategory !== undefined) {
        const cat = payload.loan_category || payload.loanCategory;
        updateData.loan_category = (cat === 'secured' || cat === 'unsecured') ? cat : null;
      }
      if (payload.lead_type !== undefined || payload.leadType !== undefined) {
        const rawLead = payload.lead_type !== undefined ? payload.lead_type : payload.leadType;
        const validLeadTypes = ['notion', 'dialler', 'field visit', 'sourcer', 'channel partner', 'ref from customer', 'left employee follow up'];
        updateData.lead_type = validLeadTypes.includes(rawLead) ? rawLead : null;
      }
      if (payload.case_type !== undefined || payload.caseType !== undefined) {
        const rawCase = payload.case_type || payload.caseType;
        updateData.case_type = (rawCase === 'top_up' || rawCase === 'fresh') ? rawCase : 'fresh';
      }
      if (payload.business_entity_type !== undefined || payload.businessEntityType !== undefined) {
        const rawEntity = payload.business_entity_type || payload.businessEntityType;
        const validEntities = ['sole_proprietorship', 'private_limited', 'llp', 'huf', 'partnership'];
        updateData.business_entity_type = validEntities.includes(rawEntity) ? rawEntity : null;
      }
      if (payload.company_official_email !== undefined) {
        updateData.company_official_email = payload.company_official_email;
      }
      if (payload.existing_loans !== undefined || payload.existingLoans !== undefined) {
        const rawLoans = payload.existing_loans !== undefined ? payload.existing_loans : payload.existingLoans;
        updateData.existing_loans = typeof rawLoans === 'string' ? rawLoans : JSON.stringify(rawLoans);
      }
      if (payload.referral_code !== undefined || payload.referralCode !== undefined) {
        updateData.referral_code = payload.referral_code || payload.referralCode;
      }

      await CustomerLoanApplication.update(updateData, { where: whereCondition });

      const updated = await CustomerLoanApplication.findOne({ where: whereCondition });

      return res.status(200).send(
        Utility.formatResponse(200, {
          success: true,
          message: "Application updated successfully",
          applicationId: updated ? updated.id : targetId,
          application: updated
        })
      );
    } catch (err) {
      console.error("[updateApplication] Error:", err.message || err);
      return res
        .status(500)
        .send(Utility.formatResponse(500, err.message || "Internal server error"));
    }
  },
};

module.exports = CustomerApplicationController;
