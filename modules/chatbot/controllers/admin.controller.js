/**
 * Chatbot Admin Knowledge Management & Analytics Controller
 * Strictly guarded by requireAuth + requireAdmin.
 * Implements Draft -> Pending Approval -> Approved workflow with Upstash Vector sync,
 * and privacy-preserving analytics aggregations (zero customer PII).
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const {
  ChatbotKnowledgeBase,
  LoanProductCatalog,
  LoanFormConfig,
  ChatbotAuditLog,
  ChatbotTurnTrace,
  getEphemeralAnalyticsSummary,
  syncChatbotModels,
} = require("../../../model/chatbot");
const { upsertKnowledgeVector, deleteKnowledgeVector } = require("../../../utility/vector-context");
const { lookupApplicationForStaff } = require("../services/support.service");
const { hasPermission } = require("../utils/rbacPolicy");
const { listMcpToolDefinitions } = require("../mcp/f2fintechMcpServer");
const { invalidateChatbotCache, getCacheStats } = require("../services/cache.service");

function getCompanyId(req) {
  return Number(req.headers.companyid || req.headers.CompanyId || req.user?.company_id || 101);
}

async function logAdminAction(req, action, resourceType, resourceId, metadata = {}) {
  try {
    await ChatbotAuditLog.create({
      actor_id: req.user?.id || null,
      actor_role: req.user?.role || "admin",
      action,
      resource_type: resourceType,
      resource_id: String(resourceId || ""),
      ip_address: req.ip || null,
      metadata_json: metadata,
    });
  } catch {
    // non-blocking
  }
}

/* ─── Knowledge Base Management ──────────────────────────────────────────────── */

