/**
 * Credit Cards Controller - BankKaro / Great.Cards Integration & Lead/Click Tracking
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const CreditCardClickModel = require("../../model/credit_card_click");
const CreditCardLeadModel = require("../../model/credit_card_lead");

const BANKKARO_BASE_URL = process.env.BANKKARO_BASE_URL;
const BANKKARO_API_KEY = process.env.BANKKARO_API_KEY;

let cachedPartnerToken = null;
let tokenExpiresAt = 0;

/**
 * Obtain or return cached BankKaro Partner JWT Token
 */
async function getPartnerToken() {
  const now = Date.now();
  if (cachedPartnerToken && now < tokenExpiresAt - 60000) {
    return cachedPartnerToken;
  }

  try {
    const response = await fetch(`${BANKKARO_BASE_URL}/partner/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ "x-api-key": BANKKARO_API_KEY }),
    });

    const data = await response.json();
    if (data.status === "success" && data.data && data.data.jwttoken) {
      cachedPartnerToken = data.data.jwttoken;
      tokenExpiresAt = data.data.expiresAt ? new Date(data.data.expiresAt).getTime() : now + 3600000;
      return cachedPartnerToken;
    } else {
      throw new Error(data.message || "Failed to retrieve BankKaro partner token");
    }
  } catch (error) {
    console.error("[BankKaro Token Error]:", error);
    throw error;
  }
}

/**
 * Helper to fetch from BankKaro API with partner-token header
 */
async function callBankKaroAPI(endpoint, method = "GET", body = null) {
  const token = await getPartnerToken();
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

  const response = await fetch(`${BANKKARO_BASE_URL}${endpoint}`, options);
  return await response.json();
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
    const data = await callBankKaroAPI("/partner/cardgenius/eligiblity", "POST", req.body);
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
