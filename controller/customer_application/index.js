/**
* Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
*
* This software is the confidential information of F2FINTECH., and is licensed as
* restricted rights software. The use, reproduction, or disclosure of this software is subject to
* restrictions set forth in your license agreement with F2 FINTECH.
*/

const CustomerLoanApplication = require("../../model/customer_application");
const Utility = require("../../utility");

const CustomerApplicationController = {
  createApplication: (req, res) => {
    const payload = req.body;

    const companyId = req.headers.companyid;
    if (companyId && !payload.company_id) {
      payload.company_id = companyId;
    }
    return new Promise((resolve, reject) => {
      CustomerLoanApplication.create(payload)
        .then((result) => {
          const io = req.app.get("io");
          if (io) {
            io.emit("new-application", { applicationId: result.id });
          }
          resolve(res.status(200).send(Utility.formatResponse(200, { applicationId: result.id })));
        })
        .catch((err) => {
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
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
