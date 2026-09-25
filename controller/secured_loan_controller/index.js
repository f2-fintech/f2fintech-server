const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const SecuredLoan = require("../../model/secured_loan");
const { getBearerToken, prepareRequestData, parseResponseData } = require("../../utility/encryption");

const SAMMAAN_BASE_URL = "https://gatewayqa.sammaancapital.com";

const getSammaanCreds = () => ({
  clientId: process.env.SAMMAAN_CLIENT_ID,
  clientSecret: process.env.SAMMAAN_CLIENT_SECRET,
  apikey: process.env.SAMMAAN_API_KEY,
  generateUniqueIdUrl: `${SAMMAAN_BASE_URL}/esb/ibhfl/v2/generateuniqueid/getid`,
  middlewareUrl: `${SAMMAAN_BASE_URL}/esb/middlewareencryptdataapi/v1/encryptdata`,
});

async function getTokenAndUniqueId(creds) {
  const token = await getBearerToken(creds.clientId, creds.clientSecret);
  const messageId = uuidv4().replace(/-/g, "");
  const uniqueIdResponse = await axios.post(
    creds.generateUniqueIdUrl,
    { ConsumerSystemName: "F2FINTECHPRIVATELIMITED" },
    {
      headers: {
        MessageId: messageId,
        Sourceapplicationname: "GenerateUniqueIDAPI",
        Servicename: "GenerateUniqueIDAPI",
        apikey: creds.apikey,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const { UniqueID, key, iv } = uniqueIdResponse.data.Payload;
  return { token, UniqueID, key, iv };
}

exports.submitSecuredLoan = async (req, res) => {
  try {
    const {
      firstName, middleName, lastName,
      mobileNo, emailId, aadhaarNo, panNo, residentialStatus,
      applicantCategory, applicantType, companyName, grossSalary,
      expectedLoanAmount, loanTenure, loanType, loanPurpose,
      typeOfProperty, propertyIdentified, projectPropertyName,
      zipCode, city,
    } = req.body;

    // 1. Get bearer token + unique ID + encryption keys FROM SAMMAAN FIRST
    // NOTE: Sammaan requires IP whitelisting — share your server public IP with them.
    const creds = getSammaanCreds();
    let token, UniqueID, key, iv;
    try {
      ({ token, UniqueID, key, iv } = await getTokenAndUniqueId(creds));
    } catch (apiErr) {
      const errMsg = apiErr?.response?.data || apiErr?.response?.status || apiErr.message;
      console.error("❌ Sammaan Auth/UniqueID API failed:", errMsg);
      return res.status(502).json({
        status: "Error",
        message: "Sammaan Capital API unreachable. Please try again later.",
        detail: errMsg,
      });
    }

    // 2. Build and encrypt Lead Push payload
    const innerPayload = {
      ConsumerSystemName: "F2FINTECHPRIVATELIMITED",
      MobileNo: mobileNo,
      FirstName: firstName,
      MiddleName: middleName || "",
      LastName: lastName,
      ZipCode: zipCode,
      Product: "HL",
      City: city || "",
      ExpectedLoanAmount: parseFloat(expectedLoanAmount),
      GrossSalary: grossSalary ? parseFloat(grossSalary) : 0,
      EmailID: emailId || "",
      GenerationMode: "Digital",
      Source: "F2FINTECHPRIVATELIMITED",
      Offer: "F2FINTECHPRIVATELIMITED",
      Type: "F2FINTECHPRIVATELIMITED",
      LeadSubsource: "Aggregators",
      AadhaarNo: aadhaarNo || "",
      PANNo: panNo || "",
      ResidentialStatus: residentialStatus || "",
      ApplicantCategory: applicantCategory || "",
      ApplicantType: applicantType || "individual",
      CompanyName: companyName || "",
      LoanType: loanType || "New Loan",
      LoanTenure: loanTenure || "",
      TypeOfProperty: typeOfProperty || "",
      LoanPurpose: loanPurpose || "",
      PropertyIdentified: propertyIdentified || "",
      Project_PropertyName: projectPropertyName || "",
    };

    const encryptedData = prepareRequestData(innerPayload, key, iv);
    const messageId2 = uuidv4().replace(/-/g, "");

    // 3. Call Sammaan Lead Push API
    let leadId = null;
    try {
      const mainApiResponse = await axios.post(
        creds.middlewareUrl,
        {
          ConsumerSystemName: "F2FINTECHPRIVATELIMITED",
          UniqueID,
          RequestData: encryptedData,
          APIURL: "AggregatorLeads-postAggregators",
          ExistingAPIMethod: "POST",
        },
        {
          headers: {
            MessageId: messageId2,
            Sourceapplicationname: "MiddlewareEncryptDataAPI",
            Servicename: "AggregatorLeadsAPI",
            apikey: creds.apikey,
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (mainApiResponse.data?.Message === "SUCCESS") {
        const parsedResponse = parseResponseData(mainApiResponse.data.ResponseData, key, iv);
        leadId = parsedResponse.Payload?.LeadId;
      }
    } catch (leadErr) {
      const errMsg = leadErr?.response?.data || leadErr?.response?.status || leadErr.message;
      console.error("❌ Sammaan Lead Push API failed:", errMsg);
      return res.status(502).json({
        status: "Error",
        message: "Failed to create lead on Sammaan Capital. Please try again.",
        detail: errMsg,
      });
    }

    // 4. Sammaan Lead creation failed (non-exception, bad response)
    if (!leadId) {
      return res.status(400).json({
        status: "Error",
        message: "Sammaan Capital did not return a Lead ID. Lead not saved.",
      });
    }

    // 5. ✅ Only NOW save to our DB — Sammaan confirmed the lead
    const securedLoan = await SecuredLoan.create({
      firstName, middleName, lastName,
      mobileNo, emailId, aadhaarNo, panNo, residentialStatus,
      applicantCategory, applicantType, companyName,
      grossSalary: grossSalary ? parseFloat(grossSalary) : null,
      expectedLoanAmount: parseFloat(expectedLoanAmount),
      loanTenure, loanType, loanPurpose,
      typeOfProperty, propertyIdentified, projectPropertyName,
      zipCode, city,
      product: "HL",
      externalLeadId: leadId,
      status: "Success",
    });

    // 6. Upload Document if provided (optional — non-blocking)
    const uploadedFile = req.files?.document;
    if (uploadedFile) {
      try {
        const documentBase64 = uploadedFile.data.toString("base64");
        const documentExtension = uploadedFile.name.substring(uploadedFile.name.lastIndexOf("."));

        const docPayload = {
          ConsumerSystemName: "F2FINTECHPRIVATELIMITED",
          UniqueId: UniqueID,
          LeadNo: leadId,
          DocumentType: "Aadhaar",
          DocumentSubtype: "Aadhaar KYC",
          DocumentName: uploadedFile.name,
          VersionData: documentBase64,
          DocumentExtention: documentExtension,
          MimeType: uploadedFile.mimetype,
          DocumentData: documentBase64,
          Filler1: "", Filler2: "", Filler3: "", Filler4: "", Filler5: "",
          Filler6: "", Filler7: "", Filler8: "", Filler9: "", Filler10: "",
        };

        const encryptedDocData = prepareRequestData(docPayload, key, iv);
        const messageId3 = uuidv4().replace(/-/g, "");

        const docUploadResponse = await axios.post(
          creds.middlewareUrl,
          {
            ConsumerSystemName: "F2FINTECHPRIVATELIMITED",
            UniqueID,
            RequestData: encryptedDocData,
            APIURL: "DocUploadLeadJourneyModule-postUploaddoc",
            ExistingAPIMethod: "POST",
          },
          {
            headers: {
              MessageId: messageId3,
              Sourceapplicationname: "MiddlewareEncryptDataAPI",
              Servicename: "AggregatorLeadsAPI",
              apikey: creds.apikey,
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (docUploadResponse.data?.Message === "SUCCESS") {
          const docParsed = parseResponseData(docUploadResponse.data.ResponseData, key, iv);
          if (docParsed.Payload?.status === "Success" || docParsed.Payload?.status === "SUCCESS") {
            securedLoan.documentUploaded = true;
            securedLoan.documentId = docParsed.Payload?.DocumentId;
            await securedLoan.save();
          }
        }
      } catch (docErr) {
        console.error("⚠️ Document upload failed (non-fatal):", docErr?.response?.data || docErr.message);
      }
    }

    return res.status(200).json({ status: "Success", data: securedLoan });

  } catch (error) {
    console.error("Error in submitSecuredLoan:", error?.response?.data || error);
    return res.status(500).json({ status: "Error", message: error.message });
  }
};


exports.getSecuredLoans = async (req, res) => {
  try {
    const loans = await SecuredLoan.findAll({ order: [["createdAt", "DESC"]] });
    return res.status(200).json({ status: "Success", data: loans });
  } catch (error) {
    return res.status(500).json({ status: "Error", message: error.message });
  }
};

exports.checkLeadStatus = async (req, res) => {
  try {
    const loan = await SecuredLoan.findByPk(req.params.id);
    if (!loan || !loan.externalLeadId) {
      return res.status(404).json({ status: "Error", message: "Lead not found or external LeadId missing." });
    }

    const creds = getSammaanCreds();
    const { token, UniqueID, key, iv } = await getTokenAndUniqueId(creds);

    const statusPayload = {
      ConsumerSystemName: "F2FINTECHPRIVATELIMITED",
      UniqueId: UniqueID,
      LeadNo: loan.externalLeadId,
      Filler1: "", Filler2: "",
    };

    const encryptedData = prepareRequestData(statusPayload, key, iv);
    const messageId2 = uuidv4().replace(/-/g, "");

    const statusResponse = await axios.post(
      creds.middlewareUrl,
      {
        ConsumerSystemName: "F2FINTECHPRIVATELIMITED",
        UniqueID,
        RequestData: encryptedData,
        APIURL: "NewLeadModuleAPI-postReversestatuscheck",
        ExistingAPIMethod: "POST",
      },
      {
        headers: {
          MessageId: messageId2,
          Sourceapplicationname: "MiddlewareEncryptDataAPI",
          Servicename: "ReverseStatusCheckAPI",
          apikey: creds.apikey,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (statusResponse.data && statusResponse.data.Message === "SUCCESS") {
      const parsedResponse = parseResponseData(statusResponse.data.ResponseData, key, iv);
      const payload = parsedResponse.Payload;
      if (payload && payload.LeadNo) {
        loan.currentStatus = payload.Status || payload.Current_Status;
        loan.sanctionAmount = payload.Sanction_Amount || null;
        loan.disbursalAmount = payload.Disbursal_Amount || null;
        loan.rejectReason = payload.Reject_Reason || null;
        await loan.save();
        return res.status(200).json({ status: "Success", data: loan });
      }
    }

    return res.status(400).json({ status: "Error", message: "Failed to fetch status from Sammaan Capital" });
  } catch (err) {
    console.error("Error in checkLeadStatus:", err?.response?.data || err);
    return res.status(500).json({ status: "Error", message: err.message });
  }
};
