const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const SecuredLoan = require("../../model/secured_loan");
const { getBearerToken, prepareRequestData, prepareRequestDataDirectJson, parseResponseData } = require("../../utility/encryption");

const SAMMAAN_BASE_URL = process.env.SAMMAAN_BASE_URL || "https://gatewayqa.sammaancapital.com";

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
    { ConsumerSystemName: "F2Fintech" },
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
  console.log("this is the main concept of things", uniqueIdResponse.data.Payload)
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
      console.error("❌ Sammaan Auth/UniqueID API failed:", errMsg, apiErr);
      return res.status(502).json({
        status: "Error",
        message: "Sammaan Capital API unreachable. Please try again later.",
        detail: errMsg,
      });
    }

    // 2. Build and encrypt Lead Push payload
    const innerPayload = {
      ConsumerSystemName: "F2Fintech",
      MobileNo: mobileNo,
      FirstName: firstName,
      MiddleName: middleName || "",
      LastName: lastName,
      ZipCode: zipCode || "",
      Product: "HL",
      City: city || "",
      ExpectedLoanAmount: expectedLoanAmount ? String(expectedLoanAmount) : "",
      GrossSalary: grossSalary ? parseFloat(grossSalary) : 0,
      EmailID: emailId || "",
      GenerationMode: "Digital",
      Source: "F2 FINTECH_BA",
      Offer: "F2 FINTECH_BA",
      Type: "F2 FINTECH_BA",
      LeadSource: "Digital",
      LeadSubsource: "Aggregators",
      LeadSubSubSource: "F2 FINTECH_BA",
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
    let mainApiResponse = null;
    try {
      console.log("📤 Submitting Lead to Sammaan Middleware API...");
      console.log("   UniqueID:", UniqueID);
      console.log("   APIURL: AggregatorLeads-postAggregators");

      mainApiResponse = await axios.post(
        creds.middlewareUrl,
        {
          ConsumerSystemName: "F2Fintech",
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

      console.log("📥 Sammaan Lead Push Raw Response:", JSON.stringify(mainApiResponse.data));

      if (mainApiResponse.data?.Message === "SUCCESS") {
        const parsedResponse = parseResponseData(mainApiResponse.data.ResponseData, key, iv);
        console.log("🔓 Sammaan Decrypted Response Payload:", JSON.stringify(parsedResponse, null, 2));

        leadId = parsedResponse?.Payload?.LeadId || parsedResponse?.Payload?.LeadNo || parsedResponse?.LeadId;
        var salesforceUniqueId = parsedResponse?.Payload?.UniqueId || null;
        console.log("=========================================");
        console.log("🎉 SAMMAAN CAPITAL LEAD CREATED!");
        console.log("📌 Lead ID (Salesforce):", leadId);
        if (salesforceUniqueId) {
          console.log("📌 Sammaan Salesforce Unique ID:", salesforceUniqueId);
        }
        console.log("=========================================");
      } else {
        console.error("❌ Sammaan Lead Push returned non-SUCCESS message:", mainApiResponse.data);
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
      console.error("❌ Sammaan Capital did not return a Lead ID. Response was:", mainApiResponse?.data);
      return res.status(400).json({
        status: "Error",
        message: "Sammaan Capital did not return a Lead ID. Lead not saved.",
        detail: mainApiResponse?.data || "No LeadId in decrypted payload",
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
      salesforceUniqueId: salesforceUniqueId || null,
      status: "Success",
    });

    console.log(`💾 Saved to Database -> DB ID: ${securedLoan.id}, externalLeadId: ${securedLoan.externalLeadId}`);

    // 6. Upload Document if provided (optional — non-blocking)
    const uploadedFile = req.files?.document;
    if (uploadedFile) {
      try {
        const documentBase64 = uploadedFile.data.toString("base64");
        const documentExtension = uploadedFile.name.substring(uploadedFile.name.lastIndexOf("."));

        const docPayload = {
          ConsumerSystemName: "F2Fintech",
          UniqueId: salesforceUniqueId || UniqueID,
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
            ConsumerSystemName: "F2Fintech",
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
          console.log("🔓 Sammaan Decrypted Doc Upload Response in submitLead:", JSON.stringify(docParsed, null, 2));
          const docPayloadRes = docParsed?.Payload;
          const isSuccess = docPayloadRes?.status?.toLowerCase() === "success" || !!docPayloadRes?.DocumentId;
          if (isSuccess) {
            securedLoan.documentUploaded = true;
            securedLoan.documentId = docPayloadRes?.DocumentId || null;
            await securedLoan.save();
            console.log(`📄 Document uploaded successfully. Doc ID: ${securedLoan.documentId}`);
          } else {
            console.warn("⚠️ Sammaan Doc Upload returned unexpected payload:", docPayloadRes);
          }
        } else {
          console.error("❌ Sammaan Doc Upload raw error:", docUploadResponse.data);
        }
      } catch (docErr) {
        console.error("⚠️ Document upload failed (non-fatal):", docErr?.response?.data || docErr.message);
      }
    }

    return res.status(200).json({
      status: "Success",
      message: "Lead created successfully in Sammaan Capital",
      leadId: leadId,
      externalLeadId: leadId,
      data: securedLoan,
    });

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
  const { id } = req.params;
  const startTime = Date.now();

  console.log("================================================================================");
  console.log("🔍 [SAMMAAN REVERSE STATUS CHECK] Request initiated");
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`📌 Param ID: ${id}`);

  try {
    const loan = isNaN(id)
      ? await SecuredLoan.findOne({ where: { externalLeadId: id } })
      : await SecuredLoan.findByPk(id);

    const targetLeadNo = loan?.externalLeadId || (typeof id === "string" ? id.trim() : null);

    if (!targetLeadNo) {
      console.warn("⚠️ [SAMMAAN REVERSE STATUS] Lead not found in DB and param ID is empty.");
      return res.status(404).json({
        status: "Error",
        message: "Lead not found or external LeadId missing.",
      });
    }

    const consumerSystemName =
      req.query?.consumerSystemName ||
      req.body?.consumerSystemName ||
      process.env.SAMMAAN_CONSUMER_SYSTEM_NAME ||
      "F2Fintech";

    const creds = getSammaanCreds();

    console.log(`🎯 Target LeadNo: ${targetLeadNo} (DB Match: ${loan ? `Yes, ID #${loan.id}` : "No direct DB record"})`);
    console.log(`🏢 ConsumerSystemName: ${consumerSystemName}`);
    console.log(`🌐 Sammaan Middleware URL: ${creds.middlewareUrl}`);

    console.log("🔑 [SAMMAAN REVERSE STATUS] Authenticating & generating UniqueID with Sammaan Capital...");
    const { token, UniqueID, key, iv } = await getTokenAndUniqueId(creds);
    console.log(`✅ [SAMMAAN REVERSE STATUS] Sammaan Auth Success. UniqueID: ${UniqueID}`);

    const innerUniqueId = loan?.salesforceUniqueId || UniqueID;

    const statusPayload = {
      ConsumerSystemName: consumerSystemName,
      UniqueId: innerUniqueId,
      LeadNo: targetLeadNo,
      Filler1: "",
      Filler2: "",
    };

    console.log("📦 [SAMMAAN REVERSE STATUS] Plaintext Request Payload:");
    console.log(JSON.stringify(statusPayload, null, 2));

    // IBM ACE JSON parser requires direct JSON string encrypted in AES-256-CBC (no Base64 intermediate)
    const encryptedData = prepareRequestDataDirectJson(statusPayload, key, iv);
    const messageId2 = uuidv4().replace(/-/g, "");

    const requestEnvelope = {
      ConsumerSystemName: consumerSystemName,
      UniqueID,
      RequestData: encryptedData,
      APIURL: "NewLeadModuleAPI-postReversestatuscheck",
      ExistingAPIMethod: "POST",
    };

    console.log("🚀 [SAMMAAN REVERSE STATUS] Sending encrypted request (Direct JSON in AES) to Sammaan Reverse Status API...");
    const statusResponse = await axios.post(
      creds.middlewareUrl,
      requestEnvelope,
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

    const elapsed = Date.now() - startTime;
    console.log(`📥 [SAMMAAN REVERSE STATUS] Sammaan Response received in ${elapsed}ms (HTTP Status: ${statusResponse.status})`);
    console.log("📥 [SAMMAAN REVERSE STATUS] Raw Envelope Response:");
    console.log(JSON.stringify(statusResponse.data, null, 2));

    if (statusResponse.data && statusResponse.data.Message === "SUCCESS") {
      try {
        const parsedResponse = parseResponseData(statusResponse.data.ResponseData, key, iv);
        console.log("================================================================================");
        console.log("🔓 [SAMMAAN REVERSE STATUS] DECRYPTED LIVE RESPONSE:");
        console.log(JSON.stringify(parsedResponse, null, 2));
        console.log("================================================================================");

        const payload = parsedResponse?.Payload;

        if (payload && (payload.LeadNo || payload.Status || payload.Current_Status)) {
          const resolvedStatus = payload.Status || payload.Current_Status || "Unknown";
          const sanctionAmount = payload.Sanction_Amount || null;
          const disbursalAmount = payload.Disbursal_Amount || null;
          const rejectReason = payload.Reject_Reason || null;

          if (loan) {
            loan.currentStatus = resolvedStatus;
            loan.sanctionAmount = sanctionAmount;
            loan.disbursalAmount = disbursalAmount;
            loan.rejectReason = rejectReason;
            await loan.save();
            console.log(`💾 [SAMMAAN REVERSE STATUS] DB record #${loan.id} updated successfully: Status = ${resolvedStatus}`);
          }

          return res.status(200).json({
            status: "Success",
            message: "Status fetched live from Sammaan Capital",
            leadNo: targetLeadNo,
            currentStatus: resolvedStatus,
            sammaanLiveResponse: payload,
            fullDecryptedResponse: parsedResponse,
            data: loan || null,
            timeElapsedMs: elapsed,
          });
        } else if (parsedResponse?.Error) {
          console.error("❌ [SAMMAAN REVERSE STATUS] Sammaan Decrypted Error Object:");
          console.error(JSON.stringify(parsedResponse.Error, null, 2));
          return res.status(400).json({
            status: "Error",
            message: parsedResponse.Error.ErrorMessage || "Sammaan returned an error response",
            leadNo: targetLeadNo,
            errorDetails: parsedResponse.Error,
            fullDecryptedResponse: parsedResponse,
            rawResponse: statusResponse.data,
            timeElapsedMs: elapsed,
          });
        } else {
          console.warn("⚠️ [SAMMAAN REVERSE STATUS] Decrypted payload does not contain standard Lead fields:", parsedResponse);
          return res.status(200).json({
            status: "Success",
            message: "Response decrypted from Sammaan Capital",
            leadNo: targetLeadNo,
            fullDecryptedResponse: parsedResponse,
            data: loan || null,
            timeElapsedMs: elapsed,
          });
        }
      } catch (decryptErr) {
        console.error("❌ [SAMMAAN REVERSE STATUS] Decryption failed:", decryptErr.message);
        return res.status(500).json({
          status: "Error",
          message: "Failed to decrypt Sammaan response data",
          decryptError: decryptErr.message,
          rawResponse: statusResponse.data,
          timeElapsedMs: elapsed,
        });
      }
    } else {
      console.error("================================================================================");
      console.error("❌ [SAMMAAN REVERSE STATUS] Sammaan ESB returned Non-SUCCESS message:");
      console.error(JSON.stringify(statusResponse.data, null, 2));
      console.error("================================================================================");
      return res.status(400).json({
        status: "Error",
        message: statusResponse.data?.Message || "Failed to fetch status from Sammaan Capital",
        leadNo: targetLeadNo,
        rawResponse: statusResponse.data,
        timeElapsedMs: elapsed,
      });
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error("================================================================================");
    console.error("❌ [SAMMAAN REVERSE STATUS] EXCEPTION in checkLeadStatus:");
    console.error("Error Message:", err.message);
    if (err.response) {
      console.error(`HTTP Status: ${err.response.status}`);
      console.error("Response Data:", JSON.stringify(err.response.data, null, 2));
      console.error("Response Headers:", err.response.headers);
    }
    console.error("Stack Trace:", err.stack);
    console.error("================================================================================");

    return res.status(err.response?.status || 500).json({
      status: "Error",
      message: err.response?.data?.Error?.ErrorMessage || err.response?.data?.Message || err.message,
      detail: err?.response?.data || null,
      httpStatus: err?.response?.status || 500,
      timeElapsedMs: elapsed,
    });
  }
};

exports.uploadSecuredLoanDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const loan = isNaN(id)
      ? await SecuredLoan.findOne({ where: { externalLeadId: id } })
      : await SecuredLoan.findByPk(id);

    if (!loan || !loan.externalLeadId) {
      return res.status(404).json({
        status: "Error",
        message: "Lead not found or external LeadId missing.",
      });
    }

    const uploadedFile = req.files?.document;
    if (!uploadedFile) {
      return res.status(400).json({
        status: "Error",
        message: "No document attached. Please upload a file with key 'document'.",
      });
    }

    const {
      documentType = "Aadhaar",
      documentSubtype = "Aadhaar KYC",
    } = req.body;

    const documentBase64 = uploadedFile.data.toString("base64");
    const documentExtension = uploadedFile.name.substring(uploadedFile.name.lastIndexOf("."));

    const creds = getSammaanCreds();
    const { token, UniqueID, key, iv } = await getTokenAndUniqueId(creds);

    const docPayload = {
      ConsumerSystemName: "F2Fintech",
      UniqueId: loan.salesforceUniqueId || UniqueID,
      LeadNo: loan.externalLeadId,
      DocumentType: documentType,
      DocumentSubtype: documentSubtype,
      DocumentName: uploadedFile.name,
      VersionData: documentBase64,
      DocumentExtention: documentExtension,
      MimeType: uploadedFile.mimetype,
      DocumentData: documentBase64,
      Filler1: "", Filler2: "", Filler3: "", Filler4: "", Filler5: "",
      Filler6: "", Filler7: "", Filler8: "", Filler9: "", Filler10: "",
    };

    const encryptedDocData = prepareRequestData(docPayload, key, iv);
    const messageId = uuidv4().replace(/-/g, "");

    const docUploadResponse = await axios.post(
      creds.middlewareUrl,
      {
        ConsumerSystemName: "F2Fintech",
        UniqueID,
        RequestData: encryptedDocData,
        APIURL: "DocUploadLeadJourneyModule-postUploaddoc",
        ExistingAPIMethod: "POST",
      },
      {
        headers: {
          MessageId: messageId,
          Sourceapplicationname: "MiddlewareEncryptDataAPI",
          Servicename: "AggregatorLeadsAPI",
          apikey: creds.apikey,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("📥 Sammaan Doc Upload Raw Response:", JSON.stringify(docUploadResponse.data));

    if (docUploadResponse.data?.Message === "SUCCESS") {
      const docParsed = parseResponseData(docUploadResponse.data.ResponseData, key, iv);
      console.log("🔓 Sammaan Decrypted Doc Upload Response:", JSON.stringify(docParsed, null, 2));

      const payload = docParsed?.Payload;
      const isSuccess = payload?.status?.toLowerCase() === "success";

      if (isSuccess || payload?.DocumentId) {
        loan.documentUploaded = true;
        loan.documentId = payload?.DocumentId || loan.documentId;
        await loan.save();

        return res.status(200).json({
          status: "Success",
          message: payload?.message || "Document uploaded successfully to Sammaan Capital",
          documentId: loan.documentId,
          sammaanLiveResponse: payload,
          data: loan,
        });
      }

      return res.status(400).json({
        status: "Error",
        message: payload?.message || "Sammaan returned failure for document upload",
        sammaanLiveResponse: payload,
      });
    }

    return res.status(400).json({
      status: "Error",
      message: "Failed to upload document to Sammaan Capital",
      rawResponse: docUploadResponse.data,
    });
  } catch (error) {
    console.error("Error in uploadSecuredLoanDocument:", error?.response?.data || error);
    return res.status(500).json({
      status: "Error",
      message: error.message,
      detail: error?.response?.data,
    });
  }
};

