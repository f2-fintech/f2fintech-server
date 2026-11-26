/**
 * Upstash Vector Context Service
 * Restricted to approved F2Fintech knowledge records with graceful fallback.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { Index } = require("@upstash/vector");

let cachedIndex = null;

function getVectorIndex() {
  if (cachedIndex) return cachedIndex;
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return null;
  cachedIndex = new Index({ url, token });
  return cachedIndex;
}

/**
 * Search approved F2Fintech knowledge documents in Upstash Vector.
 * Never throws on network/config absence so deterministic DB search always succeeds.
 */
const searchSimilarDocs = async (data, topK = 5, options = {}) => {
  const index = getVectorIndex();
  if (!index || !data || !String(data).trim()) {
    return options.returnStructured ? [] : "";
  }

  try {
    const results = await index.query({
      data: String(data).trim(),
      topK: topK || 5,
      includeMetadata: true,
      includeData: true,
    });

    const approvedResults = (Array.isArray(results) ? results : []).filter((doc) => {
      if (!doc) return false;
      const metaStatus = doc.metadata?.status;
      if (metaStatus && metaStatus !== "approved") return false;
      if (options.companyId && doc.metadata?.company_id && Number(doc.metadata.company_id) !== Number(options.companyId)) {
        return false;
      }
      return Boolean(doc.data || doc.metadata?.content);
    });

    if (options.returnStructured) {
      return approvedResults.map((doc) => ({
        id: doc.id,
        score: doc.score,
        title: doc.metadata?.title || "F2Fintech Knowledge",
        category: doc.metadata?.category || "general",
        source_ref: doc.metadata?.source_ref || "internal_kb",
        content: doc.data || doc.metadata?.content || "",
      }));
    }

    return approvedResults
      .map((doc) => doc.data || doc.metadata?.content || "")
      .filter(Boolean)
      .join("\n");
  } catch (err) {
    console.warn("[VectorContext] Search fallback triggered:", err.message);
    return options.returnStructured ? [] : "";
  }
};

/**
 * Upsert an approved knowledge base entry into Upstash Vector.
 */
const upsertKnowledgeVector = async ({ id, slug, title, content, category, status, companyId, sourceRef }) => {
  const index = getVectorIndex();
  if (!index || status !== "approved") return false;

  try {
    const vectorId = slug ? `kb_${slug}` : `kb_${id}`;
    await index.upsert({
      id: vectorId,
      data: `${title}\n${content}`.slice(0, 6000),
      metadata: {
        id,
        slug,
        title,
        category,
        status,
        company_id: companyId || 101,
        source_ref: sourceRef || "admin_kb",
      },
    });
    return true;
  } catch (err) {
    console.warn("[VectorContext] Upsert failed:", err.message);
    return false;
  }
};

/**
 * Remove a deleted/archived knowledge base entry from Upstash Vector.
 */
const deleteKnowledgeVector = async ({ id, slug }) => {
  const index = getVectorIndex();
  if (!index) return false;
  try {
    const vectorId = slug ? `kb_${slug}` : `kb_${id}`;
    await index.delete(vectorId);
    return true;
  } catch (err) {
    console.warn("[VectorContext] Delete failed:", err.message);
    return false;
  }
};

module.exports = {
  searchSimilarDocs,
  upsertKnowledgeVector,
  deleteKnowledgeVector,
};
