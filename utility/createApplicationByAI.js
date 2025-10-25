const CustomerController = require("../controller/customer");
const CustomerApplicationController = require("../controller/customer_application");
const CustomerInfoController = require("../controller/customer_info");
const LoanTrackingController = require("../controller/loan_tracking");

const AiLeadsModel = require("../model/ai_leads");

const randomNumberGenerator = () => Math.floor(100000 + Math.random() * 900000);
const randomFourDigitNumber = () => Math.floor(1000 + Math.random() * 9000);

// const createApplicationByAI = async (req, res) => {
//     try {
//         const {
//             name,
//             email,
//             contact,
//             dob,
//             amount,
//             tenure,
//             loanType,
//             pan,
//             city,
//             employment_type,
//             salary,
//             existing_liability,
//         } = req.body;

//         if (!contact || !name || !email) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Missing required fields",
//             });
//         }

//         console.log(`Starting customer creation for: ${name}`);

//         // ---------------------------
//         // Create Customer
//         // ---------------------------
//         const customerData = {
//             name: name.trim(),
//             email,
//             contact,
//             dob,
//             password: `WXYz@$9876`,
//             status: "active",
//         };

//         const createdCustomer = await new Promise((resolve, reject) => {
//             const mockReq = { body: customerData };
//             const mockRes = {
//                 status: (code) => ({
//                     send: (data) => {
//                         if (code >= 200 && code < 300) resolve(data.data);
//                         else reject(new Error(data.msg || "Failed to register customer"));
//                     },
//                 }),
//             };
//             CustomerController.register(mockReq, mockRes);
//         });

//         console.log(`Customer registered with ID: ${createdCustomer.id}`);

//         // ---------------------------
//         // Create Customer Info
//         // ---------------------------
//         const customerInfoData = {
//             customer_id: createdCustomer.id,
//             pan,
//             city,
//             employment_type,
//             salary,
//             existing_liability,
//         };

//         const createdInfo = await new Promise((resolve, reject) => {
//             const mockReq = { body: customerInfoData };
//             const mockRes = {
//                 status: (code) => ({
//                     send: (data) => {
//                         if (code >= 200 && code < 300) resolve(data.data);
//                         else reject(new Error(data.msg || "Failed to create customer info"));
//                     },
//                 }),
//             };
//             CustomerInfoController.createCustomerInfo(mockReq, mockRes);
//         });

//         console.log(`Customer info created for: ${createdCustomer.id}`);

//         // ---------------------------
//         // Create Application
//         // ---------------------------
//         const applicationNumber = randomNumberGenerator();
//         const applicationData = {
//             customer_id: createdCustomer.id,
//             application_no: applicationNumber,
//             amount,
//             tenure,
//             loan_type: loanType,
//         };

//         const createdApplication = await new Promise((resolve, reject) => {
//             const mockReq = { body: applicationData };
//             const mockRes = {
//                 status: (code) => ({
//                     send: (data) => {
//                         if (code >= 200 && code < 300) resolve(data.data);
//                         else reject(new Error(data.msg || "Failed to create application"));
//                     },
//                 }),
//             };
//             CustomerApplicationController.createApplication(mockReq, mockRes);
//         });

//         console.log(`Application created with ID: ${createdApplication.applicationId}`);

//         // ---------------------------
//         // Loan Tracking
//         // ---------------------------
//         const trackingData = {
//             customer_application_id: createdApplication.applicationId,
//             status: "submitted",
//         };

//         const createdTracking = await new Promise((resolve, reject) => {
//             const mockReq = { body: trackingData };
//             const mockRes = {
//                 status: (code) => ({
//                     send: (data) => {
//                         if (code >= 200 && code < 300) resolve(data.data);
//                         else reject(new Error(data.msg || "Failed to create loan tracking"));
//                     },
//                 }),
//             };
//             LoanTrackingController.createLoanTracking(mockReq, mockRes);
//         });

//         console.log(`Loan tracking created for application: ${createdApplication.applicationId}`);

//         return res.status(200).json({
//             success: true,
//             message: "Application successfully created",
//             data: {
//                 customerId: createdCustomer.id,
//                 applicationId: createdApplication.applicationId,
//                 trackingId: createdTracking.id,
//             },
//         });
//     } catch (error) {
//         console.error("Error in createApplicationByAI:", error);
//         return res.status(500).json({
//             success: false,
//             message: error.message || "Internal server error",
//         });
//     }
// };


// POST /api/ai-leads


const createApplicationByAI = async (req, res) => {
    try {
        const { name, loan_type } = req.body;

        if (!name || !loan_type) {
            return res.status(400).json({ message: "Name and loan type are required" });
        }

        const newLead = await AiLeadsModel.create({
            name,
            loan_type,
            application_date: new Date(),
        });

        return res.status(201).json({
            message: "Lead created successfully",
            data: newLead,
        });
    } catch (error) {
        console.error("Error creating lead:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = createApplicationByAI;
