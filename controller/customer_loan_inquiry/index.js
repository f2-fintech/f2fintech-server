/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const CustomerLoanInquiryModel = require("../../model/customer_loan_inquiry");
const Utility = require("../../utility");

const CustomerLoanInquiryController = {
  createInquiry: async (req, res) => {
    try {
      const { name, phone, bank_name, loan_type } = req.body;

      if (!name || !phone) {
        return res
          .status(400)
          .send(Utility.formatResponse(400, "Name and phone are required"));
      }

      const newEntry = await CustomerLoanInquiryModel.create({
        name,
        phone,
        bank_name: bank_name || null,
        loan_type: loan_type || "home_loan",
        created_at: new Date(),
      });

      return res.status(201).send(Utility.formatResponse(201, newEntry));
    } catch (error) {
      console.error("[CustomerLoanInquiry] createInquiry error:", error.message);
      return res
        .status(500)
        .send(Utility.formatResponse(500, error.message));
    }
  },

  getAllInquiries: async (req, res) => {
    try {
      const inquiries = await CustomerLoanInquiryModel.findAll({
        order: [["created_at", "DESC"]],
      });
      return res.status(200).send(Utility.formatResponse(200, inquiries));
    } catch (error) {
      console.error("[CustomerLoanInquiry] getAllInquiries error:", error.message);
      return res
        .status(500)
        .send(Utility.formatResponse(500, error.message));
    }
  },
};

module.exports = CustomerLoanInquiryController;
