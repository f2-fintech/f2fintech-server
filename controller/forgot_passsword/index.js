/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const Utility = require("../../utility");
const sendEmail = require("../../utility/email");
const { getOtpEmailOptions } = require("../../email/templates/emailTemplates");
const CustomerModel = require("../../model/customer");

// In-memory store for OTPs: email -> { otp, expiry, customerId }
const otpStore = new Map();

const ForgotPasswordController = {
  sendOtp: async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send(
        Utility.formatResponse(400, { message: "Email is required." })
      );
    }

    try {
      const customer = await CustomerModel.findOne({ where: { email } });
      if (!customer) {
        return res.status(404).send(
          Utility.formatResponse(404, { message: "Customer not found." })
        );
      }

      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Save to store (valid for 10 minutes)
      otpStore.set(email, {
        otp,
        expiry: Date.now() + 10 * 60 * 1000,
        customerId: customer.id,
      });

      // Send Email
      const mailOptions = getOtpEmailOptions(email, otp, customer.name);
      await sendEmail(mailOptions);

      return res.status(200).send(
        Utility.formatResponse(200, {
          message: "OTP sent successfully to email.",
        })
      );
    } catch (error) {
      console.error("Error sending OTP:", error);
      return res.status(500).send(
        Utility.formatResponse(500, { message: "Failed to send OTP", error: error.message })
      );
    }
  },

  verifyOtp: async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).send(
        Utility.formatResponse(400, { message: "Email and OTP are required." })
      );
    }

    try {
      const storedOtpData = otpStore.get(email);

      if (!storedOtpData) {
        return res.status(400).send(
          Utility.formatResponse(400, { message: "OTP not requested or expired." })
        );
      }

      if (Date.now() > storedOtpData.expiry) {
        otpStore.delete(email);
        return res.status(400).send(
          Utility.formatResponse(400, { message: "OTP has expired." })
        );
      }

      if (storedOtpData.otp !== otp) {
        return res.status(400).send(
          Utility.formatResponse(400, { message: "Invalid OTP." })
        );
      }

      // Valid OTP
      const customerId = storedOtpData.customerId;
      otpStore.delete(email); // Clean up after successful verification

      return res.status(200).send(
        Utility.formatResponse(200, {
          message: "OTP verified successfully",
          customerId: customerId,
        })
      );
    } catch (error) {
      console.error("Error verifying OTP:", error.message);
      return res.status(500).send(
        Utility.formatResponse(500, { message: "Failed to verify OTP", error: error.message })
      );
    }
  },
};

module.exports = ForgotPasswordController;
