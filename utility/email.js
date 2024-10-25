/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

require('dotenv').config();
const sgMail = require('@sendgrid/mail');

// Use SendGrid API key from environment variable
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Send an email using SendGrid
 * @param {Object} mailOptions - email options (to, subject, text, html, from)
 * @return {Promise} - resolves if email is sent successfully
 */
const sendEmail = (mailOptions) => {
  return new Promise((resolve, reject) => {
    // Validate required fields in mailOptions
    if (!mailOptions.to || !mailOptions.subject || !mailOptions.from) {
      return reject(new Error('Missing required fields: to, subject, or from'));
    }
    console.log("sendingEmail", process.env.SENDGRID_API_KEY)
    sgMail
      .send(mailOptions)
      .then(() => {
        console.log('Email sent successfully');
        resolve(); // Email sent successfully
      })
      .catch((error) => {
        console.error('Error sending email with SendGrid:', error);
        reject(error); // Handle email failure
      });
  });
};

module.exports = sendEmail;
