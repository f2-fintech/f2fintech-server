/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 */

const CustomerFeedbackModel = require("../../model/customer_feedback/customerFeedback");
const Utility = require("../../utility");

const CustomerFeedbackController = {
  // POST /api/v1/create-feedback
  createFeedback: async (req, res) => {
    try {
      const {
        loan_type,
        overall_satisfaction,
        improvement_areas,
        recommend_score,
        valuable_feedback,
      } = req.body;

      // Validate required fields
      if (
        !loan_type ||
        overall_satisfaction == null ||
        recommend_score == null
      ) {
        return res
          .status(400)
          .send(
            Utility.formatResponse(
              400,
              "loan_type, overall_satisfaction, and recommend_score are required."
            )
          );
      }

      const entry = await CustomerFeedbackModel.create({
        loan_type,
        overall_satisfaction,
        improvement_areas: Array.isArray(improvement_areas)
          ? improvement_areas.join(", ")
          : improvement_areas || null,
        recommend_score,
        valuable_feedback: valuable_feedback || null,
        created_at: new Date(),
      });

      return res.status(201).send(Utility.formatResponse(201, entry));
    } catch (error) {
      console.error("[CustomerFeedback] createFeedback error:", error.message);
      return res.status(500).send(Utility.formatResponse(500, error.message));
    }
  },

  // GET /api/v1/get-all-feedback
  getAllFeedback: async (req, res) => {
    try {
      const feedbacks = await CustomerFeedbackModel.findAll({
        order: [["created_at", "DESC"]],
      });
      return res.status(200).send(Utility.formatResponse(200, feedbacks));
    } catch (error) {
      console.error("[CustomerFeedback] getAllFeedback error:", error.message);
      return res.status(500).send(Utility.formatResponse(500, error.message));
    }
  },
};

module.exports = CustomerFeedbackController;
