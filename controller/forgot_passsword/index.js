// /**
//  * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
//  *
//  * This software is the confidential information of F2FINTECH., and is licensed as
//  * restricted rights software. The use, reproduction, or disclosure of this software is subject to
//  * restrictions set forth in your license agreement with F2 FINTECH.
//  */

// const admin = require("firebase-admin");
// const Utility = require("../../utility");

// // Initialize Firebase Admin SDK
// if (!admin.apps.length) {
//     admin.initializeApp({
//         credential: admin.credential.applicationDefault(),
//         databaseURL: process.env.FIREBASE_DATABASE_URL,
//     });
// }

// const ForgotPasswordController = {
//     verifyOtp: async (req, res) => {
//         const { idToken } = req.body;

//         if (!idToken) {
//             return res.status(400).send(
//                 Utility.formatResponse(400, { message: "ID token is required for verification" })
//             );
//         }

//         try {
//             // Decode and verify the ID token
//             const decodedToken = await admin.auth().verifyIdToken(idToken);

//             return res.status(200).send(
//                 Utility.formatResponse(200, {
//                     message: "OTP verified successfully",
//                     data: decodedToken, // Includes uid, phone number, etc.
//                 })
//             );
//         } catch (error) {
//             console.error("Error verifying OTP:", error.message);
//             return res.status(500).send(
//                 Utility.formatResponse(500, { message: "Failed to verify OTP", error: error.message })
//             );
//         }
//     },
// };

// module.exports = ForgotPasswordController;
