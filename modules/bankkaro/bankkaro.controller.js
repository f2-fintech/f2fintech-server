/**
 * BankKaro Controller - Narrow Endpoints & Client Request Processing
 * Keeps response shapes compatible with what the frontend expects while stripping unneeded fields.
 * Never leaks upstream errors or keys.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const bankkaroService = require("./bankkaro.service");
const CreditCardClickModel = require("../../model/credit_card_click");
const CreditCardLeadModel = require("../../model/credit_card_lead");

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

/**
 * GET /api/v1/credit-cards
 */
exports.getAllCards = async (req, res) => {
  try {
    const { category, bank, free_cards, search, sort_by } = req.query;

    const data = await bankkaroService.fetchCards();
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
            card.annual_fee_text === "0" ||
            card.annual_fee_text === "Nil"
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
    console.error("[BankKaroController.getAllCards Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch credit cards from service.",
    });
  }
};

/**
 * GET /api/v1/credit-cards/popular
 */
exports.getPopularCards = async (req, res) => {
  try {
    const data = await bankkaroService.fetchPopularCards();
    return res.status(200).json({
      status: "Success",
      message: "Popular cards fetched successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[BankKaroController.getPopularCards Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch popular cards.",
    });
  }
};

/**
 * GET /api/v1/credit-cards/init-bundle
 */
exports.getInitBundle = async (req, res) => {
  try {
    const data = await bankkaroService.fetchInitBundle();
    return res.status(200).json({
      status: "Success",
      message: "Init bundle fetched successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[BankKaroController.getInitBundle Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch card catalog bundle.",
    });
  }
};

/**
 * GET /api/v1/credit-cards/card/:alias
 */
exports.getCardByAlias = async (req, res) => {
  try {
    const { alias } = req.params;
    if (!alias) {
      return res.status(400).json({ status: "Error", message: "Card alias is required." });
    }
    const data = await bankkaroService.fetchCardByAlias(alias);
    return res.status(200).json({
      status: "Success",
      message: "Card details fetched successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[BankKaroController.getCardByAlias Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch card details.",
    });
  }
};

/**
 * POST /api/v1/credit-cards/calculate
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

    const data = await bankkaroService.calculateSpends(normalizedPayload);
    return res.status(200).json({
      status: "Success",
      message: "Spends calculated successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[BankKaroController.calculateSpends Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to calculate card savings.",
    });
  }
};

/**
 * POST /api/v1/credit-cards/eligibility
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

    const data = await bankkaroService.checkEligibility(payload);
    return res.status(200).json({
      status: "Success",
      message: "Eligibility checked successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[BankKaroController.checkEligibility Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to evaluate card eligibility.",
    });
  }
};

/**
 * POST /api/v1/credit-cards/stateless-bre
 */
exports.applyStatelessBRE = async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.loan_amount_required || !payload.inhandIncome) {
      return res.status(400).json({
        status: "Error",
        message: "loan_amount_required and inhandIncome are required",
      });
    }

    const normalizedBRE = {
      dob: payload.dob || "1995-01-01",
      loan_amount_required: Number(payload.loan_amount_required),
      employmentStatus: String(payload.employmentStatus || "salaried").toLowerCase(),
      inhandIncome: Number(payload.inhandIncome),
      salary_recieved_in: String(payload.salary_recieved_in || "bank").toLowerCase(),
      company_name: String(payload.company_name || "Private Company"),
      pincode: String(payload.pincode || "110001"),
      office_pincode: String(payload.office_pincode || payload.pincode || "110001"),
    };

    const data = await bankkaroService.applyStatelessBRE(normalizedBRE);
    return res.status(200).json({
      status: "Success",
      message: "Stateless BRE evaluated successfully",
      data: data.data || data,
    });
  } catch (error) {
    console.error("[BankKaroController.applyStatelessBRE Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to evaluate pre-approved offers.",
    });
  }
};

