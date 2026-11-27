/**
 * Personalized AI Loan Recommendation Service
 * Evaluates customer profile against approved F2Fintech loan products,
 * filters out ineligible options, assesses FOIR affordability & total cost,
 * and explains preliminary match rationale without guaranteeing approval.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { LoanProductCatalog } = require("../../../model/chatbot");
const { calculateRepaymentDetails } = require("./repayment.service");
const { normalizeCategorySlug, NOT_AVAILABLE } = require("./comparison.service");

const PURPOSE_TO_CATEGORY = [
  { keywords: ["doctor", "clinic", "hospital", "medical", "mbbs", "bds", "dental"], slug: "doctor-loan", label: "Doctor Loan" },
  { keywords: ["ca", "chartered accountant", "cs", "lawyer", "architect", "professional"], slug: "professional-loan", label: "Professional Loan" },
  { keywords: ["home", "house", "flat", "apartment", "construction", "plot"], slug: "home-loans", label: "Home Loan" },
  { keywords: ["property", "lap", "mortgage", "collateral"], slug: "loan-against-property", label: "Loan Against Property" },
  { keywords: ["business", "working capital", "inventory", "expansion", "msme", "shop", "machinery", "equipment"], slug: "business-loan", label: "Business Loan" },
  { keywords: ["personal", "wedding", "medical emergency", "travel", "debt consolidation", "education", "family"], slug: "personal-loan", label: "Personal Loan" },
];

function inferCategoryFromProfile({ purpose, loanCategory, employmentType }) {
  if (loanCategory) {
    return normalizeCategorySlug(loanCategory);
  }
  const combined = `${purpose || ""} ${employmentType || ""}`.toLowerCase();
  for (const rule of PURPOSE_TO_CATEGORY) {
    if (rule.keywords.some((kw) => combined.includes(kw))) {
      return rule.slug;
    }
  }
  if (String(employmentType || "").toLowerCase().includes("business")) return "business-loan";
  if (String(employmentType || "").toLowerCase().includes("doctor")) return "doctor-loan";
  if (String(employmentType || "").toLowerCase().includes("professional")) return "professional-loan";
  return "personal-loan";
}

function getMissingIntakeQuestions(profile = {}, lang = "en") {
  const missing = [];
  if (!profile.purpose && !profile.loanCategory) {
    missing.push({
      field: "purpose",
      questionEn: "What is the primary purpose of your loan (e.g., personal need, business growth, clinic/practice, home purchase, or loan against property)?",
      questionHi: "आप किस उद्देश्य के लिए लोन लेना चाहते हैं (जैसे पर्सनल जरूरत, बिज़नेस, डॉक्टर/क्लीनिक, होम लोन, या प्रॉपर्टी पर लोन)?",
    });
  }
  if (!profile.loanAmount) {
    missing.push({
      field: "loanAmount",
      questionEn: "How much loan amount do you require (in ₹)?",
      questionHi: "आपको कितने रुपये का लोन चाहिए?",
    });
  }
  if (!profile.employmentType) {
    missing.push({
      field: "employmentType",
      questionEn: "What is your employment type (Salaried, Business Owner, Doctor/Professional, or Self-Employed)?",
      questionHi: "आपका रोज़गार प्रकार क्या है (सैलरीड / बिज़नेस / डॉक्टर या प्रोफेशनल / स्व-रोज़गार)?",
    });
  }
  if (!profile.monthlyIncome) {
    missing.push({
      field: "monthlyIncome",
      questionEn: "What is your approximate monthly income (or average monthly business net income) in ₹?",
      questionHi: "आपकी अनुमानित मासिक आय (₹ में) कितनी है?",
    });
  }
  if (profile.existingEmi === undefined || profile.existingEmi === null) {
    missing.push({
      field: "existingEmi",
      questionEn: "Do you have any existing monthly EMIs? If yes, roughly how much per month (or 0 if none)?",
      questionHi: "क्या आपकी कोई मौजूदा मासिक EMI चल रही है? यदि हाँ, तो प्रति माह कितनी राशि है (यदि नहीं है तो 0 बताएं)?",
    });
  }
  if (!profile.tenureMonths) {
    missing.push({
      field: "tenureMonths",
      questionEn: "What is your preferred repayment tenure (in years or months)?",
      questionHi: "आप कितने समय (वर्ष या महीने) के लिए लोन चुकाना पसंद करेंगे?",
    });
  }
  return missing;
}

/**
 * Evaluate and rank suitable approved products for a customer's profile.
 */
