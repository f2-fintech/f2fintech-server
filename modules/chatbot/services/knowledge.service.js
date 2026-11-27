/**
 * Verified Internal Knowledge Retrieval Service
 * Searches strictly approved MySQL knowledge entries, approved loan catalog,
 * published blogs, and approved Upstash Vector embeddings.
 * Enforces strict internal-data-only fallback when no verified data exists.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const axios = require("axios");
const { Op } = require("sequelize");
const { ChatbotKnowledgeBase, LoanProductCatalog, LoanFormConfig } = require("../../../model/chatbot");
const LoanProviderModel = require("../../../model/loan_provider");
const BlogModel = require("../../../model/blogs");
const { searchSimilarDocs } = require("../../../utility/vector-context");
const { fetchCreditCardsCatalog } = require("../../../controller/credit_cards");

const ATS_BASE_URL = process.env.ATS_API_URL || "https://ats-web-7ysc.onrender.com";
const DEFAULT_ATS_COMPANY_ID = "572691c9-cc32-45be-b82b-13ee432b805b";
const ATS_CACHE_TTL_MS = 5 * 60 * 1000;
let atsOpeningsCache = { fetchedAt: 0, payload: null };

function parseJsonOrTextArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      return [raw];
    }
  }
  return [String(raw)];
}

/**
 * Fetch live active job openings from F2 Fintech's ATS (/careers live feed) with short caching & timeout.
 */
async function getActiveCareerOpenings({ search = "", department = "" } = {}) {
  const now = Date.now();
  let payload = atsOpeningsCache.payload;

  if (!payload || now - atsOpeningsCache.fetchedAt > ATS_CACHE_TTL_MS) {
    try {
      const companyRes = await axios
        .get(`${ATS_BASE_URL}/companies/companies/f2fintech`, { timeout: 4500 })
        .catch(() => ({ data: null }));
      const company = companyRes?.data || null;
      const atsCompanyId = company?._id || company?.id || DEFAULT_ATS_COMPANY_ID;

      const [statusesRes, jobsRes] = await Promise.all([
        axios
          .get(`${ATS_BASE_URL}/job-statuses/all-job-statuses`, {
            headers: { Company_id: atsCompanyId },
            timeout: 4500,
          })
          .catch(() => ({ data: {} })),
        axios.get(`${ATS_BASE_URL}/jobs/all-jobs?page=1&limit=30&search=&status=Open,Filled,Applied`, {
          headers: { Company_id: atsCompanyId },
          timeout: 5000,
        }),
      ]);

      const rawStatuses = statusesRes?.data?.jobStatuses || statusesRes?.data?.data || [];
      const statusMap = new Map();
      for (const s of Array.isArray(rawStatuses) ? rawStatuses : []) {
        if (s?.id) statusMap.set(String(s.id), s.jobStatus || "Open");
        if (s?._id) statusMap.set(String(s._id), s.jobStatus || "Open");
      }

      const rawJobs =
        jobsRes?.data?.jobs ||
        jobsRes?.data?.data ||
        (Array.isArray(jobsRes?.data) ? jobsRes.data : []);

      const mappedJobs = (Array.isArray(rawJobs) ? rawJobs : []).map((job) => {
        const statusLabel = statusMap.get(String(job.status || "")) || (typeof job.status === "string" && job.status.length < 25 ? job.status : "Open");
        const cleanDesc = String(job.description || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/\s+/g, " ")
          .trim();

        return {
          id: job.id || job._id || job.jobID || null,
          title: job.title
            ? String(job.title)
              .split(" ")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ")
            : "Role",
          titleCode: job.titleCode || null,
          status: statusLabel,
          type: job.type || "Full-Time",
          locationType: job.locationType || "On-site",
          scheduleType: job.scheduleType || null,
          shift: job.shiftStart && job.shiftEnd ? `${job.shiftStart} - ${job.shiftEnd}` : null,
          location: [job.city, job.state].filter(Boolean).join(", ") || "Noida, Uttar Pradesh",
          compensation: job.compensation || "Not Disclosed",
          skillsRequired: parseJsonOrTextArray(job.skillsRequired),
          experienceRequired: parseJsonOrTextArray(job.experienceRequired),
          customQuestions: Array.isArray(job.applicationForm?.question) ? job.applicationForm.question : [],
          summary: cleanDesc.slice(0, 420),
        };
      });

      const activeOnly = mappedJobs.filter((j) => !/closed|cancelled|draft/i.test(String(j.status)));
      payload = {
        liveFetched: true,
        source: "/careers (F2 Fintech ATS)",
        fetchedAt: new Date().toISOString(),
        openings: activeOnly,
      };
      atsOpeningsCache = { fetchedAt: now, payload };
    } catch (err) {
      console.warn("[KnowledgeService] Live ATS fetch skipped:", err.message);
      payload = payload || {
        liveFetched: false,
        source: "/careers",
        fetchedAt: null,
        openings: [],
      };
    }
  }

  let openings = Array.isArray(payload.openings) ? payload.openings : [];
  const searchLower = String(search || "").toLowerCase().trim();
  const deptLower = String(department || "").toLowerCase().trim();
  if (searchLower || deptLower) {
    const filtered = openings.filter((j) => {
      const hay = `${j.title} ${j.summary} ${j.skillsRequired.join(" ")}`.toLowerCase();
      return (!searchLower || hay.includes(searchLower)) && (!deptLower || hay.includes(deptLower));
    });
    if (filtered.length > 0) openings = filtered;
  }

  return {
    liveFetched: payload.liveFetched,
    totalActiveOpenings: openings.length,
    activeOpenings: openings,
    applyUrl: "/careers",
    departments: [
      "Sales",
      "Marketing",
      "HR",
      "Product",
      "Operations",
      "Credit",
      "IT & Infra",
      "Data",
      "Finance",
      "Other / Admin",
    ],
  };
}

