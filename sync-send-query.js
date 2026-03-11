const SendQueryModel = require('./model/send_query');
const sequelize = require('./sequelize');

async function syncDb() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    await SendQueryModel.sync({ force: false });
    console.log('send_query table created successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  } finally {
    process.exit(0);
  }
}

syncDb();