/**
 * POST /api/v1/credit-cards/track-click
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
    const finalTrackingUrl = buildTrackingUrl(networkUrl, clickId, customer_id);

    try {
      await CreditCardClickModel.create({
        click_id: clickId,
        customer_id: customer_id ? parseInt(customer_id) : null,
        card_id: card_id ? parseInt(card_id) : null,
        card_name: card_name || null,
        card_alias: card_alias || null,
        campaign_id: campaign_id || null,
        network_url: finalTrackingUrl || network_url || null,
        card_type: card_type || null,
        bank_name: bank_name || null,
        card_tags: card_tags || null,
        joining_fee_text: joining_fee_text || null,
        commissionable: commissionable !== undefined ? Boolean(commissionable) : true,
        user_ip: req.ip || req.headers["x-forwarded-for"] || null,
        user_agent: req.headers["user-agent"] || null,
        referrer: req.headers["referer"] || null,
      });
    } catch (dbErr) {
      console.warn("[BankKaroController.trackClick] DB save skipped:", dbErr.message);
    }

    return res.status(200).json({
      status: "Success",
      click_id: clickId,
      tracking_url: finalTrackingUrl,
    });
  } catch (error) {
    console.error("[BankKaroController.trackClick Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to process card click.",
    });
  }
};

/**
 * POST /api/v1/credit-cards/create-lead
 */
exports.createLead = async (req, res) => {
  try {
    const {
      customer_id,
      card_id,
      card_name,
      card_alias,
      bank_name,
      card_type,
      full_name,
      mobile,
      email,
      pan,
      pincode,
      inhand_income,
      employment_status,
      campaign_id,
      network_url,
      tracking_url,
      click_id,
      status,
      notes,
    } = req.body;

    if (!mobile || !full_name) {
      return res.status(400).json({
        status: "Error",
        message: "Full name and mobile number are required.",
      });
    }

    let savedLead = null;
    try {
      savedLead = await CreditCardLeadModel.create({
        customer_id: customer_id ? parseInt(customer_id) : null,
        card_id: card_id ? parseInt(card_id) : null,
        card_name: card_name || null,
        card_alias: card_alias || null,
        bank_name: bank_name || null,
        card_type: card_type || null,
        full_name: full_name.trim(),
        mobile: mobile.trim(),
        email: email ? email.trim() : null,
        pan: pan ? pan.trim().toUpperCase() : null,
        pincode: pincode ? pincode.trim() : null,
        inhand_income: inhand_income ? parseFloat(inhand_income) : null,
        employment_status: employment_status || null,
        campaign_id: campaign_id || null,
        network_url: network_url || null,
        tracking_url: tracking_url || network_url || null,
        click_id: click_id || null,
        status: status || "Initiated",
        notes: notes || null,
        user_ip: req.ip || req.headers["x-forwarded-for"] || null,
      });
    } catch (dbErr) {
      console.warn("[BankKaroController.createLead] DB save skipped:", dbErr.message);
    }

    return res.status(201).json({
      status: "Success",
      message: "Credit card lead recorded successfully",
      lead_id: savedLead ? savedLead.id : null,
      tracking_url: tracking_url || network_url || "",
    });
  } catch (error) {
    console.error("[BankKaroController.createLead Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to record lead.",
    });
  }
};

/**
 * GET /api/v1/credit-cards/leads
 */
exports.getAllLeads = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (status && status !== "all") {
      where.status = status;
    }

    let leads = { count: 0, rows: [] };
    try {
      leads = await CreditCardLeadModel.findAndCountAll({
        where,
        order: [["created_at", "DESC"]],
        limit: parseInt(limit),
        offset,
      });
    } catch (dbErr) {
      console.warn("[BankKaroController.getAllLeads] DB query skipped:", dbErr.message);
    }

    return res.status(200).json({
      status: "Success",
      total: leads.count,
      page: parseInt(page),
      totalPages: Math.ceil(leads.count / parseInt(limit)),
      data: leads.rows,
    });
  } catch (error) {
    console.error("[BankKaroController.getAllLeads Error]:", error.message);
    return res.status(500).json({
      status: "Error",
      message: "Failed to fetch card leads.",
    });
  }
};

