/**
 * Loan Comparison Engine Service
 * Compares strictly from approved MySQL loan_product_catalog & loan_provider records.
 * Uses consistent loan amount and tenure across all compared products.
 * Never invents missing fields — marks unavailable data explicitly as "Not Available".
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { Op } = require("sequelize");
const { LoanProductCatalog } = require("../../../model/chatbot");
const LoanProviderModel = require("../../../model/loan_provider");
const { calculateRepaymentDetails } = require("./repayment.service");

const NOT_AVAILABLE = "Not Available";

function formatINR(val) {
  if (val === null || val === undefined || isNaN(Number(val))) return NOT_AVAILABLE;
  return `₹${Number(val).toLocaleString("en-IN")}`;
}

function normalizeCategorySlug(input) {
  if (!input) return null;
  const s = String(input).toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (s.includes("home")) return "home-loans";
  if (s.includes("lap") || s.includes("property")) return "loan-against-property";
  if (s.includes("doctor")) return "doctor-loan";
  if (s.includes("professional")) return "professional-loan";
  if (s.includes("personal")) return "personal-loan";
  if (s.includes("business") || s.includes("msme")) return "business-loan";
  return s;
}

/**
 * Normalize a catalog DB record into a strict comparison row for consistent amount & tenure.
 */
function buildComparisonEntry(record, loanAmount, tenureMonths) {
  const rateMin = record.rate_min !== null && record.rate_min !== undefined ? Number(record.rate_min) : null;
  const rateMax = record.rate_max !== null && record.rate_max !== undefined ? Number(record.rate_max) : null;
  const effectiveRate = rateMin !== null ? rateMin : rateMax;

  let monthlyEmi = NOT_AVAILABLE;
  let totalInterestPayable = NOT_AVAILABLE;
  let totalRepaymentAmount = NOT_AVAILABLE;
  let numericEmi = null;
  let numericTotalCost = null;

  if (effectiveRate !== null && effectiveRate > 0 && loanAmount > 0 && tenureMonths > 0) {
    const calc = calculateRepaymentDetails({
      principal: loanAmount,
      annualRatePercent: effectiveRate,
      tenureMonths,
    });
    monthlyEmi = calc.summary.monthlyEmi;
    totalInterestPayable = calc.summary.totalInterestPayable;
    totalRepaymentAmount = calc.summary.totalRepaymentAmount;
    numericEmi = calc.summary.monthlyEmi;
    numericTotalCost = calc.summary.totalRepaymentAmount;
  }

  const aprDisplay =
    record.apr_min !== null && record.apr_min !== undefined
      ? record.apr_max && Number(record.apr_max) !== Number(record.apr_min)
        ? `${Number(record.apr_min).toFixed(2)}% – ${Number(record.apr_max).toFixed(2)}%`
        : `${Number(record.apr_min).toFixed(2)}%`
      : NOT_AVAILABLE;

  const rateDisplay =
    record.rate_range_text ||
    (rateMin !== null && rateMax !== null
      ? `${rateMin.toFixed(2)}% – ${rateMax.toFixed(2)}%`
      : rateMin !== null
        ? `${rateMin.toFixed(2)}%`
        : NOT_AVAILABLE);

  const maxTenureMonths = record.max_tenure_months ? Number(record.max_tenure_months) : null;
  const maxTenureYears = maxTenureMonths ? Number((maxTenureMonths / 12).toFixed(1)) : null;

  const withinAmountRange =
    (record.min_amount == null || loanAmount >= Number(record.min_amount)) &&
    (record.max_amount == null || loanAmount <= Number(record.max_amount));
  const withinTenureRange = maxTenureMonths == null || tenureMonths <= maxTenureMonths;

  return {
    id: record.id,
    providerName: record.provider_name,
    shortName: record.provider_short_name || record.provider_name,
    logo: record.provider_logo || null,
    loanCategory: record.loan_category_slug,
    productSlug: record.product_slug,
    isRecommended: Boolean(record.is_recommended),
    rateMin,
    rateMax,
    interestRateDisplay: rateDisplay,
    aprDisplay,
    processingFee: record.processing_fee_text || NOT_AVAILABLE,
    minAmount: record.min_amount != null ? Number(record.min_amount) : null,
    maxAmount: record.max_amount != null ? Number(record.max_amount) : null,
    loanAmountRange:
      record.amount_text ||
      (record.min_amount != null && record.max_amount != null
        ? `${formatINR(record.min_amount)} – ${formatINR(record.max_amount)}`
        : NOT_AVAILABLE),
    maxTenureDisplay: maxTenureYears ? `Up to ${maxTenureYears} Years (${maxTenureMonths} Months)` : NOT_AVAILABLE,
    comparedLoanAmount: loanAmount,
    comparedTenureMonths: tenureMonths,
    estimatedMonthlyEmi: monthlyEmi,
    estimatedTotalInterest: totalInterestPayable,
    estimatedTotalRepayment: totalRepaymentAmount,
    minIncomeRequirement: record.min_monthly_income ? `${formatINR(record.min_monthly_income)} / month` : NOT_AVAILABLE,
    minCibilScore: record.min_cibil ? `${record.min_cibil}+` : NOT_AVAILABLE,
    eligibilityCriteria:
      Array.isArray(record.eligibility_criteria_json) && record.eligibility_criteria_json.length > 0
        ? record.eligibility_criteria_json
        : NOT_AVAILABLE,
    requiredDocuments:
      Array.isArray(record.required_documents_json) && record.required_documents_json.length > 0
        ? record.required_documents_json
        : NOT_AVAILABLE,
    prepaymentCharges: record.prepayment_charges || NOT_AVAILABLE,
    foreclosureCharges: record.foreclosure_charges || NOT_AVAILABLE,
    otherFees:
      Array.isArray(record.other_fees_json) && record.other_fees_json.length > 0
        ? record.other_fees_json
        : NOT_AVAILABLE,
    ltv: record.ltv_text || NOT_AVAILABLE,
    withinAmountRange,
    withinTenureRange,
    _numericRate: effectiveRate,
    _numericEmi: numericEmi,
    _numericTotalCost: numericTotalCost,
  };
}

