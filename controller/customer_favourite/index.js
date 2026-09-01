/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const CustomerFavouriteModel = require("../../model/customer_favourite");
const sequelize = require("../../sequelize");
const Utility = require("../../utility");

const CustomerFavouriteController = {
  // Create a favourite in the database
  createFavourite: (req, res) => {
    const payload = req.body;

    return new Promise((resolve, reject) => {
      CustomerFavouriteModel.create({ ...payload })
        .then((result) => {
          resolve(res.status(200).send(Utility.formatResponse(200, result)));
        })
        .catch((err) => {
          console.log(err);
          reject(res.status(500).send(Utility.formatResponse(500, err)));
        });
    });
  },

  // Get favourites from db
  getFavourites: (req, res) => {
    const { loan_provider_id, customer_id, limit = 10, offset = 0 } = req.body;

    if (!customer_id) {
      return res
        .status(200)
        .send(Utility.formatResponse(200, { isFavorite: false, data: [] }));
    }

    // run when loan_provider_id and customer_id are provided
    if (loan_provider_id && customer_id) {
      return new Promise((resolve, reject) => {
        CustomerFavouriteModel.findOne({
          where: { loan_provider_id, customer_id },
        })
          .then((favorite) => {
            if (favorite) {
              resolve(
                res
                  .status(200)
                  .send(Utility.formatResponse(200, { isFavorite: true }))
              );
            } else {
              resolve(
                res
                  .status(200)
                  .send(Utility.formatResponse(200, { isFavorite: false }))
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

    if (customer_id) {
      const parsedCustomerId = parseInt(customer_id, 10);
      const parsedLimit = parseInt(limit, 10) || 10;
      const parsedOffset = parseInt(offset, 10) || 0;

      const query = `SELECT lp.id, lp.home_image, lp.is_home, lp.title, lp.interest_rate, lp.description, 
                      lp.short_description, lp.long_description,
                      (Select COUNT(*) FROM customer_favourite WHERE customer_id = ${parsedCustomerId}) AS count
                      FROM customer_favourite AS cf
                      LEFT JOIN loan_provider AS lp ON lp.id = cf.loan_provider_id
                      WHERE cf.customer_id = ${parsedCustomerId}
                      LIMIT ${parsedLimit} OFFSET ${parsedOffset}`;

      return new Promise((resolve, reject) => {
        sequelize
          .query(query, { type: sequelize.QueryTypes.SELECT })
          .then((fav) => {
            fav.length > 0
              ? resolve(res.status(200).send(Utility.formatResponse(200, fav)))
              : resolve(
                  res
                    .status(200)
                    .send(Utility.formatResponse(200, []))
                );
          })
          .catch((err) => {
            console.log("error==>>", err);
            reject(res.status(500).send(Utility.formatResponse(500, err)));
          });
      });
    }

    return res
      .status(200)
      .send(Utility.formatResponse(200, { isFavorite: false, data: [] }));
  },

  // Remove a favourite from the database using loan_provider_id and customer_id
  removeFavourite: async (req, res) => {
    const payload = req.body;

    return new Promise((resolve, reject) => {
      CustomerFavouriteModel.destroy({
        where: {
          loan_provider_id: payload.loan_provider_id,
          customer_id: payload.customer_id,
        },
      })
        .then((data) => {
          if (data) {
            resolve(
              res
                .status(200)
                .send(Utility.formatResponse(200, "Removed Successfully"))
            );
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

module.exports = CustomerFavouriteController;