exports.listKnowledge = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { status, category } = req.query;
    const where = { company_id: companyId };
    if (status && status !== "all") where.status = status;
    if (category && category !== "all") where.category = category;

    const rows = await ChatbotKnowledgeBase.findAll({
      where,
      order: [["updated_at", "DESC"]],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.createKnowledge = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { slug, category, title, content_en, content_hi, keywords, source_ref, submitForApproval } = req.body || {};

    if (!title || !content_en) {
      return res.status(400).json({ success: false, error: "Title and English content are required." });
    }

    const cleanSlug =
      slug ||
      String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
        "-" +
        Date.now();

    const created = await ChatbotKnowledgeBase.create({
      company_id: companyId,
      slug: cleanSlug,
      category: category || "faq",
      title: String(title).trim(),
      content_en: String(content_en).trim(),
      content_hi: content_hi ? String(content_hi).trim() : null,
      keywords: keywords || null,
      source_ref: source_ref || "admin_portal",
      status: submitForApproval ? "pending_approval" : "draft",
      created_by: req.user?.id || null,
    });

    await logAdminAction(req, "kb_created", "chatbot_knowledge_base", created.id, { status: created.status });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateKnowledge = async (req, res) => {
  try {
    await syncChatbotModels();
    const { id } = req.params;
    const entry = await ChatbotKnowledgeBase.findByPk(id);
    if (!entry) {
      return res.status(404).json({ success: false, error: "Knowledge entry not found." });
    }

    const { title, category, content_en, content_hi, keywords, source_ref, submitForApproval } = req.body || {};

    await entry.update({
      ...(title !== undefined ? { title: String(title).trim() } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(content_en !== undefined ? { content_en: String(content_en).trim() } : {}),
      ...(content_hi !== undefined ? { content_hi: content_hi ? String(content_hi).trim() : null } : {}),
      ...(keywords !== undefined ? { keywords } : {}),
      ...(source_ref !== undefined ? { source_ref } : {}),
      // Any edit to an approved entry moves back to draft / pending_approval until explicitly approved
      status: submitForApproval ? "pending_approval" : "draft",
      version: Number(entry.version || 1) + 1,
      updated_at: new Date(),
    });

    await logAdminAction(req, "kb_updated", "chatbot_knowledge_base", entry.id, { version: entry.version });
    invalidateChatbotCache(entry.company_id);
    return res.status(200).json({ success: true, data: entry });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.approveKnowledge = async (req, res) => {
  try {
    await syncChatbotModels();
    const { id } = req.params;
    const entry = await ChatbotKnowledgeBase.findByPk(id);
    if (!entry) {
      return res.status(404).json({ success: false, error: "Knowledge entry not found." });
    }

    await entry.update({
      status: "approved",
      approved_by: req.user?.id || null,
      approved_at: new Date(),
      updated_at: new Date(),
    });

    const synced = await upsertKnowledgeVector({
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      content: entry.content_en,
      category: entry.category,
      status: "approved",
      companyId: entry.company_id,
      sourceRef: entry.source_ref,
    });

    if (synced) {
      await entry.update({ vector_synced_at: new Date() });
    }

    await logAdminAction(req, "kb_approved", "chatbot_knowledge_base", entry.id, { vectorSynced: synced });
    invalidateChatbotCache(entry.company_id);
    return res.status(200).json({ success: true, data: entry, vectorSynced: synced });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.archiveKnowledge = async (req, res) => {
  try {
    await syncChatbotModels();
    const { id } = req.params;
    const entry = await ChatbotKnowledgeBase.findByPk(id);
    if (!entry) {
      return res.status(404).json({ success: false, error: "Knowledge entry not found." });
    }

    await entry.update({ status: "archived", updated_at: new Date() });
    await deleteKnowledgeVector({ id: entry.id, slug: entry.slug });
    await logAdminAction(req, "kb_archived", "chatbot_knowledge_base", entry.id);
    invalidateChatbotCache(entry.company_id);

    return res.status(200).json({ success: true, message: "Entry archived and removed from vector store." });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* ─── Loan Product Catalog Management ────────────────────────────────────────── */

exports.listCatalog = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { status, category } = req.query;
    const where = { company_id: companyId };
    if (status && status !== "all") where.status = status;
    if (category && category !== "all") where.loan_category_slug = category;

    const rows = await LoanProductCatalog.findAll({
      where,
      order: [
        ["loan_category_slug", "ASC"],
        ["rate_min", "ASC"],
      ],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.upsertCatalogProduct = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const payload = req.body || {};

    if (id) {
      const existing = await LoanProductCatalog.findByPk(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Product not found." });
      }
      await existing.update({
        ...payload,
        status: payload.submitForApproval ? "pending_approval" : "draft",
        updated_at: new Date(),
      });
      await logAdminAction(req, "catalog_updated", "loan_product_catalog", existing.id);
      return res.status(200).json({ success: true, data: existing });
    }

    const slug =
      payload.product_slug ||
      `${String(payload.provider_name || "provider").toLowerCase().replace(/\s+/g, "-")}-${String(payload.loan_category_slug || "loan")}-${Date.now()}`;

    const created = await LoanProductCatalog.create({
      ...payload,
      company_id: companyId,
      product_slug: slug,
      status: payload.submitForApproval ? "pending_approval" : "draft",
      created_by: req.user?.id || null,
    });
    await logAdminAction(req, "catalog_created", "loan_product_catalog", created.id);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.approveCatalogProduct = async (req, res) => {
  try {
    await syncChatbotModels();
    const { id } = req.params;
    const prod = await LoanProductCatalog.findByPk(id);
    if (!prod) {
      return res.status(404).json({ success: false, error: "Product not found." });
    }
    await prod.update({
      status: "approved",
      approved_by: req.user?.id || null,
      approved_at: new Date(),
      updated_at: new Date(),
    });
    await logAdminAction(req, "catalog_approved", "loan_product_catalog", prod.id);
    invalidateChatbotCache(prod.company_id);
    return res.status(200).json({ success: true, data: prod });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* ─── Form Configurations Management ─────────────────────────────────────────── */

exports.listFormConfigs = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const configs = await LoanFormConfig.findAll({ where: { company_id: companyId } });
    return res.status(200).json({ success: true, data: configs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateFormConfig = async (req, res) => {
  try {
    await syncChatbotModels();
    const { loanType } = req.params;
    const cfg = await LoanFormConfig.findOne({ where: { loan_type: loanType } });
    if (!cfg) {
      return res.status(404).json({ success: false, error: "Form configuration not found." });
    }
    await cfg.update({
      ...req.body,
      approved_by: req.user?.id || null,
      updated_at: new Date(),
    });
    await logAdminAction(req, "form_config_updated", "loan_form_configurations", cfg.loan_type);
    invalidateChatbotCache(cfg.company_id);
    return res.status(200).json({ success: true, data: cfg });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* ─── Privacy-Preserving Chatbot Analytics Dashboard ─────────────────────────── */

exports.getAnalyticsSummary = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const days = Math.min(Number(req.query.days) || 30, 365);
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const summary = getEphemeralAnalyticsSummary(companyId, sinceDate);

    return res.status(200).json({
      success: true,
      periodDays: days,
      storageMode: summary.storageMode,
      kpis: summary.kpis,
      observability: {
        ...summary.observability,
        faqCacheStats: getCacheStats(),
      },
      charts: summary.charts,
    });
  } catch (err) {
    console.error("[ChatbotAdmin.analytics] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to load chatbot analytics." });
  }
};

/* ─── Role-Scoped Staff Lookup & Compliance Audit Logs (RBAC) ────────────────── */

exports.getStaffApplicationView = async (req, res) => {
  try {
    const role = req.user?.role;
    const { applicationNo, customerId } = req.query;
    const result = await lookupApplicationForStaff({
      role,
      viewerCustomerId: req.user?.id || null,
      applicationNo,
      customerId,
    });

    if (!result.allowed) {
      return res.status(403).json({ success: false, error: result.error });
    }

    if (result.found && result.auditRequired) {
      await logAdminAction(
        req,
        result.accessLevel === "full_kyc" ? "compliance_kyc_viewed" : "support_masked_record_viewed",
        "customer_application",
        result.application?.id || applicationNo || customerId,
        { accessLevel: result.accessLevel, role }
      );
    }

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    if (!hasPermission(req.user?.role, "audit:read")) {
      return res.status(403).json({ success: false, error: "Compliance or admin role required for audit logs." });
    }
    await syncChatbotModels();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await ChatbotAuditLog.findAll({
      order: [["created_at", "DESC"], ["id", "DESC"]],
      limit,
    });
    return res.status(200).json({ success: true, data: logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to load audit logs." });
  }
};

exports.getMcpTools = async (req, res) => {
  try {
    const tools = await listMcpToolDefinitions();
    return res.status(200).json({
      success: true,
      count: tools.length,
      data: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to list MCP tools." });
  }
};

exports.getTurnTraces = async (req, res) => {
  try {
    await syncChatbotModels();
    const companyId = getCompanyId(req);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const traces = await ChatbotTurnTrace.findAll({
      where: { company_id: companyId },
      order: [["created_at", "DESC"], ["id", "DESC"]],
      limit,
    });
    return res.status(200).json({ success: true, data: traces });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to load turn traces." });
  }
};

