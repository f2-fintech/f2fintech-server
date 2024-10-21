/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const CustomerInfoModel = require("../../model/customer_info");
const Utility = require("../../utility");

const CustomerInfoController = {
  createCustomerInfo: (req, res) => {
    const payload = req.body;
    return new Promise((resolve, reject) => {
      CustomerInfoModel.create(payload)
        .then((result) => {
          resolve(res.status(200).send(Utility.formatResponse(200, result)));
        })
        .catch((err) => {
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
  },

  getCustomerInfo: (req, res) => {
    const { limit = 10, offset = 0 } = req.body;
    return new Promise((resolve, reject) => {
      CustomerInfoModel.findAndCountAll({
        limit: parseInt(limit),
        offset: parseInt(offset),
      })
        .then((list) => {
          const { count, rows } = list;
          if (count > 0) {
            resolve(res.status(200).send(Utility.formatResponse(200, rows)));
          } else {
            resolve(
              res.status(404).send(Utility.formatResponse(404, "No Data Found"))
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

  getCustomerInfoById: (req, res) => {
    const id = req.params.id;

    return new Promise((resolve, reject) => {
      CustomerInfoModel.findOne({ where: { customer_id: id } })
        .then((result) => {
          if (result) {
            resolve(res.status(200).send(Utility.formatResponse(200, result)));
          } else {
            resolve(
              res
                .status(404)
                .send(Utility.formatResponse(404, "Customer info not found"))
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

  updateCustomerInfo: (req, res) => {
    const payload = req.body;

    // Update the customer info
    return new Promise((resolve, reject) => {
      CustomerInfoModel.update(payload, { where: { customer_id: payload.customer_id } })
        .then(() => {
          resolve(res.status(200).send(Utility.formatResponse(200, "Customer info updated successfully")));
        })
        .catch((err) => {
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    })
  }
};

module.exports = CustomerInfoController;
