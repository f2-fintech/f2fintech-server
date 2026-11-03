/**
 * Credit Cards Controller - BankKaro / Great.Cards Integration & Lead/Click Tracking
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const CreditCardClickModel = require("../../model/credit_card_click");
const CreditCardLeadModel = require("../../model/credit_card_lead");

const rawBaseUrl = process.env.BANKKARO_BASE_URL || "https://platform.bankkaro.com";
const BANKKARO_BASE_URL = rawBaseUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "");
const rawStatelessUrl = process.env.BANKKARO_STATELESS_BASE_URL || "";
const BANKKARO_STATELESS_BASE_URL = rawStatelessUrl ? rawStatelessUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "") : null;
const BANKKARO_API_KEY = process.env.BANKKARO_API_KEY;

// Cache JWT partner tokens per base URL (Production vs UAT)
const partnerTokenCache = {};

/**
 * Obtain or return cached BankKaro Partner JWT Token for a given base URL
 */
async function getPartnerToken(baseUrl = BANKKARO_BASE_URL) {
  if (!BANKKARO_API_KEY) {
    throw new Error("BANKKARO_API_KEY is not defined in environment variables");
  }

  const cleanBase = baseUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "");
  const now = Date.now();
  const cached = partnerTokenCache[cleanBase];
  if (cached && now < cached.expiresAt - 60000) {
    return cached.token;
  }

  try {
    const response = await fetch(`${cleanBase}/partner/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ "x-api-key": BANKKARO_API_KEY }),
    });

    const data = await response.json();
    if (data.status === "success" && data.data && data.data.jwttoken) {
      partnerTokenCache[cleanBase] = {
        token: data.data.jwttoken,
        expiresAt: data.data.expiresAt ? new Date(data.data.expiresAt).getTime() : now + 3600000,
      };
      return partnerTokenCache[cleanBase].token;
    } else {
      throw new Error(data.message || `Failed to retrieve BankKaro partner token from ${cleanBase}`);
    }
  } catch (error) {
    console.error(`[BankKaro Token Error (${cleanBase})]:`, error.message);
    throw error;
  }
}

/**
 * Helper to fetch from BankKaro API with partner-token header
 */
async function callBankKaroAPI(endpoint, method = "GET", body = null, baseUrl = BANKKARO_BASE_URL) {
  const cleanBase = baseUrl.replace(/\/partner\/?$/, "").replace(/\/$/, "");
  const token = await getPartnerToken(cleanBase);
  const options = {
    method,
    headers: {
      "partner-token": token,
      "Content-Type": "application/json",
    },
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const response = await fetch(`${cleanBase}${endpoint}`, options);
  const data = await response.json();
  if (data && typeof data === "object") {
    data._httpStatus = response.status;
  }
  return data;
}

/**
 * Format affiliate tracking URL with unique click_id and customer_id
 */
function buildTrackingUrl(networkUrl, clickId, customerId = "guest") {
  if (!networkUrl) return "";
  let url = networkUrl.trim();
  if (url.includes("{click_id}")) {
    url = url.replace(/\{click_id\}/g, clickId);
  }
  if (url.includes("{user_id}")) {
    url = url.replace(/\{user_id\}/g, customerId ? String(customerId) : "guest");
  }
  if (!url.includes("click_id") && !url.includes("p1=")) {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}p1=${clickId}&p2=${customerId || "guest"}`;
  }
  return url;
}

// ------------------------------ CONTROLLER METHODS ------------------------------

/**
 * GET /api/v1/credit-cards
 * Retrieve all credit cards with optional search, category, bank, and sorting filters
 */
