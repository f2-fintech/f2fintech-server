const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const SecuredLoan = require("../../model/secured_loan");
const { getBearerToken, prepareRequestData, parseResponseData } = require("../../utility/encryption");

const SAMMAAN_BASE_URL = process.env.SAMMAAN_BASE_URL || "https://gatewayqa.sammaancapital.com";

const getSammaanCreds = () => ({
  clientId: process.env.SAMMAAN_CLIENT_ID,
  clientSecret: process.env.SAMMAAN_CLIENT_SECRET,
  apikey: process.env.SAMMAAN_API_KEY,
  generateUniqueIdUrl: `${SAMMAAN_BASE_URL}/esb/ibhfl/v2/generateuniqueid/getid`,
  middlewareUrl: `${SAMMAAN_BASE_URL}/esb/middlewareencryptdataapi/v1/encryptdata`,
});

async function getTokenAndUniqueId(creds, consumerSystemName = "F2Fintech") {
  const token = await getBearerToken(creds.clientId, creds.clientSecret);
  const messageId = uuidv4().replace(/-/g, "");

  const uniqueIdResponse = await axios.post(
    creds.generateUniqueIdUrl,
    { ConsumerSystemName: consumerSystemName },
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

  const payload = uniqueIdResponse.data?.Payload || uniqueIdResponse.data?.payload;

  if (!payload || !payload.UniqueID) {
    const errMsg =
      uniqueIdResponse.data?.Error?.ErrorMessage ||
      uniqueIdResponse.data?.Error?.ErrorDetails ||
      uniqueIdResponse.data?.Message ||
      uniqueIdResponse.data?.message ||
      "Sammaan generateuniqueid API returned no Payload (check IP whitelisting or credentials)";
    console.error("[SAMMAAN AUTH] Failed to retrieve UniqueID:", errMsg);
    throw new Error(`Sammaan generateuniqueid failed: ${errMsg}`);
  }

  const { UniqueID, key, iv } = payload;
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

    // 1. Get bearer token + unique ID + encryption keys
    const creds = getSammaanCreds();
    let token, UniqueID, key, iv;
    try {
      ({ token, UniqueID, key, iv } = await getTokenAndUniqueId(creds));
    } catch (apiErr) {
      const errMsg = apiErr?.response?.data || apiErr?.response?.status || apiErr.message;
      console.error("[SAMMAAN] Auth/UniqueID API failed:", errMsg);
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
    let salesforceUniqueId = null;
    try {
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

      if (mainApiResponse.data?.Message === "SUCCESS") {
        const parsedResponse = parseResponseData(mainApiResponse.data.ResponseData, key, iv);

        leadId = parsedResponse?.Payload?.LeadId || parsedResponse?.Payload?.LeadNo || parsedResponse?.LeadId;
        salesforceUniqueId =
          parsedResponse?.Payload?.UniqueId ||
          parsedResponse?.Payload?.UniqueID ||
          parsedResponse?.Payload?.uniqueId ||
          parsedResponse?.UniqueId ||
          null;
      } else {
        console.error("[SAMMAAN] Lead Push returned non-SUCCESS:", mainApiResponse.data);
      }
    } catch (leadErr) {
      const errMsg = leadErr?.response?.data || leadErr?.response?.status || leadErr.message;
      console.error("[SAMMAAN] Lead Push API failed:", errMsg);
      return res.status(502).json({
        status: "Error",
        message: "Failed to create lead on Sammaan Capital. Please try again.",
        detail: errMsg,
      });
    }

    // 4. Sammaan Lead creation failed (non-exception, bad response)
    if (!leadId) {
      console.error("[SAMMAAN] Did not return a Lead ID. Response:", mainApiResponse?.data);
      return res.status(400).json({
        status: "Error",
        message: "Sammaan Capital did not return a Lead ID. Lead not saved.",
        detail: mainApiResponse?.data || "No LeadId in decrypted payload",
      });
    }

    // 5. Save to DB — Sammaan confirmed the lead
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
          const docPayloadRes = docParsed?.Payload;
          const isSuccess = docPayloadRes?.status?.toLowerCase() === "success" || !!docPayloadRes?.DocumentId;
          if (isSuccess) {
            securedLoan.documentUploaded = true;
            securedLoan.documentId = docPayloadRes?.DocumentId || null;
            await securedLoan.save();
          } else {
            console.error("[SAMMAAN] Doc Upload unexpected payload:", docPayloadRes);
          }
        } else {
          console.error("[SAMMAAN] Doc Upload failed:", docUploadResponse.data);
        }
      } catch (docErr) {
        console.error("[SAMMAAN] Document upload failed (non-fatal):", docErr?.response?.data || docErr.message);
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
    console.error("[SAMMAAN] submitSecuredLoan error:", error?.response?.data || error);
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

function formatEmailSummary({
  targetLeadNo,
  middlewareUrl,
  httpStatus,
  statusPayload,
  requestEnvelope,
  rawResponse,
  parsedResponse,
}) {
  const border = "================================================================================";
  const divider = "--------------------------------------------------------------------------------";
  const lines = [
    border,
    "📧 [READY-TO-MAIL REPORT FOR SAMMAAN TEAM]",
    border,
    "Hi Team,",
    "",
    "Please find below the requested details for the Reverse Status Check API:",
    "",
    `1. Target Lead Number : ${targetLeadNo || "N/A"}`,
    `2. Salesforce UniqueID: ${statusPayload?.UniqueId || "N/A"} (18-digit Lead Unique ID)`,
    `3. Session UniqueID   : ${requestEnvelope?.UniqueID || "N/A"} (Session ID from getUniqueID API)`,
    `4. HTTP Status Code   : ${httpStatus || "N/A"}`,
    `5. Middleware Endpoint: ${middlewareUrl || "N/A"}`,
    `6. APIURL Name        : NewLeadModuleAPI-postReversestatuscheck`,
    `7. Timestamp (UTC)    : ${new Date().toISOString()}`,
    "",
    divider,
    "A. PLAINTEXT (DECRYPTED) REQUEST PAYLOAD:",
    divider,
    JSON.stringify(statusPayload, null, 2),
    "",
    divider,
    "B. ENCRYPTED REQUEST ENVELOPE (Sent to Sammaan Gateway):",
    divider,
    JSON.stringify(requestEnvelope, null, 2),
    "",
    divider,
    "C. RAW ENVELOPE RESPONSE (Received from Sammaan Gateway):",
    divider,
    `HTTP Status: ${httpStatus}`,
    JSON.stringify(rawResponse, null, 2),
    "",
    divider,
    "D. PLAINTEXT (DECRYPTED) RESPONSE PAYLOAD:",
    divider,
    parsedResponse
      ? JSON.stringify(parsedResponse, null, 2)
      : "N/A (Response was not encrypted / Gateway returned plaintext error or non-SUCCESS message)",
    border,
  ];
  return lines.join("\n");
}

exports.checkLeadStatus = async (req, res) => {
  const { id } = req.params;
  const startTime = Date.now();
  let targetLeadNo = null;
  let creds = null;
  let statusPayload = null;
  let requestEnvelope = null;

  try {
    const loan = isNaN(id)
      ? await SecuredLoan.findOne({ where: { externalLeadId: id } })
      : await SecuredLoan.findByPk(id);

    targetLeadNo = loan?.externalLeadId || (typeof id === "string" ? id.trim() : null);

    if (!targetLeadNo) {
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

    creds = getSammaanCreds();

    const { token, UniqueID, key, iv } = await getTokenAndUniqueId(creds, consumerSystemName);

    const explicitSalesforceId =
      req.query?.salesforceUniqueId ||
      req.query?.uniqueId ||
      req.body?.salesforceUniqueId ||
      req.body?.uniqueId;

    const innerUniqueId = (explicitSalesforceId && explicitSalesforceId.trim()) || loan?.salesforceUniqueId || UniqueID;

    // Persist salesforceUniqueId if newly provided
    if (loan && explicitSalesforceId && explicitSalesforceId.trim() && loan.salesforceUniqueId !== explicitSalesforceId.trim()) {
      loan.salesforceUniqueId = explicitSalesforceId.trim();
      await loan.save();
    }

    if (innerUniqueId === UniqueID) {
      console.error("[SAMMAAN] 18-digit Salesforce UniqueID not found. Falling back to session UniqueID — request may be rejected.");
    }

    statusPayload = {
      ConsumerSystemName: consumerSystemName,
      UniqueId: innerUniqueId,
      LeadNo: targetLeadNo,
      Filler1: "",
      Filler2: "",
    };

    // Sammaan doc: JSON → Base64 → AES-256-CBC
    const encryptedData = prepareRequestData(statusPayload, key, iv);
    const messageId2 = uuidv4().replace(/-/g, "");

    requestEnvelope = {
      ConsumerSystemName: consumerSystemName,
      UniqueID,
      RequestData: encryptedData,
      APIURL: "NewLeadModuleAPI-postReversestatuscheck",
      ExistingAPIMethod: "POST",
    };

    const statusResponse = await axios.post(
      creds.middlewareUrl,
      JSON.stringify(requestEnvelope),
      {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*",
          MessageId: messageId2,
          Sourceapplicationname: "MiddlewareEncryptDataAPI",
          Servicename: "ReverseStatusCheckAPI",
          apikey: creds.apikey,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const elapsed = Date.now() - startTime;

    if (statusResponse.data && statusResponse.data.Message === "SUCCESS") {
      try {
        const parsedResponse = parseResponseData(statusResponse.data.ResponseData, key, iv);

        const emailSummary = formatEmailSummary({
          targetLeadNo,
          middlewareUrl: creds.middlewareUrl,
          httpStatus: `${statusResponse.status} ${statusResponse.statusText || "OK"}`,
          statusPayload,
          requestEnvelope,
          rawResponse: statusResponse.data,
          parsedResponse,
        });

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
          }

          return res.status(200).json({
            status: "Success",
            message: "Status fetched live from Sammaan Capital",
            leadNo: targetLeadNo,
            currentStatus: resolvedStatus,
            sammaanLiveResponse: payload,
            fullDecryptedResponse: parsedResponse,
            emailReadySummary: emailSummary,
            data: loan || null,
            timeElapsedMs: elapsed,
          });
        } else if (parsedResponse?.Error) {
          console.error("[SAMMAAN] Decrypted error response:", parsedResponse.Error);
          return res.status(400).json({
            status: "Error",
            message: parsedResponse.Error.ErrorMessage || "Sammaan returned an error response",
            leadNo: targetLeadNo,
            errorDetails: parsedResponse.Error,
            fullDecryptedResponse: parsedResponse,
            rawResponse: statusResponse.data,
            emailReadySummary: emailSummary,
            timeElapsedMs: elapsed,
          });
        } else {
          return res.status(200).json({
            status: "Success",
            message: "Response decrypted from Sammaan Capital",
            leadNo: targetLeadNo,
            fullDecryptedResponse: parsedResponse,
            emailReadySummary: emailSummary,
            data: loan || null,
            timeElapsedMs: elapsed,
          });
        }
      } catch (decryptErr) {
        console.error("[SAMMAAN] Decryption failed:", decryptErr.message);
        const emailSummary = formatEmailSummary({
          targetLeadNo,
          middlewareUrl: creds.middlewareUrl,
          httpStatus: `${statusResponse.status} (Decryption Failed)`,
          statusPayload,
          requestEnvelope,
          rawResponse: statusResponse.data,
          parsedResponse: { decryptError: decryptErr.message },
        });

        return res.status(500).json({
          status: "Error",
          message: "Failed to decrypt Sammaan response data",
          decryptError: decryptErr.message,
          rawResponse: statusResponse.data,
          emailReadySummary: emailSummary,
          timeElapsedMs: elapsed,
        });
      }
    } else {
      console.error("[SAMMAAN] Non-SUCCESS response:", statusResponse.data);

      const emailSummary = formatEmailSummary({
        targetLeadNo,
        middlewareUrl: creds.middlewareUrl,
        httpStatus: `${statusResponse.status} (Non-SUCCESS ESB Message)`,
        statusPayload,
        requestEnvelope,
        rawResponse: statusResponse.data,
        parsedResponse: null,
      });

      return res.status(400).json({
        status: "Error",
        message: statusResponse.data?.Message || "Failed to fetch status from Sammaan Capital",
        leadNo: targetLeadNo,
        rawResponse: statusResponse.data,
        emailReadySummary: emailSummary,
        timeElapsedMs: elapsed,
      });
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error("[SAMMAAN] checkLeadStatus error:", err.message, err?.response?.data || "");

    const httpStatus = err.response ? `${err.response.status} ${err.response.statusText || ""}`.trim() : "500 Error";
    const emailSummary = formatEmailSummary({
      targetLeadNo: targetLeadNo || id,
      middlewareUrl: creds?.middlewareUrl || SAMMAAN_BASE_URL,
      httpStatus,
      statusPayload: statusPayload || {},
      requestEnvelope: requestEnvelope || {},
      rawResponse: err?.response?.data || { message: err.message },
      parsedResponse: null,
    });

    return res.status(err.response?.status || 500).json({
      status: "Error",
      message: err.response?.data?.Error?.ErrorMessage || err.response?.data?.Message || err.message,
      detail: err?.response?.data || null,
      httpStatus: err?.response?.status || 500,
      emailReadySummary: emailSummary,
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

    if (docUploadResponse.data?.Message === "SUCCESS") {
      const docParsed = parseResponseData(docUploadResponse.data.ResponseData, key, iv);
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
    console.error("[SAMMAAN] uploadSecuredLoanDocument error:", error?.response?.data || error);
    return res.status(500).json({
      status: "Error",
      message: error.message,
      detail: error?.response?.data,
    });
  }
};
