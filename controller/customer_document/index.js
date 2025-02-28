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
    const payload = req.body;
    return new Promise((resolve, reject) => {
      CustomerDocumentModel.create(payload)
        .then(() => {
          resolve(res.status(200).send(Utility.formatResponse(200, "success")));
        })
        .catch((err) => {
          resolve(res.status(409).send(Utility.formatResponse(409, err)));
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
      const { document } = req.files;
      const { folder } = req.body;
      console.log("folder>>>>", folder);

      // If no document submitted, exit
      if (!document || !folder) {
        return res
          .status(400)
          .send(Utility.formatResponse(400, "No file uploaded"));
      }

      // Validate file type (images, .txt, .doc, .docx)
      const allowedMimeTypes = [
        "image/avif",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/bmp",
        "image/webp",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "application/msword", // .doc
        "application/pdf", // .pdf
        "audio/mpeg", // .mp3
        "audio/wav", // .wav
        "audio/ogg", // .ogg
        "audio/dat", // .dat
      ];

      const isAudioFile = document.mimetype.startsWith("audio/");

      if (!allowedMimeTypes.includes(document.mimetype) && !isAudioFile) {
        console.error("Invalid MIME type:", document.mimetype);
        return res
          .status(400)
          .send(Utility.formatResponse(400, "Invalid file type"));
      }

      Utility.uploadToS3(folder, document, res);
    } catch (err) {
      console.log("err", err);
      res.status(500).send(Utility.formatResponse(500, err));
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
