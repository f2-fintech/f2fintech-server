
import CustomerController from "../controller/customer";
import CustomerApplicationController from "../controller/customer_application";
import CustomerInfoController from "../controller/customer_info";
import LoanTrackingController from "../controller/loan_tracking";

// Random generators
const randomNumberGenerator = () => Math.floor(100000 + Math.random() * 900000);
const randomFourDigitNumber = () => Math.floor(1000 + Math.random() * 9000);

export const createApplicationByAI = async (req, res) => {
    try {
        const {
            name,
            email,
            contact,
            dob,
            amount,
            tenure,
            loanType,
            pan,
            city,
            employment_type,
            salary,
            existing_liability
        } = req.body;

        if (!contact || !name || !email) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }

        console.log(`Starting customer creation for: ${name}`);

        // ---------------------------
        // Create Customer
        // ---------------------------
        const customerData = {
            name: name.trim(),
            email,
            contact,
            dob,
            password: `WXYz@$9876`,
            status: "active",
        };

        const createdCustomer = await CustomerController.register(customerData);
        console.log(`Customer registered with ID: ${createdCustomer.id}`);

        // ---------------------------
        // Create Customer Info
        // ---------------------------
        const customerInfoData = {
            customer_id: createdCustomer.id,
            pan,
            city,
            employment_type,
            salary,
            existing_liability,
        };
        const createdInfo = await CustomerInfoController.createCustomerInfo(customerInfoData);
        console.log(`Customer info created for: ${createdCustomer.id}`);

        // ---------------------------
        // Create Application
        // ---------------------------
        const applicationNumber = randomNumberGenerator();
        const applicationData = {
            customer_id: createdCustomer.id,
            application_number: applicationNumber,
            amount,
            tenure,
            loan_type: loanType,
        };

        const createdApplication = await CustomerApplicationController.createApplication(applicationData);
        console.log(`Application created with ID: ${createdApplication.id}`);

        // ---------------------------
        // Loan Tracking
        // ---------------------------
        const trackingData = {
            customer_application_id: createdApplication.id,
            status: "submitted",
        };

        const createdTracking = await LoanTrackingController.createLoanTracking(trackingData);
        console.log(`Loan tracking created for application: ${createdApplication.id}`);

        return res.status(200).json({
            success: true,
            message: "Application successfully created",
            data: {
                customerId: createdCustomer.id,
                applicationId: createdApplication.id,
                trackingId: createdTracking.id,
            },
        });
    } catch (error) {
        console.error("Error in createApplicationByAI:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};