const STRICT_UNAVAILABLE_RESPONSE =
  "I currently don't have verified information about this. I can assist you with F2Fintech's available loan products, providers, services, and application-related queries.";

const STRICT_UNAVAILABLE_RESPONSE_HI =
  "मेरे पास फिलहाल इस विषय पर सत्यापित जानकारी उपलब्ध नहीं है। मैं आपको F2Fintech के उपलब्ध लोन उत्पादों, लेंडिंग पार्टनर्स, सेवाओं और लोन आवेदन से जुड़े प्रश्नों में सहायता कर सकता हूँ।";

function extractSearchTerms(query) {
  const stopWords = new Set([
    "the", "is", "are", "was", "were", "what", "which", "who", "how", "when", "where", "why",
    "can", "could", "would", "should", "for", "with", "about", "from", "into", "your", "you",
    "me", "my", "tell", "give", "please", "does", "do", "have", "has", "any", "and", "or", "of",
    "in", "on", "to", "a", "an", "just", "only", "all", "related", "info", "information", "details",
    "kya", "hai", "hain", "mujhe", "chahiye", "batao", "bataiye", "ke", "ka", "ki", "ko", "mein", "bare",
  ]);
  const rawTokens = String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const filtered = rawTokens.filter((w) => !stopWords.has(w) && w !== "loan" && w !== "loans");
  // Preserve "f2"/"fintech" or "loan" when otherwise empty so "what is f2 fintech" hits company KB
  if (filtered.length > 0) return filtered.slice(0, 8);
  return rawTokens.filter((w) => !stopWords.has(w)).slice(0, 8);
}

