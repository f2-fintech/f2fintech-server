/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const CustomerReviewModel = require("../../model/customer_review");
const Utility = require("../../utility");
const sequelize = require("../../sequelize");
const path = require("path");
const fs = require("fs");

const CustomerReviewController = {
  getCustomerReview: (req, res) => {
    const query = `SELECT cusr.id as review_id, cus.id,cus.name,cus.email,cusr.rating,cusr.review,cusr.thumbnail,cusr.created_at, cus_info.city, cus_info.state
                    FROM customer_review cusr
                    JOIN customer cus ON cus.id = cusr.customer_id
                    LEFT JOIN customer_info cus_info ON cus_info.customer_id = cus.id
                    ORDER BY cusr.created_at DESC
                    LIMIT 100 OFFSET 0`;

    return new Promise((resolve, reject) => {
      sequelize
        .query(query, { type: sequelize.QueryTypes.SELECT })
        .then((reviews) => {
          reviews.length > 0
            ? resolve(
              res.status(200).send(Utility.formatResponse(200, { reviews }))
            )
            : resolve(
              res
                .status(404)
                .send(Utility.formatResponse(404, `No Data Found`))
            );
        })
        .catch((err) => {
          console.log("error==>>", err);
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
  },

  createCustomerReview: (req, res) => {
    const payload = req.body;

    const saveReview = (updatedPayload) => {
      return CustomerReviewModel.create({ ...updatedPayload })
        .then((customerReview) => {
          res.status(200).send(Utility.formatResponse(200, customerReview));
        })
        .catch((err) => {
          res.status(500).send(Utility.formatResponse(500, err));
        });
    };

    if (req.files && req.files.thumbnail) {
      const thumbnailFile = req.files.thumbnail;
      const fileName = `${Date.now()}_${thumbnailFile.name.replace(/\s+/g, '_')}`;
      const uploadDir = path.join(__dirname, "../../uploads/reviews/");
      const uploadPath = path.join(uploadDir, fileName);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      thumbnailFile.mv(uploadPath, (err) => {
        if (err) {
          console.error("File move error:", err);
          return res.status(500).send(Utility.formatResponse(500, "Error saving file"));
        }
        console.log("File saved successfully to:", uploadPath);
        payload.thumbnail = `/uploads/reviews/${fileName}`;
        saveReview(payload);
      });
    } else {
      console.log("No thumbnail file uploaded, using default or existing URL.");
      saveReview(payload);
    }
  },
};

module.exports = CustomerReviewController;
