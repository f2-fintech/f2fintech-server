/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const sequelize = require("./sequelize");

let db;

/**
 * Connects to the database
 * @return {Object} connection object
 */
const connectToMysql = () => {
  if (!db) {
    db = sequelize
      .authenticate()
      .then(() => {
        return "Connected To Database Successfully!";
      })
      .catch((err) => {
        console.log("Error Connecting To Database ", err);
      });
  }
  return db;
};

//Calling the function at export
module.exports = connectToMysql();
