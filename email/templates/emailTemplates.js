
const config = require('../../config');

const getWelcomeEmailOptions = (customer, pw) => {
  return {
    from: config.SENDER_EMAIL,
    to: customer.email,
    subject: "Welcome to F2 Fintech!",
    html: `
        <div style="background-color: #f9f9f9; padding: 20px;">
          <div style="max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRvsW7BlfVZmbNX3uaGdcdmdVd_zsaapbNpww&s" alt="F2 Fintech Logo" style="max-width: 100px;" />
            </div>
            <p style="font-size: 18px; color: #2c3ce3;">Hello <b>${customer.name}!</b></p>
            <p style="font-size: 16px; color: #555;">We're glad to have you on board at F2 Fintech.</p>
            <p style="font-size: 16px; color: #555;">We have created your account with us.</p>
            <span style="font-size: 16px; color: #555;">Here are the login credentials: <br />Contact Number : ${customer.contact}<br /> </span>
            <span style="font-size: 16px; color: #555;">Password       : ${pw} </span><br />
            <p style="font-size: 16px; color: #555;">Click the button below to go to login page</p>
            <p style="margin: 20px 0;">
            <a href="https://f2fintech-web.netlify.app/login" 
               style="
            display: inline-block;
            padding: 5px;
            font-family: Arial, sans-serif;
            font-size: 16px;
            font-weight: bold;
            text-decoration: none;
            color: #ffffff;
            background-color: #2c3ce3;
            border-radius: 8px;
            border: none;
            transition: background-color 0.3s ease;
            ">
              Go To Login Page
            </a>
            </p>
            <p style="font-size: 16px; color: #555;">Click the button below to reset your password</p>
            <p style="margin: 20px 0;">
              <a href="https://f2fintech-web.netlify.app/reset-password" 
                 style="
            display: inline-block;
            padding: 5px;
            font-family: Arial, sans-serif;
            font-size: 16px;
            font-weight: bold;
            text-decoration: none;
            color: #ffffff;
            background-color: #2c3ce3;
            border-radius: 8px;
            border: none;
            transition: background-color 0.3s ease;">
                Go To Reset Password Page
              </a>
            </p>
            <br />
            <br />
            <p style="font-size: 16px; color: #555;">Thanks and Regards,<br />F2 Fintech</p>
          </div>
        </div>
      `,
  };
};

const getResetPasswordEmailOptions = (payload) => {
  return {
    from: config.SENDER_EMAIL,
    to: payload.email,
    subject: "Set Your Password for F2 Fintech",
    html: `
        <div style="background-color: #f9f9f9; padding: 20px;">
          <div style="max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRvsW7BlfVZmbNX3uaGdcdmdVd_zsaapbNpww&s" alt="F2 Fintech Logo" style="max-width: 100px;" />
            </div>
            <p style="font-size: 18px; color: #2c3ce3;">Hello <b>${payload.name}!</b></p>
            <p style="font-size: 16px; color: #555;">We have created your account with us.</p>
            <p style="font-size: 16px; color: #555;">Please set your password by clicking the button below:</p>
            <p style="text-align: center; margin: 20px 0;">
              <a href="https://web.f2fintech.in/reset-password" 
                 style="color: #ffffff; background-color: #2c3ce3; padding: 12px 25px; text-decoration: none; border-radius: 25px; display: inline-block;">
                Reset Your Password
              </a>
            </p>
            <br />
            <p style="font-size: 16px; color: #555;">Thanks and Regards,<br />F2 Fintech</p>
          </div>
        </div>
      `,
  };
};

module.exports = {
  getWelcomeEmailOptions,
  getResetPasswordEmailOptions,
};
