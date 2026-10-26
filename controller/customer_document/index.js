/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const CustomerDocumentModel = require("../../model/customer_document");
const Utility = require("../../utility");

const CustomerDocumentController = {
  //create document inside database
  createDocument: (req, res) => {
    const payload = req.body || {};
    const companyId = req.headers.companyid || req.headers.company_id || payload.company_id || payload.companyId;
    if ( companyId ) {
      payload.company_id = String(companyId);
    } else {
      console.warn( 'No companyId found in headers or body for createDocument' );
    }
    return new Promise((resolve, reject) => {
      CustomerDocumentModel.create(payload)
        .then(() => {
          resolve(res.status(200).send(Utility.formatResponse(200, "success")));
        })
        .catch((err) => {
          console.error('Failed to create customer_document in DB:', err?.message || err);
          resolve(res.status(409).send(Utility.formatResponse(409, err?.message || err)));
        });
    });
  },

  // get customer documents from db
  getDocuments: (req, res) => {
    const { limit = 10, offset = 0 } = req.body;
    const { id } = req.params;

    return new Promise((resolve, reject) => {
      CustomerDocumentModel.findAll({
        attributes: ["document_url", "type"],
        where: {
          customer_id: id,
        },
        limit: parseInt(limit),
        offset: parseInt(offset),
      })
        .then((docs) => {
          if (docs.length > 0) {
            console.log(docs, "here are the docs");
            // If documents are found, send them
            res.status(200).send(Utility.formatResponse(200, docs));
          } else {
            // No documents found
            res.status(404).send(Utility.formatResponse(404, "No Data Found"));
          }
        })
        .catch((err) => {
          reject(
            res.status(500).send(Utility.formatResponse(500, err.message))
          );
        });
    });
  },

  // upload the document to s3 bucket
  uploadDocumentToS3: async (req, res) => {
    try {
      const { document } = req.files || {};
      const { folder } = req.body || {};

      // If no document submitted, exit
      if (!document || !folder) {
        return res
          .status(400)
          .send(Utility.formatResponse(400, "No file uploaded or missing folder"));
      }

      Utility.uploadToS3(folder, document, res);
    } catch (err) {
      console.log("uploadDocumentToS3 err:", err);
      res.status(500).send(Utility.formatResponse(500, err?.message || err));
    }
  },

  // Get profile image from database.
  getCustomerProfileImage: (req, res) => {
    const { id } = req.params;

    return new Promise((resolve, reject) => {
      CustomerDocumentModel.findOne({
        attributes: ["document_url"],
        where: {
          customer_id: id,
          type: "profile",
        },
      })
        .then((profile) => {
          if (profile) {
            resolve(res.status(200).send(Utility.formatResponse(200, profile)));
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
};

module.exports = CustomerDocumentController;