/**
 * Compare F2Fintech loan providers/products from approved backend catalog.
 */
async function compareLoanProducts({
  loanCategory,
  providerNames = [],
  loanAmount = 500000,
  tenureMonths = 60,
  limit = 6,
  companyId = 101,
}) {
  const categorySlug = normalizeCategorySlug(loanCategory);
  const amount = Math.max(10000, Number(loanAmount) || 500000);
  const tenure = Math.max(6, Math.round(Number(tenureMonths) || 60));

  const where = {
    company_id: companyId,
    status: "approved",
  };
  if (categorySlug) {
    where.loan_category_slug = categorySlug;
  }
  if (Array.isArray(providerNames) && providerNames.length > 0) {
    where[Op.or] = providerNames.map((name) => ({
      provider_name: { [Op.like]: `%${String(name).trim()}%` },
    }));
  }

  let rows = await LoanProductCatalog.findAll({
    where,
    order: [
      ["rate_min", "ASC"],
      ["is_recommended", "DESC"],
    ],
    limit: Math.min(Number(limit) || 6, 12),
  });

  // Fallback check against legacy loan_provider table if specific providers were requested and absent in catalog
  if (rows.length === 0 && Array.isArray(providerNames) && providerNames.length > 0) {
    const legacyRows = await LoanProviderModel.findAll({
      where: {
        [Op.or]: providerNames.map((name) => ({
          title: { [Op.like]: `%${String(name).trim()}%` },
        })),
      },
      limit: Math.min(Number(limit) || 6, 10),
    });

    rows = legacyRows.map((lp) => {
      const rateParts = String(lp.interest_rate || "")
        .split("-")
        .map((x) => parseFloat(x.replace(/[^0-9.]/g, "")))
        .filter((n) => !isNaN(n));
      return {
        id: lp.id,
        provider_name: lp.title,
        provider_short_name: lp.title,
        provider_logo: lp.home_image || null,
        loan_category_slug: categorySlug || "general",
        product_slug: `${String(lp.title || "provider").toLowerCase().replace(/\s+/g, "-")}-legacy`,
        rate_min: rateParts[0] ?? null,
        rate_max: rateParts[1] ?? rateParts[0] ?? null,
        rate_range_text: lp.interest_rate || null,
        apr_min: null,
        apr_max: null,
        processing_fee_text: lp.charges || null,
        min_amount: lp.min_amount != null ? Number(lp.min_amount) : null,
        max_amount: lp.max_amount != null ? Number(lp.max_amount) : null,
        max_tenure_months: lp.max_tenure ? Number(lp.max_tenure) * 12 : null,
        min_monthly_income: null,
        min_cibil: null,
        prepayment_charges: null,
        foreclosure_charges: null,
        eligibility_criteria_json: lp.minimum_kyc ? [lp.minimum_kyc] : null,
        required_documents_json: lp.document_required ? [lp.document_required] : null,
        other_fees_json: null,
        is_recommended: false,
      };
    });
  }

  if (!rows || rows.length === 0) {
    return {
      found: false,
      loanCategory: categorySlug || "all",
      comparedLoanAmount: amount,
      comparedTenureMonths: tenure,
      items: [],
      summary: null,
      disclaimer: "No matching approved loan products were found in F2Fintech's configured catalog.",
    };
  }

  const items = rows.map((r) => buildComparisonEntry(r, amount, tenure));

  // Identify comparison leaders deterministically
  const validRates = items.filter((i) => i._numericRate !== null);
  const validCosts = items.filter((i) => i._numericTotalCost !== null);

  const lowestRateItem =
    validRates.length > 0
      ? validRates.reduce((best, cur) => (cur._numericRate < best._numericRate ? cur : best))
      : null;
  const lowestCostItem =
    validCosts.length > 0
      ? validCosts.reduce((best, cur) => (cur._numericTotalCost < best._numericTotalCost ? cur : best))
      : null;

  const cleanedItems = items.map((it) => {
    const badges = [];
    if (lowestRateItem && it.productSlug === lowestRateItem.productSlug) badges.push("Lowest Starting Rate");
    if (lowestCostItem && it.productSlug === lowestCostItem.productSlug) badges.push("Lowest Est. Repayment");
    if (it.isRecommended) badges.push("F2 Recommended");
    if (!it.withinAmountRange || !it.withinTenureRange) badges.push("Check Amount/Tenure Cap");

    const { _numericRate, _numericEmi, _numericTotalCost, ...publicFields } = it;
    return {
      ...publicFields,
      badges,
    };
  });

  const rationale = [];
  if (lowestRateItem) {
    rationale.push(
      `${lowestRateItem.providerName} starts at ${lowestRateItem.rateMin.toFixed(2)}% p.a. (Est. EMI ₹${Number(lowestRateItem.estimatedMonthlyEmi).toLocaleString("en-IN")}/mo for ₹${amount.toLocaleString("en-IN")} over ${tenure} months).`
    );
  }
  if (items.some((i) => i.prepaymentCharges === NOT_AVAILABLE || i.aprDisplay === NOT_AVAILABLE)) {
    rationale.push('Fields marked "Not Available" are not disclosed in the configured lender sheet and are confirmed at lender sanction.');
  }

  return {
    found: true,
    loanCategory: categorySlug || "mixed",
    comparedLoanAmount: amount,
    comparedTenureMonths: tenure,
    items: cleanedItems,
    summary: {
      totalCompared: cleanedItems.length,
      lowestRateProvider: lowestRateItem?.providerName || NOT_AVAILABLE,
      lowestRateValue: lowestRateItem ? `${lowestRateItem.rateMin.toFixed(2)}%` : NOT_AVAILABLE,
      lowestEmiValue: lowestCostItem?.estimatedMonthlyEmi || NOT_AVAILABLE,
      rationale,
    },
    disclaimer:
      "Comparison uses F2Fintech's approved lender catalog with consistent loan amount and tenure. Estimated EMIs use starting indicative rates; final APR, fees, and approval depend on lender credit assessment.",
  };
}

module.exports = {
  NOT_AVAILABLE,
  normalizeCategorySlug,
  compareLoanProducts,
};

