/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const nodemailer = require('nodemailer');
const config = require('../config');

// Create a nodemailer transporter using SMTP configuration
const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_PORT == 465, // true for 465, false for other ports
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
  },
});

/**
 * Send an email using Nodemailer
 * @param {Object} mailOptions - email options (to, subject, text, html, from)
 * @return {Promise} - resolves if email is sent successfully
 */
const sendEmail = (mailOptions) => {
  return new Promise((resolve, reject) => {
    // Validate required fields in mailOptions
    if (!mailOptions.to || !mailOptions.subject || !mailOptions.from) {
      return reject(new Error('Missing required fields: to, subject, or from'));
    }
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email with Nodemailer:', error);
        return reject(error);
      }
      console.log('Email sent successfully:', info.messageId);
      resolve(info);
    });
  });
};

module.exports = sendEmail;