function detectFocusedCategorySlug(queryLower) {
  const matches = [];
  if (/\bpersonal\b/.test(queryLower)) matches.push("personal-loan-details");
  if (/\bbusiness\b|\bmsme\b|\bsme\b/.test(queryLower)) matches.push("business-loan-details");
  if (/\bdoctor\b|\bmbbs\b|\bbds\b/.test(queryLower)) matches.push("doctor-loan-details");
  if (/\bprofessional\b|\bca\b|\bcs\b|\bcwa\b|\bcma\b|\blawyer\b|\barchitect\b/.test(queryLower)) matches.push("professional-loan-details");
  if (/\bhome\b|\bhousing\b/.test(queryLower)) matches.push("home-loan-details");
  if (/\blap\b|against property/.test(queryLower)) matches.push("lap-loan-against-property-details");
  return matches.length === 1 ? matches[0] : null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreMatch(text, terms) {
  if (!text || terms.length === 0) return 0;
  const lower = String(text).toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (/^[a-z0-9]+$/.test(t)) {
      if (new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(lower)) score += 1;
    } else if (lower.includes(t)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Retrieve structured verified credit card data from F2Fintech's BankKaro / CardGenius integration.
 */
async function getCreditCardAdvisorData({ category = "", bank = "", freeOnly = false, search = "", limit = 8 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 15));
  try {
    const [allCards, filteredCards] = await Promise.all([
      fetchCreditCardsCatalog({}),
      fetchCreditCardsCatalog({
        category: category || undefined,
        bank: bank || undefined,
        free_cards: freeOnly ? "true" : undefined,
        search: search || undefined,
      }),
    ]);

    const freeCardsCount = allCards.filter(
      (c) =>
        c.joining_fee_text === "0" ||
        c.joining_fee_text === "Free" ||
        c.joining_fee_text === "Nil" ||
        c.annual_fee_text === "0" ||
        c.annual_fee_text === "Nil"
    ).length;

    const categorySet = new Set();
    const networkSet = new Set();
    for (const c of allCards) {
      for (const t of c.tags || []) {
        if (t?.name) categorySet.add(t.name);
      }
      if (c.card_type) {
        for (const n of String(c.card_type).split(",")) {
          if (n.trim()) networkSet.add(n.trim());
        }
      }
    }

    // Prefer popular/priority-ranked or high annual-saving cards first when no explicit sort
    const ranked = [...filteredCards].sort((a, b) => {
      const pA = Number(a.priority || 999);
      const pB = Number(b.priority || 999);
      if (pA !== pB) return pA - pB;
      return (parseFloat(b.annual_saving) || 0) - (parseFloat(a.annual_saving) || 0);
    });

    const cards = ranked.slice(0, safeLimit).map((card) => ({
      id: card.id,
      name: card.name,
      network: card.card_type || "VISA/Mastercard",
      joiningFee:
        card.joining_fee_text === "0" || /^free|nil$/i.test(String(card.joining_fee_text || ""))
          ? "₹0 (Free)"
          : card.joining_fee_text
            ? `₹${card.joining_fee_text}`
            : "Not Available",
      annualFee:
        card.annual_fee_text === "0" || /^free|nil$/i.test(String(card.annual_fee_text || ""))
          ? "₹0 (Free)"
          : card.annual_fee_text
            ? `₹${card.annual_fee_text}`
            : "Not Available",
      estimatedAnnualSaving: card.annual_saving ? `Up to ₹${Number(card.annual_saving).toLocaleString("en-IN")}/yr` : null,
      rewardConversionRate: card.reward_conversion_rate && card.reward_conversion_rate !== "N/A" ? card.reward_conversion_rate : null,
      categories: (card.tags || []).map((t) => t.name).filter(Boolean),
      highlights: (card.product_usps || [])
        .slice(0, 2)
        .map((u) => `${String(u.header || "").trim()} ${String(u.description || "").trim()}`.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    }));

    return {
      liveFetched: allCards.length > 0,
      totalCardsAvailable: allCards.length,
      filteredCount: filteredCards.length,
      freeCardsCount,
      categories: Array.from(categorySet),
      networks: Array.from(networkSet),
      popularBanks: ["SBI", "HDFC", "Axis", "ICICI", "Kotak", "IndusInd", "IDFC", "YES", "AU", "RBL", "HSBC", "BOBCARD"],
      cards,
      cardsPageRoute: "/cards",
    };
  } catch (err) {
    console.warn("[KnowledgeService] Credit card live catalog fetch fallback:", err.message);
    return {
      liveFetched: false,
      totalCardsAvailable: 130,
      filteredCount: 0,
      freeCardsCount: null,
      categories: ["Shopping", "Online Food Ordering", "Dining", "Grocery Shopping", "Travel", "UPI", "Utility Bills", "Fuel", "Airport Lounge"],
      networks: ["VISA", "Mastercard", "RuPay", "AmericanExpress"],
      popularBanks: ["SBI", "HDFC", "Axis", "ICICI", "Kotak", "IndusInd", "IDFC", "YES", "AU", "RBL", "HSBC", "BOBCARD"],
      cards: [],
      cardsPageRoute: "/cards",
    };
  }
}

/**
 * Retrieve verified internal knowledge across MySQL KB, Loan Catalog, Providers, Blogs, and Upstash Vector.
 */
async function retrieveVerifiedKnowledge(
  query,
  { companyId = 101, language = "en", limit = 6, includeLiveJobs = true, includeLiveCards = true } = {}
) {
  const terms = extractSearchTerms(query);
  const queryLower = String(query || "").toLowerCase();
  const focusedSlug = detectFocusedCategorySlug(queryLower);
  const isCompanyQuery =
    /\b(f2\s*fintech|f2fintech|company|established|founded|founder|co[-\s]?founder|ceo|md|managing\s+director|harpreet|abhinav|mission|vision|values|timeline|history|award|shark\s+tank|office|address|what\s+do\s+you\s+do|about\s*us)\b/i.test(
      queryLower
    );
  const isRealtorQuery =
    /\b(realtor|realtors|real\s*estate|property\s*broker|property\s*agent|rera|8860600555)\b/i.test(queryLower);
  const isDsaQuery =
    /\b(dsa|dsas|direct\s*selling\s*agent|connector)\b/i.test(queryLower);
  const isChannelPartnerQuery =
    /\b(channel\s*partner|partner\s*program|become\s*(?:a\s*)?partner|onboarding|b2b)\b/i.test(queryLower);
  const isCareerQuery =
    /\b(job|jobs|career|careers|hiring|vacancy|vacancies|openings?|open\s*roles?|active\s*roles?|position|positions|intern|internship|resume|waitlist|departments?|work\s*schedule|work\s*culture|salary\s*package|shift)\b/i.test(
      queryLower
    );
  const isCreditCardQuery =
    /\b(credit\s*cards?|cards?|cardgenius|bankkaro|rupay|cashback\s*card|lounge|lifetime\s*free)\b|क्रेडिट\s*कार्ड/i.test(
      queryLower
    );
  const isCibilQuery =
    /\b(cibil|credit\s*score|credit\s*report|experian|bureau)\b|सिबिल/i.test(queryLower);
  const isRegulatoryQuery =
    /\b(regulatory|compliance|fair\s*practices?|fpc|grievance|redressal|privacy\s*policy|terms\s*(?:and|&)?\s*conditions?|terms\s*of\s*use|cin|lsp|lending\s*service\s*provider|gro)\b/i.test(
      queryLower
    );
  const isTechProductQuery =
    /\b(our\s*products?|ems|karya\.?io|aarogya|ats|quora\s*ai|payroll|saas)\b/i.test(queryLower);
  const isPortalQuery =
    /\b(eligibility\s*checker|cibil|credit\s*card|loan\s*tracker|subscription|plans?|portfolio\s*plan|blogs?|presentations?)\b/i.test(
      queryLower
    );
  const hasKnownDomainIntent =
    Boolean(focusedSlug) ||
    isCompanyQuery ||
    isRealtorQuery ||
    isDsaQuery ||
    isChannelPartnerQuery ||
    isCareerQuery ||
    isCreditCardQuery ||
    isCibilQuery ||
    isRegulatoryQuery ||
    isTechProductQuery ||
    isPortalQuery;

  // 1. Fetch approved Knowledge Base rows from MySQL
  const kbRows = await ChatbotKnowledgeBase.findAll({
    where: { company_id: companyId, status: "approved" },
  });

  const scoredKb = kbRows
    .map((row) => {
      const haystack = `${row.title} ${row.keywords || ""} ${row.content_en} ${row.content_hi || ""}`;
      const distinctMatches = scoreMatch(haystack, terms);
      const kwScore = row.keywords ? scoreMatch(row.keywords, terms) : 0;
      const titleScore = scoreMatch(row.title, terms);

      const requiredOverlap = terms.length <= 1 ? 1 : 2;
      // Avoid stray incidental body-word collisions on out-of-scope queries unless domain intent matched
      if (
        !hasKnownDomainIntent &&
        (distinctMatches < requiredOverlap || (titleScore === 0 && kwScore === 0 && distinctMatches < 3))
      ) {
        return { row, score: 0 };
      }

      let score = distinctMatches + titleScore * 1.5 + kwScore * 1.5;
      if (row.category && queryLower.includes(row.category.replace("_", " "))) score += 2;
      if (focusedSlug) {
        if (row.slug === focusedSlug) score += 25;
        else if (row.slug === "loan-categories-overview") score -= 10;
      }
      if (isRealtorQuery && row.slug === "realtor-partner-program-guide") score += 28;
      if (isDsaQuery && row.slug === "dsa-partner-program-guide") score += 28;
      if (isChannelPartnerQuery) {
        if (row.slug === "channel-partner-onboarding-guide") score += 24;
        if (row.slug === "realtor-partner-program-guide" || row.slug === "dsa-partner-program-guide") score += 12;
      }
      if (isCareerQuery) {
        if (row.slug === "careers-departments-roles-and-culture") score += 28;
        if (row.slug === "careers-application-steps-and-waitlist-guide") score += 26;
      }
      if (isCreditCardQuery && row.slug === "credit-cards-advisor-guide") score += 30;
      if (isCibilQuery && row.slug === "cibil-report-and-score-guide") score += 30;
      if (isRegulatoryQuery && row.slug === "regulatory-compliance-fair-practices-grievance") score += 30;
      if (isTechProductQuery && row.slug === "f2fintech-tech-products-and-resources") score += 28;
      if (isPortalQuery && row.slug === "self-serve-website-portals-guide") score += 24;
      if (isCompanyQuery && row.category === "company_info") {
        score += row.slug === "company-overview" ? 12 : 7;
        if (/\b(ceo|founder|co[-\s]?founder|harpreet|abhinav|leadership)\b/i.test(queryLower) && row.slug === "leadership-founders-ceo") {
          score += 18;
        }
        if (/\b(mission|vision|values|timeline|established|history|2022|2026)\b/i.test(queryLower) && row.slug === "company-mission-vision-values-timeline") {
          score += 10;
        }
      }
      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // 2. Match approved Loan Product Catalog entries if provider or category is mentioned
  const catalogRows = await LoanProductCatalog.findAll({
    where: { company_id: companyId, status: "approved" },
  });

  const matchedProducts = catalogRows
    .map((prod) => {
      const headerMatch = scoreMatch(`${prod.provider_name} ${prod.loan_category_slug}`, terms);
      const bodyMatch = scoreMatch(prod.about_text || "", terms);
      const minHeaderRequired = terms.length <= 1 ? 1 : 2;
      if (!hasKnownDomainIntent && headerMatch < minHeaderRequired && bodyMatch < 2) {
        return { prod, score: 0 };
      }
      if (headerMatch === 0 && bodyMatch < 2) {
        return { prod, score: 0 };
      }
      const score = headerMatch * 2 + bodyMatch;
      return { prod, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // 3. Match published blogs if relevant
  let matchedBlogs = [];
  if (terms.length > 0) {
    try {
      const blogRows = await BlogModel.findAll({
        attributes: ["id", "title", "excerpt", "category", "route"],
        limit: 40,
      });
      matchedBlogs = blogRows
        .map((b) => ({
          blog: b,
          score: scoreMatch(`${b.title} ${b.excerpt || ""} ${b.category || ""}`, terms),
        }))
        .filter((x) => x.score > 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    } catch {
      matchedBlogs = [];
    }
  }

  // 4. Query approved Upstash Vector embeddings (never fails if unavailable)
  const vectorDocs = await searchSimilarDocs(query, 4, {
    companyId,
    returnStructured: true,
  });

  // 5. Fallback check on loan_provider table if specific bank name queried
  let matchedLegacyProviders = [];
  if (terms.length > 0) {
    try {
      const lpRows = await LoanProviderModel.findAll({
        where: {
          [Op.or]: terms.map((t) => ({ title: { [Op.like]: `%${t}%` } })),
        },
        limit: 8,
      });
      const minProviderScore = terms.length <= 1 ? 1 : 2;
      matchedLegacyProviders = lpRows
        .filter((lp) => hasKnownDomainIntent || scoreMatch(lp.title, terms) >= minProviderScore)
        .slice(0, 4);
    } catch {
      matchedLegacyProviders = [];
    }
  }

  const evidenceChunks = [];

  if (isCareerQuery && includeLiveJobs) {
    const atsInfo = await getActiveCareerOpenings();
    const openingLines =
      atsInfo.activeOpenings.length > 0
        ? atsInfo.activeOpenings.map(
          (j) =>
            `• ${j.title}${j.titleCode ? ` (${j.titleCode})` : ""} | Status: ${j.status} | Type: ${j.type} (${j.locationType}) | Location: ${j.location} | Salary: ${j.compensation}${j.shift ? ` | Shift: ${j.scheduleType || ""} ${j.shift}`.trim() : ""} | Experience: ${(j.experienceRequired || []).join(", ") || "As per role"}${j.skillsRequired?.length ? ` | Skills: ${j.skillsRequired.join(", ")}` : ""}${j.customQuestions?.length ? ` | Screening Question(s): ${j.customQuestions.join("; ")}` : ""}\n  Summary: ${j.summary}`
        )
        : ["No open job requisitions returned right now; check /careers or join the Talent Waitlist."];

    evidenceChunks.push({
      sourceType: "live_ats_careers",
      id: "live-active-job-openings",
      title: `Live Active Job Openings on /careers (${atsInfo.totalActiveOpenings} active)`,
      sourceRef: "https://f2fintech.com/careers (ATS Live Feed)",
      content: [
        `Active Hiring Openings Count: ${atsInfo.totalActiveOpenings} (liveFetched=${atsInfo.liveFetched})`,
        ...openingLines,
        `Hiring Departments Listed on /careers: ${atsInfo.departments.join(", ")}`,
        `To apply: Visit /careers, click "Apply Now" on an active role for the 6-step application form, or click "Join Waitlist" if your role is not open.`,
      ].join("\n"),
    });
  }

  if (isCreditCardQuery && includeLiveCards) {
    const cardsInfo = await getCreditCardAdvisorData({
      freeOnly: /\b(free|lifetime\s*free|zero\s*fee|0\s*fee|no\s*fee)\b/i.test(queryLower),
      limit: 6,
    });
    const cardLines =
      cardsInfo.cards.length > 0
        ? cardsInfo.cards.map(
          (c) =>
            `• ${c.name} (${c.network}) | Joining Fee: ${c.joiningFee} | Annual Fee: ${c.annualFee}${c.estimatedAnnualSaving ? ` | Est. Annual Saving: ${c.estimatedAnnualSaving}` : ""}${c.categories.length ? ` | Categories: ${c.categories.join(", ")}` : ""}${c.highlights.length ? ` | Benefit: ${c.highlights[0]}` : ""}`
        )
        : ["Browse and filter 130+ verified credit cards live on /cards."];

    evidenceChunks.push({
      sourceType: "live_credit_cards",
      id: "live-bankkaro-credit-cards",
      title: `F2 Fintech Credit Cards Marketplace (/cards — ${cardsInfo.totalCardsAvailable} Live Cards)`,
      sourceRef: "https://f2fintech.com/cards (BankKaro CardGenius Live Feed)",
      content: [
        `Total Live Verified Credit Cards: ${cardsInfo.totalCardsAvailable} (${cardsInfo.freeCardsCount ?? "multiple"} lifetime-free / ₹0 fee options)`,
        `Categories: ${cardsInfo.categories.join(", ")}`,
        `Card Networks: ${cardsInfo.networks.join(", ")}`,
        `Major Issuing Banks: ${cardsInfo.popularBanks.join(", ")}`,
        `Sample Top Credit Cards:`,
        ...cardLines,
        `Interactive tools on /cards: Search by bank/card, Filter by category/network/fee, 3-Field Eligibility Checker, Spend Calculator, and Compare Cards side by side.`,
      ].join("\n"),
    });
  }

  for (const { row } of scoredKb) {
    evidenceChunks.push({
      sourceType: "knowledge_base",
      id: row.slug,
      title: row.title,
      sourceRef: row.source_ref,
      content: language === "hi" && row.content_hi ? `${row.content_hi}\n\n[English Reference]: ${row.content_en}` : row.content_en,
    });
  }

  for (const { prod } of matchedProducts) {
    evidenceChunks.push({
      sourceType: "loan_product_catalog",
      id: prod.product_slug,
      title: `${prod.provider_name} — ${prod.loan_category_slug}`,
      sourceRef: "loan_product_catalog",
      content: [
        `Provider: ${prod.provider_name}`,
        `Loan Type: ${prod.loan_category_slug}`,
        `Interest Rate: ${prod.rate_range_text || "Not Available"}`,
        `Processing Fee: ${prod.processing_fee_text || "Not Available"}`,
        `Amount Range: ${prod.amount_text || "Not Available"}`,
        `Max Tenure: ${prod.max_tenure_months ? `${prod.max_tenure_months / 12} Years` : "Not Available"}`,
        `Foreclosure / Prepayment: ${prod.foreclosure_charges || "Not Available"} / ${prod.prepayment_charges || "Not Available"}`,
        `Eligibility: ${(prod.eligibility_criteria_json || []).join("; ") || "Not Available"}`,
        `Required Documents: ${(prod.required_documents_json || []).join("; ") || "Not Available"}`,
      ].join("\n"),
    });
  }

  for (const lp of matchedLegacyProviders) {
    evidenceChunks.push({
      sourceType: "loan_provider",
      id: `provider_${lp.id}`,
      title: lp.title,
      sourceRef: "loan_provider",
      content: `Provider: ${lp.title}\nInterest Rate: ${lp.interest_rate || "Not Available"}\nCharges: ${lp.charges || "Not Available"}\nRange: ${lp.min_amount || "N/A"} - ${lp.max_amount || "N/A"}\nMax Tenure: ${lp.max_tenure || "N/A"} years\nKYC: ${lp.minimum_kyc || "Not Available"}\nDocuments: ${lp.document_required || "Not Available"}`,
    });
  }

  for (const { blog } of matchedBlogs) {
    evidenceChunks.push({
      sourceType: "blog",
      id: `blog_${blog.id}`,
      title: blog.title,
      sourceRef: blog.route || "blogs",
      content: `${blog.title} (${blog.category || "Article"}): ${blog.excerpt || ""}`,
    });
  }

  for (const vDoc of vectorDocs) {
    if (!evidenceChunks.some((e) => e.title === vDoc.title)) {
      evidenceChunks.push({
        sourceType: "vector_kb",
        id: vDoc.id,
        title: vDoc.title,
        sourceRef: vDoc.source_ref,
        content: vDoc.content,
      });
    }
  }

  return {
    hasVerifiedMatch: evidenceChunks.length > 0,
    chunks: evidenceChunks,
    fallbackMessage:
      language === "hi" ? STRICT_UNAVAILABLE_RESPONSE_HI : STRICT_UNAVAILABLE_RESPONSE,
  };
}

/**
 * Retrieve form configuration & available providers dynamically from backend DB.
 */
async function getFormConfiguration(loanType = null, companyId = 101) {
  const configs = await LoanFormConfig.findAll({
    where: {
      company_id: companyId,
      status: "approved",
      ...(loanType ? { loan_type: String(loanType).toLowerCase().trim() } : {}),
    },
  });

  const legacyProviders = await LoanProviderModel.findAll({
    attributes: ["id", "title", "interest_rate", "min_amount", "max_amount", "max_tenure", "home_image"],
    order: [["title", "ASC"]],
  });

  // Ensure all approved lenders from LoanProductCatalog (e.g. Standard Chartered, Piramal) appear too
  const seenTitles = new Set(legacyProviders.map((p) => String(p.title || "").toLowerCase().trim()));
  const mergedProviders = [...legacyProviders];
  try {
    const catalogProds = await LoanProductCatalog.findAll({
      where: { company_id: companyId, status: "approved" },
      attributes: ["provider_name", "rate_range_text", "min_amount", "max_amount", "max_tenure_months", "provider_logo"],
    });
    for (const cp of catalogProds) {
      const key = String(cp.provider_name || "").toLowerCase().trim();
      if (key && !seenTitles.has(key)) {
        seenTitles.add(key);
        mergedProviders.push({
          title: cp.provider_name,
          interest_rate: cp.rate_range_text || null,
          min_amount: cp.min_amount,
          max_amount: cp.max_amount,
          max_tenure: cp.max_tenure_months ? Math.round(cp.max_tenure_months / 12) : null,
          home_image: cp.provider_logo || null,
        });
      }
    }
  } catch {
    // non-blocking if mocked without LoanProductCatalog.findAll attributes
  }

  mergedProviders.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

  return {
    configs,
    providers: mergedProviders,
  };
}

module.exports = {
  STRICT_UNAVAILABLE_RESPONSE,
  STRICT_UNAVAILABLE_RESPONSE_HI,
  getActiveCareerOpenings,
  getCreditCardAdvisorData,
  retrieveVerifiedKnowledge,
  getFormConfiguration,
};

