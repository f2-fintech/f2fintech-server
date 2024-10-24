/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const nodemailer = require("nodemailer");


/**
 * Send an email
 * @param {String} to - recipient email address
 * @param {String} subject - email subject
 * @return {Promise} - resolves if email is sent successfully
 */
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey('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'); // Replace with your SendGrid API key

/**
 * Send an email using SendGrid
 * @param {Object} mailOptions - email options (to, subject, text, html)
 * @return {Promise} - resolves if email is sent successfully
 */
const sendEmail = (mailOptions) => {
  return new Promise((resolve, reject) => {
    sgMail
      .send(mailOptions)
      .then(() => {
        console.log('email sent successfully')
        resolve(); // Email sent successfully
      })
      .catch((error) => {
        console.log("Error sending email with SendGrid:", error);
        reject(); // Handle email failure
      });
  });
};

module.exports = sendEmail;
