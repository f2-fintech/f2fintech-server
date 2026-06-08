/**
 * Copyright © 2024, F2FINTECH. ALL RIGHTS RESERVED.
 *
 * This software is the confidential information of F2FINTECH., and is licensed as
 * restricted rights software. The use, reproduction, or disclosure of this software is subject to
 * restrictions set forth in your license agreement with F2 FINTECH.
 */

const express = require("express");

const CustomerController = require("../../controller/customer");
const CustomerDocumentController = require("../../controller/customer_document");
const CustomerInfoController = require("../../controller/customer_info");
const CustomerPartnerController = require("../../controller/customer_partner");
const CustomerReviewController = require("../../controller/customer_review");
const CustomerFavouriteController = require("../../controller/customer_favourite");
const CustomerApplicationController = require("../../controller/customer_application");
const LoanProviderController = require("../../controller/loan_provider");
const LoanTrackingController = require("../../controller/loan_tracking");
const NotificationController = require("../../controller/notification");
const QueryController = require("../../controller/query");
const QueryResponseController = require("../../controller/query_response");
const ForgotPasswordController = require("../../controller/forgot_passsword");
const GetInTouchController = require("../../controller/get_in_touch");
const SendQueryController = require("../../controller/send_query/index");
const { checkAuthenticated } = require("../../config/passportConfig");
const { getCibilScore, checkCibilA2Z } = require("../../controller/credit_score");
const LeadsInfoController = require("../../controller/leads_info/index");
const LeadsInfoDocumentController = require("../../controller/leads_info_document/index");
const EligibilityBasicController = require("../../controller/eligibility_criteria/index");
const ProductLeadsController = require("../../controller/our_products/index");
const ChatController = require("../../controller/chatbotController/index");
const ChannelPartnerController = require("../../controller/channel_partner/index");
const BlogController = require("../../controller/blogs/index");
const SitemapController = require("../../controller/sitemap/index");
const createApplicationByAI = require("../../utility/createApplicationByAI");
const CustomerFeedbackController = require("../../controller/customer_feedback/index");
const CareersController = require("../../controller/careers/index");

const router = express.Router();

//-----------------------------------TEST---------------------------------------
router.get("/test", (req, res) => {
  res.status(200).json({ status: 200, message: "API Working Fine." });
});

//-----------------------------------BROCHURE PROXY---------------------------------------
router.get("/download-brochure", (req, res) => {
  const https = require("https");
  const fileUrl = req.query.url;
  if (!fileUrl || !fileUrl.startsWith('https://')) {
    return res.status(400).send("Invalid or missing file URL.");
  }

  https.get(fileUrl, (response) => {
    const filename = fileUrl.split('/').pop() || "download.pdf";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", response.headers["content-type"] || "application/pdf");
    response.pipe(res);
  }).on("error", (err) => {
    console.error("Error proxying download:", err);
    res.status(500).send("Error downloading file.");
  });
});

//-----------------------------------AI-APPLICATION---------------------------------------
router.post("/customer-application-by-ai", createApplicationByAI);

//-----------------------------------CUSTOMER---------------------------------------
router.post("/create-customer", CustomerController.register);
router.patch(
  "/update-customer",
  checkAuthenticated,
  CustomerController.updateCustomer
);
router.get("/get-customer", CustomerController.getCustomer);
router.get("/get-customer/:id", CustomerController.getCustomerById);
router.post("/login", CustomerController.loginCustomer);

//---------------------------------CUSTOMER DOCUMENT------------------------------------
router.post("/create-document", CustomerDocumentController.createDocument);
router.get(
  "/get-customer-documents/:id",
  CustomerDocumentController.getDocuments
);
router.post("/upload-to-s3", CustomerDocumentController.uploadDocumentToS3);
router.get(
  "/get-customer-document/:id",
  CustomerDocumentController.getCustomerProfileImage
);

//--------------------------------CUSTOMER FAVOURITE-------------------------------------
router.post("/get-favourites", CustomerFavouriteController.getFavourites);
router.post("/create-favourite", CustomerFavouriteController.createFavourite);
router.post("/remove-favourite", CustomerFavouriteController.removeFavourite);

//-----------------------------------CUSTOMER INFO---------------------------------------
router.post("/create-customer-info", CustomerInfoController.createCustomerInfo);
router.get("/get-customer-info", CustomerInfoController.getCustomerInfo);
router.get("/customer-info/:id", CustomerInfoController.getCustomerInfoById);
router.patch("/customer-info-update", CustomerInfoController.updateCustomerInfo);
router.get("/get-customer-profile/:id", CustomerController.getCustomerProfile);
router.post("/reset-password", CustomerController.resetPassword);
router.post(
  "/update-customer-profile",
  CustomerController.updateCustomerProfile

);

//-----------------------------------CUSTOMER PARTNERS-----------------------------------
router.post("/create-customer-partners", CustomerPartnerController.createPartners);
router.get("/get-customer-partners/:customerId", CustomerPartnerController.getPartnersByCustomerId);

