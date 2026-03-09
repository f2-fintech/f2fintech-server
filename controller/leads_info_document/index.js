/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const LeadsInfoDocumentModel = require("../../model/leads_info_document");
const Utility = require("../../utility");

const LeadsInfoDocumentController = {
    //create document inside database
    createDocument: (req, res) => {
        const payload = req.body;
        const companyId = req.headers.companyid;
        if (companyId) {
            payload.company_id = companyId;
        } else {
            console.warn('No companyId found in headers for createDocument');
        }
        return new Promise((resolve, reject) => {
            LeadsInfoDocumentModel.create(payload)
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
            LeadsInfoDocumentModel.findAll({
                attributes: ["document_url", "type"],
                where: {
                    leads_info_id: id,
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
};

module.exports = LeadsInfoDocumentController;
