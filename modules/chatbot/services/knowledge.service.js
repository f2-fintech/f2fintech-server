/**
 * Verified Internal Knowledge Retrieval Service
 * Searches strictly approved MySQL knowledge entries, approved loan catalog,
 * published blogs, and approved Upstash Vector embeddings.
 * Enforces strict internal-data-only fallback when no verified data exists.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { Op } = require("sequelize");
const { ChatbotKnowledgeBase, LoanProductCatalog, LoanFormConfig } = require("../../../model/chatbot");
const LoanProviderModel = require("../../../model/loan_provider");
const BlogModel = require("../../../model/blogs");
const { searchSimilarDocs } = require("../../../utility/vector-context");

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
 * Retrieve verified internal knowledge across MySQL KB, Loan Catalog, Providers, Blogs, and Upstash Vector.
 */
async function retrieveVerifiedKnowledge(query, { companyId = 101, language = "en", limit = 6 } = {}) {
  const terms = extractSearchTerms(query);
  const queryLower = String(query || "").toLowerCase();
  const focusedSlug = detectFocusedCategorySlug(queryLower);
  const isCompanyQuery =
    /\b(f2\s*fintech|f2fintech|company|established|founded|founder|co[-\s]?founder|ceo|md|managing\s+director|harpreet|abhinav|mission|vision|values|timeline|history|award|shark\s+tank|office|address|what\s+do\s+you\s+do)\b/i.test(
      queryLower
    );

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

      // Avoid stray 1-word incidental hits on long out-of-scope queries unless title/keywords or domain intent matched
      if (!focusedSlug && !isCompanyQuery && terms.length >= 4 && distinctMatches < 2 && kwScore === 0 && titleScore === 0) {
        return { row, score: 0 };
      }

      let score = distinctMatches + titleScore * 1.5 + kwScore * 1.5;
      if (row.category && queryLower.includes(row.category.replace("_", " "))) score += 2;
      if (focusedSlug) {
        if (row.slug === focusedSlug) score += 25;
        else if (row.slug === "loan-categories-overview") score -= 10;
      }
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
      if (terms.length >= 4 && headerMatch === 0 && bodyMatch < 2) {
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
        limit: 4,
      });
      matchedLegacyProviders = lpRows;
    } catch {
      matchedLegacyProviders = [];
    }
  }

  const evidenceChunks = [];

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
  retrieveVerifiedKnowledge,
  getFormConfiguration,
};

