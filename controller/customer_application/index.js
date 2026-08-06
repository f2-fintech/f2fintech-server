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

const CustomerApplicationController = {
  createApplication: async (req, res) => {
    const payload = req.body;

    const companyId = req.headers.companyid;
    if (companyId && !payload.company_id) {
      payload.company_id = companyId;
    }

    try {
      // ── Duplicate Application Guard ────────────────────────────────────────
      // Rule: same email + same provider + same loan_type = duplicate (blocked)
      //       same email + same provider + different loan_type = allowed
      const { customer_id, provider, loan_type } = payload;

      if (customer_id && provider && loan_type) {
        // Step 1: Get the email of the customer submitting this application
        const submittingCustomer = await Customer.findOne({ where: { id: customer_id } });

        if (submittingCustomer && submittingCustomer.email) {
          const email = submittingCustomer.email.toLowerCase().trim();

          // Step 2: Find ALL customers that share this email (handles re-registrations)
          const allCustomersWithEmail = await Customer.findAll({
            where: { email: { [Op.like]: email } }
          });
          const allCustomerIds = allCustomersWithEmail.map((c) => c.id);

          // Step 3: Check for an existing application with same provider + loan_type
          const duplicateApplication = await CustomerLoanApplication.findOne({
            where: {
              customer_id: { [Op.in]: allCustomerIds },
              provider: provider,
              loan_type: loan_type,
            }
          });

          if (duplicateApplication) {
            // Capitalise loan_type for display (e.g. "personal loan" → "Personal Loan")
            const formattedLoanType = loan_type
              .split(" ")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");

            return res.status(409).json({
              status: "Error",
              msg: `You have already applied for a ${formattedLoanType} with ${provider}. You cannot apply again for the same loan type with the same provider.`,
              duplicateInfo: {
                provider,
                loan_type,
                applicationId: duplicateApplication.id,
                applicationNo: duplicateApplication.application_no,
              }
            });
          }
        }
      }
      // ── End Duplicate Guard ────────────────────────────────────────────────

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

  // Pre-check endpoint — called BEFORE customer registration to avoid ghost records
  // GET /check-duplicate-application?email=...&provider=...&loan_type=...
  checkDuplicate: async (req, res) => {
    const { email, provider, loan_type } = req.query;

    if (!email || !provider || !loan_type) {
      return res.status(400).json({
        status: "Error",
        msg: "email, provider, and loan_type are required query parameters."
      });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Find all customers sharing this email
      const allCustomersWithEmail = await Customer.findAll({
        where: { email: { [Op.like]: normalizedEmail } }
      });

      if (allCustomersWithEmail.length === 0) {
        // No customer with this email → cannot be a duplicate
        return res.status(200).json({ status: "Success", isDuplicate: false });
      }

      const allCustomerIds = allCustomersWithEmail.map((c) => c.id);

      // Check for existing application with same provider + loan_type
      const duplicateApplication = await CustomerLoanApplication.findOne({
        where: {
          customer_id: { [Op.in]: allCustomerIds },
          provider: provider,
          loan_type: loan_type,
        }
      });

      if (duplicateApplication) {
        const formattedLoanType = loan_type
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        return res.status(200).json({
          status: "Success",
          isDuplicate: true,
          msg: `You have already applied for a ${formattedLoanType} with ${provider}. You cannot apply again for the same loan type with the same provider.`,
          duplicateInfo: {
            provider,
            loan_type,
            applicationId: duplicateApplication.id,
            applicationNo: duplicateApplication.application_no,
          }
        });
      }

      return res.status(200).json({ status: "Success", isDuplicate: false });

    } catch (err) {
      console.error("[checkDuplicate] Error:", err.message || err);
      return res.status(500).json({ status: "Error", msg: err.message || "Internal server error" });
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
  }
};

module.exports = CustomerApplicationController;
