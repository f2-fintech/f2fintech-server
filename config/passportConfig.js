/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const CustomerModel = require("../model/customer");
const Utility = require("../utility");

passport.use(
  "local",
  new LocalStrategy({ usernameField: "email" }, (email, password, done) => {
    CustomerModel.findOne({ where: { email } })
      .then((customer) => {
        if (!customer) {
          return done(null, false, { message: "Customer not found" });
        }
        Utility.comparePassword(password, customer.password)
          .then((isMatch) => {
            if (!isMatch) {
              return done(null, false, { message: "Invalid credentials" });
            }
            return done(null, customer);
          })
          .catch((err) => done(err));
      })
      .catch((err) => done(err));
  })
);

passport.serializeUser((customer, done) => {
  done(null, customer.id);
});

passport.deserializeUser((id, done) => {
  CustomerModel.findByPk(id)
    .then((customer) => done(null, customer))
    .catch((err) => done(err, null));
});

checkAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res
    .status(500)
    .send(Utility.formatResponse(500, `Failed To Authenticate Token`));
};

module.exports = { passport, checkAuthenticated };