//-----------------------------------CUSTOMER REVIEW---------------------------------------
router.get("/get-customer-review", CustomerReviewController.getCustomerReview);
router.post(
  "/create-customer-review",
  CustomerReviewController.createCustomerReview
);

//-----------------------------------CUSTOMER APPLICATION-----------------------------------
router.post(
  "/create-application",
  CustomerApplicationController.createApplication
);
router.get("/get-applications", CustomerApplicationController.getApplications);
router.get(
  "/get-application-by-id/:id",
  CustomerApplicationController.getApplicationById
);
router.get(
  "/get-application-by-id-web/:id",
  CustomerApplicationController.getApplicationByIdWeb
);
router.get(
  "/get-applications/:applicationId",
  CustomerApplicationController.getApplicationsByApplicationId
);

//-----------------------------------LOAN PROVIDER---------------------------------------
router.get("/get-all-loan-providers", LoanProviderController.getLoanProvider);
router.get("/get-provider-by-country", LoanProviderController.getLoanProviderByCountry);
router.post("/create-loan-provider", LoanProviderController.createLoanProvider);

//-----------------------------------LOAN TRACKING---------------------------------------
router.get("/get-loan-tracking", LoanTrackingController.getLoanTracking);
router.get(
  "/get-loan-tracking-by-id/:id",
  LoanTrackingController.getLoanTrackingById
);
router.post("/create-loan-tracking", LoanTrackingController.createLoanTracking);
router.patch("/update-loan-tracking", LoanTrackingController.updateLoanTracking);

//-----------------------------------NOTIFICATIONS---------------------------------------
router.get("/get-notifications/:id", NotificationController.getNotifications);
router.post("/create-notification", NotificationController.createNotification);
router.get("/mark-notification-read/:id", NotificationController.markAsRead);
router.get("/mark-all-notifications-read/:userId", NotificationController.markAllAsRead);


//-----------------------------------QUERY---------------------------------------
router.post("/create-query", QueryController.createQuery);
router.get("/get-query", QueryController.getQueries);

//-----------------------------------QUERY RESPONSE---------------------------------------
router.post("/create-query-response", QueryResponseController.createQueryResponse);
router.get("/get-query-response", QueryResponseController.getQueryResponse);
router.put("/update-query-response", QueryResponseController.updateQueryResponse);


//-----------------------------------GET IN TOUCH---------------------------------------
router.post("/get-in-touch", GetInTouchController.createGetInTouch);

//-----------------------------------SEND QUERY---------------------------------------
router.post("/send-query", SendQueryController.createSendQuery);
router.get("/get-send-queries", SendQueryController.getSendQueries);

//-----------------------------------ELIGIBILITY CRITERIA---------------------------------------
router.post("/get-cibil-score", getCibilScore);
router.post("/check-cibil", checkCibilA2Z);
router.post('/create-leads-info-elegibility', EligibilityBasicController.createEligibilityBasic);
router.put('/update-leads-info-elegibility/:id', EligibilityBasicController.updateEligibilityBasic);
router.get("/get-leads-info-elegibility/:id", EligibilityBasicController.getLeadInfoById);


//-----------------------------------LEADS INFO---------------------------------------
router.post("/create-leads-info", LeadsInfoController.createLeadsInfo);
router.get("/get-leads-info", LeadsInfoController.getAllLeadsInfo);
router.put("/update-leads-info/:id", LeadsInfoController.updateLeadsInfo);

//---------------------------------LEADS INFO DOCUMENT------------------------------------
router.post("/create-leads-info-document", LeadsInfoDocumentController.createDocument);
router.get(
  "/get-leads-info-documents/:id",
  LeadsInfoDocumentController.getDocuments
);

//-----------------------------------PRODUCT LEADS INFO---------------------------------------
router.post("/create-product-leads", ProductLeadsController.createProductLeads);


//-----------------------------------CHANNEL PARTNER---------------------------------------
router.post("/channel-partner", ChannelPartnerController.createChannelPartner);

//-----------------------------------CAREERS---------------------------------------
router.post("/careers", CareersController.createCareer);


//-----------------------------------CHAT BOT---------------------------------------
// router.post('/chat', ChatController.handleChat);
router.post('/api/chat', ChatController.handleChat);


//-----------------------------------BLOGS---------------------------------------

router.post("/blogs/create", BlogController.createBlog);
router.get("/blogs", BlogController.getAllBlogs);
router.put("/blogs/update/:id", BlogController.updateBlog);
router.delete("/blogs/delete/:id", BlogController.deleteBlog);
router.get("/blogs/:id", BlogController.getBlogById);

//-----------------------------------SITEMAP---------------------------------------
router.get("/sitemap.xml", SitemapController.getSitemap);

//-----------------------------------TEST EMAIL---------------------------------------
router.post("/send-email", QueryResponseController.sendemail);


//-----------------------------------CUSTOMER FEEDBACK---------------------------------------
router.post("/create-feedback", CustomerFeedbackController.createFeedback);
router.get("/get-all-feedback", CustomerFeedbackController.getAllFeedback);


module.exports = router;