async function recommendLoans(profile = {}, companyId = 101) {
  const missingQuestions = getMissingIntakeQuestions(profile);
  const categorySlug = inferCategoryFromProfile(profile);

  const amount = Number(profile.loanAmount) || 500000;
  const tenureMonths = Number(profile.tenureMonths) || (categorySlug === "home-loans" ? 180 : categorySlug === "loan-against-property" ? 120 : 48);
  const monthlyIncome = Number(profile.monthlyIncome) || null;
  const existingEmi = Math.max(0, Number(profile.existingEmi) || 0);
  const cibilScore = profile.cibilScore ? Number(profile.cibilScore) : null;
  const experienceYears = profile.experienceYears !== undefined ? Number(profile.experienceYears) : null;
  const empType = profile.employmentType ? String(profile.employmentType).toLowerCase().trim() : null;

  const catalog = await LoanProductCatalog.findAll({
    where: {
      company_id: companyId,
      loan_category_slug: categorySlug,
      status: "approved",
    },
  });

  const eligible = [];
  const filteredOut = [];

  for (const prod of catalog) {
    const reasonsFailed = [];

    if (prod.min_amount != null && amount < Number(prod.min_amount)) {
      reasonsFailed.push(`Requested ₹${amount.toLocaleString("en-IN")} is below minimum ₹${Number(prod.min_amount).toLocaleString("en-IN")}`);
    }
    if (prod.max_amount != null && amount > Number(prod.max_amount)) {
      reasonsFailed.push(`Requested ₹${amount.toLocaleString("en-IN")} exceeds maximum ₹${Number(prod.max_amount).toLocaleString("en-IN")}`);
    }
    if (prod.max_tenure_months != null && tenureMonths > Number(prod.max_tenure_months)) {
      reasonsFailed.push(`Requested tenure (${tenureMonths} mos) exceeds max ${prod.max_tenure_months} mos`);
    }
    if (monthlyIncome != null && prod.min_monthly_income != null && monthlyIncome < Number(prod.min_monthly_income)) {
      reasonsFailed.push(`Monthly income ₹${monthlyIncome.toLocaleString("en-IN")} is below min ₹${Number(prod.min_monthly_income).toLocaleString("en-IN")}`);
    }
    if (cibilScore != null && prod.min_cibil != null && cibilScore < Number(prod.min_cibil)) {
      reasonsFailed.push(`Provided CIBIL (${cibilScore}) is below typical threshold (${prod.min_cibil}+)`);
    }

    const rateMin = prod.rate_min != null ? Number(prod.rate_min) : null;
    if (rateMin == null) {
      reasonsFailed.push("Indicative interest rate not configured");
    }

    if (reasonsFailed.length > 0) {
      filteredOut.push({
        providerName: prod.provider_name,
        loanCategory: prod.loan_category_slug,
        reasons: reasonsFailed,
      });
      continue;
    }

    const calc = calculateRepaymentDetails({
      principal: amount,
      annualRatePercent: rateMin,
      tenureMonths,
      monthlyIncome,
      existingEmi,
    });

    const foir = calc.affordability?.foirPercent ?? null;
    const maxFoir = prod.max_foir_percent || 65;
    if (foir !== null && foir > maxFoir) {
      filteredOut.push({
        providerName: prod.provider_name,
        loanCategory: prod.loan_category_slug,
        reasons: [`Estimated post-loan FOIR (${foir}%) exceeds safe affordability threshold (${maxFoir}%)`],
      });
      continue;
    }

    // Holistic scoring (affordability + cost + tenure headroom + F2 recommendation)
    let score = 100;
    score -= rateMin * 1.8; // rate impact
    if (foir !== null) {
      if (foir <= 40) score += 15;
      else if (foir <= 55) score += 6;
      else score -= 8;
    }
    if (prod.is_recommended) score += 8;
    if (prod.max_tenure_months && prod.max_tenure_months >= tenureMonths + 12) score += 4;
    if (empType && Array.isArray(prod.supported_employment_types_json) && prod.supported_employment_types_json.includes(empType)) {
      score += 5;
    }
    if (experienceYears !== null && experienceYears < 1 && categorySlug === "business-loan") {
      score -= 10;
    }

    const matchReasons = [];
    matchReasons.push(`Amount ₹${amount.toLocaleString("en-IN")} & ${tenureMonths}-month tenure fit within lender limits (${prod.amount_text || "configured range"}).`);
    if (foir !== null) {
      matchReasons.push(`Post-loan FOIR is ${foir}% (${calc.affordability.riskLevel}), keeping monthly repayments manageable.`);
    }
    if (cibilScore) {
      matchReasons.push(`Your credit score (${cibilScore}) satisfies the typical ${prod.min_cibil || 700}+ criterion.`);
    }
    if (prod.is_recommended) {
      matchReasons.push("Marked as a recommended F2 Fintech partner for competitive terms & processing.");
    }

    eligible.push({
      score: Number(score.toFixed(2)),
      providerName: prod.provider_name,
      shortName: prod.provider_short_name || prod.provider_name,
      logo: prod.provider_logo || null,
      loanCategory: prod.loan_category_slug,
      productSlug: prod.product_slug,
      interestRateRange: prod.rate_range_text || `${rateMin.toFixed(2)}%`,
      processingFee: prod.processing_fee_text || NOT_AVAILABLE,
      prepaymentCharges: prod.prepayment_charges || NOT_AVAILABLE,
      foreclosureCharges: prod.foreclosure_charges || NOT_AVAILABLE,
      estimatedMonthlyEmi: calc.summary.monthlyEmi,
      estimatedTotalInterest: calc.summary.totalInterestPayable,
      estimatedTotalRepayment: calc.summary.totalRepaymentAmount,
      affordability: calc.affordability,
      matchReasons,
      requiredDocuments: prod.required_documents_json || NOT_AVAILABLE,
      isRecommended: Boolean(prod.is_recommended),
    });
  }

  eligible.sort((a, b) => b.score - a.score);
  const topRecommendations = eligible.slice(0, 4);

  return {
    inferredCategory: categorySlug,
    missingQuestions,
    needsMoreInfo: missingQuestions.length > 0,
    profileUsed: {
      loanCategory: categorySlug,
      loanAmount: amount,
      tenureMonths,
      employmentType: empType || "Not Specified",
      monthlyIncome: monthlyIncome || "Not Specified",
      existingEmi,
      cibilScore: cibilScore || "Not Specified",
      city: profile.city || "Not Specified",
    },
    eligibleCount: eligible.length,
    filteredOutCount: filteredOut.length,
    recommendations: topRecommendations,
    filteredOutSample: filteredOut.slice(0, 5),
    approvalDisclaimer:
      "Preliminary profile match only — NOT a guarantee of loan approval. Final sanction, interest rate, and tenure depend on official lender underwriting, KYC, and credit bureau verification.",
  };
}

module.exports = {
  inferCategoryFromProfile,
  getMissingIntakeQuestions,
  recommendLoans,
};

