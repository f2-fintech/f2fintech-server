/**
 * Run once to create the customer_feedback table in MySQL.
 * Usage: node sync-customer-feedback.js
 */

const CustomerFeedbackModel = require('./model/customer_feedback/customerFeedback');
const sequelize = require('./sequelize');

async function syncDb() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database successfully.');
    await CustomerFeedbackModel.sync({ force: false });
    console.log('✅ customer_feedback table created/verified successfully.');
  } catch (error) {
    console.error('❌ Unable to sync database:', error);
  } finally {
    process.exit(0);
  }
}

syncDb();