exports.getAllCards = async (req, res) => {
  try {
    const { category, bank, free_cards, search, sort_by } = req.query;

    const data = await callBankKaroAPI("/partner/cardgenius/v2/cards", "GET");
    let cards = [];

    if (Array.isArray(data)) {
      cards = data;
    } else if (data.data && Array.isArray(data.data)) {
      cards = data.data;
    } else if (data.data && Array.isArray(data.data.cards)) {
      cards = data.data.cards;
    }

    // Filter in-memory if query parameters are provided
    if (cards && cards.length > 0) {
      if (category && category !== "all") {
        const catLower = category.toLowerCase();
        cards = cards.filter((card) => {
          if (!card.tags || !Array.isArray(card.tags)) return false;
          return card.tags.some(
            (t) =>
              (t.name && t.name.toLowerCase().includes(catLower)) ||
              (t.seo_alias && t.seo_alias.toLowerCase().includes(catLower))
          );
        });
      }

      if (bank && bank !== "all") {
        const bankLower = bank.toLowerCase();
        cards = cards.filter(
          (card) => card.bank_name && card.bank_name.toLowerCase().includes(bankLower)
        );
      }

      if (free_cards === "true" || free_cards === "1") {
        cards = cards.filter(
          (card) =>
            card.joining_fee_text === "0" ||
            card.joining_fee_text === "Free" ||
            card.joining_fee_text === "Nil" ||
            (card.annual_fee_text === "0" || card.annual_fee_text === "Nil")
        );
      }

      if (search && search.trim()) {
        const sLower = search.trim().toLowerCase();
        cards = cards.filter(
          (card) =>
            (card.name && card.name.toLowerCase().includes(sLower)) ||
            (card.bank_name && card.bank_name.toLowerCase().includes(sLower)) ||
            (card.card_type && card.card_type.toLowerCase().includes(sLower))
        );
      }

      if (sort_by === "rating") {
        cards.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
      } else if (sort_by === "savings") {
        cards.sort((a, b) => (parseFloat(b.annual_saving) || 0) - (parseFloat(a.annual_saving) || 0));
      } else if (sort_by === "fee_low_to_high") {
        cards.sort(
          (a, b) => (parseFloat(a.joining_fee_text) || 0) - (parseFloat(b.joining_fee_text) || 0)
        );
      }
    }

    return res.status(200).json({
      status: "Success",
      message: "Credit cards fetched successfully",
      count: cards.length,
      data: cards,
    });
  } catch (error) {
    console.error("[getAllCards Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch credit cards",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/credit-cards/popular
 * Retrieve popular / recommended credit cards
 */
exports.getPopularCards = async (req, res) => {
  try {
    const data = await callBankKaroAPI("/partner/cardgenius/popular-cards", "GET");
    return res.status(200).json({
      status: "Success",
      message: "Popular cards fetched successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[getPopularCards Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch popular cards",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/credit-cards/init-bundle
 * Retrieve CardGenius initial bundle (categories, featured cards, tags)
 */
exports.getInitBundle = async (req, res) => {
  try {
    const data = await callBankKaroAPI("/partner/cardgenius/init-bundle", "GET");
    return res.status(200).json({
      status: "Success",
      message: "Init bundle fetched successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[getInitBundle Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch init bundle",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/credit-cards/:alias
 * Retrieve single card details by alias
 */
exports.getCardByAlias = async (req, res) => {
  try {
    const { alias } = req.params;
    const data = await callBankKaroAPI(`/partner/cardgenius/cards/${alias}`, "GET");
    return res.status(200).json({
      status: "Success",
      message: "Card details fetched successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[getCardByAlias Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch card details",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/credit-cards/calculate
 * Calculate annual reward savings based on category monthly spends
 */
exports.calculateSpends = async (req, res) => {
  try {
    const raw = req.body || {};
    const normalizedPayload = {
      amazon_spends: parseInt(raw.amazon_spends) || 0,
      flipkart_spends: parseInt(raw.flipkart_spends) || 0,
      other_online_spends: parseInt(raw.other_online_spends) || 0,
      other_offline_spends: parseInt(raw.other_offline_spends) || 0,
      grocery_spends_online: parseInt(raw.grocery_spends_online) || 0,
      offline_grocery: parseInt(raw.offline_grocery) || 0,
      online_food_ordering: parseInt(raw.online_food_ordering) || 0,
      fuel: parseInt(raw.fuel) || 0,
      dining_or_going_out: parseInt(raw.dining_or_going_out) || 0,
      flights_annual: parseInt(raw.flights_annual) || 0,
      hotels_annual: parseInt(raw.hotels_annual) || 0,
      domestic_lounge_usage_quarterly: parseInt(raw.domestic_lounge_usage_quarterly) || 0,
      international_lounge_usage_quarterly: parseInt(raw.international_lounge_usage_quarterly) || 0,
      mobile_phone_bills: parseInt(raw.mobile_phone_bills) || 0,
      electricity_bills: parseInt(raw.electricity_bills) || 0,
      water_bills: parseInt(raw.water_bills) || 0,
      insurance_car_or_bike_annual: parseInt(raw.insurance_car_or_bike_annual) || 0,
      insurance_health_annual: parseInt(raw.insurance_health_annual) || 0,
      life_insurance: parseInt(raw.life_insurance) || 0,
      rent: parseInt(raw.rent) || 0,
      school_fees: parseInt(raw.school_fees) || 0,
    };

    const data = await callBankKaroAPI("/partner/cardgenius/v2/calculate", "POST", normalizedPayload);
    return res.status(200).json({
      status: "Success",
      message: "Spends calculated successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[calculateSpends Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to calculate spends",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/credit-cards/eligibility
 * Check eligibility based on pincode, inhandIncome, and empStatus
 */
exports.checkEligibility = async (req, res) => {
  try {
    const raw = req.body || {};
    let normalizedEmpStatus = "salaried";
    if (raw.empStatus) {
      const lower = String(raw.empStatus).toLowerCase().replace(/[\s-]+/g, "_");
      if (lower.includes("self") || lower.includes("business")) {
        normalizedEmpStatus = "self_employed";
      } else {
        normalizedEmpStatus = "salaried";
      }
    }

    const payload = {
      pincode: String(raw.pincode || "").trim(),
      inhandIncome: String(raw.inhandIncome || "0").trim(),
      empStatus: normalizedEmpStatus,
    };

    const data = await callBankKaroAPI("/partner/cardgenius/eligiblity", "POST", payload);
    return res.status(200).json({
      status: "Success",
      message: "Eligibility checked successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[checkEligibility Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to check eligibility",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/credit-cards/track-click
 * Record a user card click into MySQL credit_card_click table and return formatted affiliate tracking link
 */
exports.trackClick = async (req, res) => {
  try {
    const {
      card_id,
      card_name,
      card_alias,
      campaign_id,
      network_url,
      customer_id,
      card_type,
      bank_name,
      card_tags,
      joining_fee_text,
      commissionable,
    } = req.body;

    const clickId = `f2_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalTrackingUrl = buildTrackingUrl(network_url, clickId, customer_id);

    const clientIp =
      req.headers["x-forwarded-for"] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "";
    const userAgent = req.headers["user-agent"] || "";
    const referrer = req.headers["referer"] || "";

    const clickRecord = await CreditCardClickModel.create({
      card_id: card_id ? parseInt(card_id) : null,
      card_name: card_name || "",
      card_alias: card_alias || "",
      campaign_id: campaign_id ? String(campaign_id) : null,
      click_id: clickId,
      tracking_url: finalTrackingUrl,
      customer_id: customer_id ? parseInt(customer_id) : null,
      user_agent: userAgent,
      ip_address: clientIp.substring(0, 64),
      referrer: referrer.substring(0, 512),
      card_type: card_type || "",
      bank_name: bank_name || "",
      card_tags: typeof card_tags === "string" ? card_tags : Array.isArray(card_tags) ? card_tags.join(",") : "",
      joining_fee_text: joining_fee_text ? String(joining_fee_text) : "",
      commissionable: commissionable === false ? 0 : 1,
    });

    return res.status(200).json({
      status: "Success",
      message: "Click tracked successfully",
      click_id: clickId,
      tracking_url: finalTrackingUrl,
      data: clickRecord,
    });
  } catch (error) {
    console.error("[trackClick Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to track click",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/credit-cards/create-lead
 * Capture user details before bank redirect and save to MySQL credit_card_lead table
 */
exports.createLead = async (req, res) => {
  try {
    const {
      full_name,
      mobile,
      email,
      city,
      pincode,
      card_id,
      card_name,
      card_alias,
      bank_name,
      card_type,
      joining_fee_text,
      campaign_id,
      network_url,
      customer_id,
      click_id,
    } = req.body;

    if (!full_name || !mobile) {
      return res.status(400).json({
        status: "Error",
        message: "Full name and Mobile number are required",
      });
    }

    const finalClickId = click_id || `f2_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalTrackingUrl = buildTrackingUrl(network_url, finalClickId, customer_id);

    const clientIp =
      req.headers["x-forwarded-for"] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "";

    const leadRecord = await CreditCardLeadModel.create({
      full_name: full_name.trim(),
      mobile: String(mobile).trim(),
      email: email ? email.trim() : "",
      city: city ? city.trim() : "",
      pincode: pincode ? String(pincode).trim() : "",
      card_id: card_id ? parseInt(card_id) : null,
      card_name: card_name || "",
      card_alias: card_alias || "",
      bank_name: bank_name || "",
      card_type: card_type || "",
      joining_fee_text: joining_fee_text ? String(joining_fee_text) : "",
      campaign_id: campaign_id ? String(campaign_id) : null,
      click_id: finalClickId,
      tracking_url: finalTrackingUrl,
      customer_id: customer_id ? parseInt(customer_id) : null,
      ip_address: clientIp.substring(0, 64),
      status: "initiated",
    });

    return res.status(200).json({
      status: "Success",
      message: "Lead submitted successfully",
      lead_id: leadRecord.id,
      click_id: finalClickId,
      tracking_url: finalTrackingUrl,
      data: leadRecord,
    });
  } catch (error) {
    console.error("[createLead Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to create lead",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/credit-cards/leads
 * Get all credit card application leads for Admin dashboard
 */
exports.getAllLeads = async (req, res) => {
  try {
    const { Op } = require("sequelize");
    const { search, status, page = 1, limit = 50 } = req.query;
    const whereClause = {};

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereClause[Op.or] = [
        { full_name: { [Op.like]: q } },
        { mobile: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { city: { [Op.like]: q } },
        { pincode: { [Op.like]: q } },
        { card_name: { [Op.like]: q } },
        { bank_name: { [Op.like]: q } },
      ];
    }

    if (status && status !== "all") {
      whereClause.status = status;
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await CreditCardLeadModel.findAndCountAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
      limit: Number(limit),
      offset: Number(offset),
    });

    const totalLeads = await CreditCardLeadModel.count();

    return res.status(200).json({
      status: "Success",
      data: rows,
      meta: {
        total: count,
        page: Number(page),
        limit: Number(limit),
      },
      stats: {
        totalLeads,
      },
    });
  } catch (error) {
    console.error("[getAllLeads Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch credit card leads",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/credit-cards/stateless-bre
 * Stateless BRE eligibility check (Great.Cards / BankKaro) with internal lead recording
 */
exports.applyStatelessBRE = async (req, res) => {
  try {
    const {
      full_name,
      mobile,
      email,
      dob,
      loan_amount_required,
      employmentStatus,
      inhandIncome,
      salary_recieved_in,
      company_name,
      pincode,
      office_pincode,
      fetch_credit_consent = true,
      know_your_credit_score = true,
      loan_tenure = 12,
    } = req.body;

    // Validate mandatory fields required by BankKaro Stateless BRE
    const missingFields = [];
    if (!dob) missingFields.push("dob");
    if (!loan_amount_required) missingFields.push("loan_amount_required");
    if (!employmentStatus) missingFields.push("employmentStatus");
    if (!inhandIncome) missingFields.push("inhandIncome");
    if (!salary_recieved_in) missingFields.push("salary_recieved_in");
    if (!company_name) missingFields.push("company_name");
    if (!pincode) missingFields.push("pincode");
    if (!office_pincode) missingFields.push("office_pincode");

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: "Error",
        message: "Validation Failed",
        missing_fields: missingFields,
        detail: `The following required fields are missing: ${missingFields.join(", ")}`,
      });
    }

    // Capture applicant lead into credit_card_lead model for audit & business records
    try {
      const clientIp =
        req.headers["x-forwarded-for"] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        "";

      await CreditCardLeadModel.create({
        full_name: full_name ? String(full_name).trim() : "Guest Applicant",
        mobile: mobile ? String(mobile).trim() : "9999999999",
        email: email ? String(email).trim() : "",
        city: "",
        pincode: String(pincode).trim(),
        card_name: "Stateless Instant Offer Application",
        bank_name: "Multi-Lender BRE",
        card_type: String(employmentStatus),
        joining_fee_text: String(loan_amount_required),
        admin_notes: `Stateless BRE: income=${inhandIncome}, employer=${company_name}, salary_mode=${salary_recieved_in}, office_pincode=${office_pincode}`,
        ip_address: clientIp.substring(0, 64),
        status: "initiated",
      });
    } catch (leadSaveErr) {
      console.warn("[Stateless BRE] Lead capture warning (non-fatal):", leadSaveErr.message);
    }

    // Prepare BankKaro Stateless BRE payload
    const brePayload = {
      dob: String(dob).trim(),
      loan_amount_required: Number(loan_amount_required),
      employmentStatus: String(employmentStatus).toLowerCase().trim(),
      inhandIncome: Number(inhandIncome),
      salary_recieved_in: String(salary_recieved_in).toLowerCase().trim(),
      company_name: String(company_name).trim(),
      pincode: String(pincode).trim(),
      office_pincode: String(office_pincode).trim(),
      fetch_credit_consent: Boolean(fetch_credit_consent),
      know_your_credit_score: Boolean(know_your_credit_score),
      loan_tenure: Number(loan_tenure) || 12,
    };

    const targetStatelessUrl = BANKKARO_STATELESS_BASE_URL || BANKKARO_BASE_URL;

    let responseData = null;
    try {
      // First try bre-stage-advanced for richer priced offers
      responseData = await callBankKaroAPI(
        "/partner/loangenius/stateless/bre-stage-advanced",
        "POST",
        brePayload,
        targetStatelessUrl
      );
    } catch (advErr) {
      console.warn("[Stateless BRE] Advanced BRE call error:", advErr.message);
    }

    // Check if the stateless route is not enabled (HTTP 405) on the current host (e.g. BankKaro PROD route pending activation)
    const isRouteDisabled =
      responseData?._httpStatus === 405 ||
      (responseData?.message && responseData.message.toLowerCase().includes("not allowed"));

    if (isRouteDisabled && targetStatelessUrl !== "https://uat-platform.bankkaro.com") {
      console.warn("[Stateless BRE] Stateless route not enabled on", targetStatelessUrl, "failing over to UAT gateway...");
      try {
        responseData = await callBankKaroAPI(
          "/partner/loangenius/stateless/bre-stage-advanced",
          "POST",
          brePayload,
          "https://uat-platform.bankkaro.com"
        );
      } catch (uatErr) {
        console.warn("[Stateless BRE] UAT Advanced BRE error:", uatErr.message);
      }
    }

    // If advanced didn't return offers or returned an error, fallback to bre-stage-basic
    if (!responseData || !responseData.data || !responseData.data.offers) {
      const basicPayload = {
        dob: brePayload.dob,
        loan_amount_required: brePayload.loan_amount_required,
        employmentStatus: brePayload.employmentStatus,
        inhandIncome: brePayload.inhandIncome,
        salary_recieved_in: brePayload.salary_recieved_in,
        company_name: brePayload.company_name,
        pincode: brePayload.pincode,
        office_pincode: brePayload.office_pincode,
      };

      try {
        const fallbackUrl = (isRouteDisabled || targetStatelessUrl.includes("platform.bankkaro.com"))
          ? "https://uat-platform.bankkaro.com"
          : targetStatelessUrl;

        responseData = await callBankKaroAPI(
          "/partner/loangenius/stateless/bre-stage-basic",
          "POST",
          basicPayload,
          fallbackUrl
        );
      } catch (basicErr) {
        console.error("[Stateless BRE] Basic BRE call failed:", basicErr);
        return res.status(502).json({
          status: "Error",
          message: "Unable to connect to Partner BRE API. Please try again later.",
          detail: basicErr.message,
        });
      }
    }

    if (responseData && (responseData.status === "success" || responseData.data)) {
      const data = responseData.data || {};
      return res.status(200).json({
        status: "Success",
        message: "Eligibility evaluated successfully",
        isEligible: data.isEligible !== false,
        offers: data.offers || [],
        inEligibleOffers: data.inEligibleOffers || [],
      });
    }

    return res.status(502).json({
      status: "Error",
      message: responseData?.message || "Partner API evaluated with non-success response",
      data: responseData,
    });
  } catch (error) {
    console.error("[applyStatelessBRE Error]:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error during eligibility check",
      error: error.message,
    });
  }
};


