/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const LoanTrackingModel = require("../../model/loan_tracking");
const Utility = require("../../utility");

const LoanTrackingController = {

  createLoanTracking: (req, res) => {
    const payload = req.body;

    return new Promise((resolve, reject) => {
      LoanTrackingModel.create(payload)
        .then((loanTracking) => {
          resolve(res.status(200).send(Utility.formatResponse(200, loanTracking)));
        })
        .catch((err) => {
          console.log("Error creating loan provider:", err);
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
  },

  getLoanTracking: (req, res) => {
    const { limit = 10, offset = 0 } = req.body;

    return new Promise((resolve, reject) => {
      LoanTrackingModel.findAndCountAll({
        limit: parseInt(limit),
        offset: parseInt(offset),
      })
        .then((list) => {
          const { count, rows } = list;
          if (count > 0) {
            resolve(
              res.status(200).send(Utility.formatResponse(200, { count, rows }))
            );
          } else {
            resolve(
              res.status(404).send(Utility.formatResponse(404, "No Data Found"))
            );
          }
        })
        .catch((err) => {
          console.log("Error fetching loan providers:", err);
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
  },

  getLoanTrackingById: (req, res) => {
    const { id } = req.params;

    return new Promise((resolve, reject) => {
      LoanTrackingModel.findOne({
        where: { customer_application_id: id },
        order: [['updated_at', 'DESC']]
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


  /** Updating loan_tracking in the database
   */
  updateLoanTracking: (req, res) => {
    const payload = req.body;

    return new Promise((resolve, reject) => {
      LoanTrackingModel.update(payload, { where: { customer_application_id: payload.customer_application_id } })
        .then(() => {
          resolve(res.status(200).send(Utility.formatResponse(200, `Updated Successfully`)));
        })
        .catch(err => {
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
  },
};

module.exports = LoanTrackingController;
