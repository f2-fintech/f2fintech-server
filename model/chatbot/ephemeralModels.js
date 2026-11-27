/**
 * Ephemeral In-Memory Models (Zero MySQL Storage for Chats, Sessions, Drafts & Telemetry)
 * Keeps active conversations, OTP session flags, drafts, analytics counters, audit logs,
 * and LLM turn traces strictly in Node process RAM with automatic TTL eviction & bounded buffers.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const crypto = require("crypto");
const { matchesWhere, applyOrderAndLimit } = require("./queryMatcher");

const SESSION_IDLE_TTL_MS = Number(process.env.CHATBOT_SESSION_TTL_MS) || 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 2000;
const MAX_MESSAGES_PER_SESSION = 50;
const MAX_EVENTS = 2000;
const MAX_TRACES = 1000;
const MAX_AUDITS = 500;

const sessionsMap = new Map();
const messagesList = [];
const draftsMap = new Map();
const analyticsEventsList = [];
const auditLogsList = [];
const turnTracesList = [];

let msgSeq = 1;
let evtSeq = 1;
let auditSeq = 1;
let traceSeq = 1;

function pruneExpiredSessions() {
  const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
  for (const [sid, s] of sessionsMap.entries()) {
    const lastTs = s.last_active_at ? new Date(s.last_active_at).getTime() : 0;
    if (lastTs < cutoff) {
      sessionsMap.delete(sid);
      draftsMap.forEach((d, did) => {
        if (d.session_id === sid) draftsMap.delete(did);
      });
      for (let i = messagesList.length - 1; i >= 0; i--) {
        if (messagesList[i].session_id === sid) messagesList.splice(i, 1);
      }
    }
  }
}

const cleanupTimer = setInterval(pruneExpiredSessions, 10 * 60 * 1000);
if (typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}

function attachInstanceMethods(obj, onDestroy) {
  Object.defineProperty(obj, "update", {
    enumerable: false,
    value: async function update(patch = {}) {
      Object.assign(obj, patch);
      return obj;
    },
  });
  Object.defineProperty(obj, "destroy", {
    enumerable: false,
    value: async function destroy() {
      if (onDestroy) onDestroy(obj);
    },
  });
  return obj;
}

const ChatbotSession = {
  async findByPk(id) {
    if (!id) return null;
    return sessionsMap.get(String(id)) || null;
  },
  async findOne(options = {}) {
    const list = await this.findAll({ ...options, limit: 1 });
    return list[0] || null;
  },
  async findAll(options = {}) {
    const filtered = Array.from(sessionsMap.values()).filter((s) => matchesWhere(s, options.where || {}));
    return applyOrderAndLimit(filtered, options);
  },
  async create(values = {}) {
    if (sessionsMap.size >= MAX_SESSIONS) {
      const oldestKey = sessionsMap.keys().next().value;
      if (oldestKey) sessionsMap.delete(oldestKey);
    }
    const id = String(values.id || crypto.randomUUID());
    const now = new Date();
    const rec = attachInstanceMethods(
      {
        id,
        company_id: Number(values.company_id || 101),
        customer_id: values.customer_id ?? null,
        guest_token_hash: values.guest_token_hash ?? null,
        language: values.language === "hi" ? "hi" : "en",
        active_intent: values.active_intent || "general",
        context_json: values.context_json || {},
        verified_contact: values.verified_contact ?? null,
        verified_email: values.verified_email ?? null,
        otp_verified_at: values.otp_verified_at ?? null,
        status: values.status || "active",
        last_active_at: values.last_active_at || now,
        created_at: values.created_at || now,
      },
      (item) => sessionsMap.delete(item.id)
    );
    sessionsMap.set(id, rec);
    return rec;
  },
  async update(patch = {}, options = {}) {
    const targets = await this.findAll({ where: options.where || {} });
    for (const s of targets) {
      await s.update(patch);
    }
    return [targets.length];
  },
  async count(options = {}) {
    const matched = await this.findAll({ where: options.where || {} });
    if (options.distinct && options.col) {
      return new Set(matched.map((r) => r[options.col]).filter((v) => v !== null && v !== undefined)).size;
    }
    return matched.length;
  },
  async destroy(options = {}) {
    const matched = await this.findAll({ where: options.where || {} });
    for (const m of matched) {
      sessionsMap.delete(m.id);
    }
    return matched.length;
  },
};

const ChatbotMessage = {
  async findByPk(id) {
    return messagesList.find((m) => Number(m.id) === Number(id)) || null;
  },
  async findAll(options = {}) {
    const filtered = messagesList.filter((m) => matchesWhere(m, options.where || {}));
    return applyOrderAndLimit(filtered, options);
  },
  async create(values = {}) {
    const rec = attachInstanceMethods(
      {
        id: msgSeq++,
        session_id: String(values.session_id || ""),
        sender: values.sender || "assistant",
        message_text: String(values.message_text || ""),
        structured_payload_json: values.structured_payload_json ?? null,
        language: values.language === "hi" ? "hi" : "en",
        intent: values.intent ?? null,
        feedback_rating: values.feedback_rating ?? null,
        feedback_comment: values.feedback_comment ?? null,
        created_at: values.created_at || new Date(),
      },
      (item) => {
        const idx = messagesList.indexOf(item);
        if (idx !== -1) messagesList.splice(idx, 1);
      }
    );
    messagesList.push(rec);

    // Enforce bounded per-session ring cap in RAM so memory never grows unbounded
    const sessionMsgs = messagesList.filter((m) => m.session_id === rec.session_id);
    if (sessionMsgs.length > MAX_MESSAGES_PER_SESSION) {
      const toRemove = sessionMsgs[0];
      const idx = messagesList.indexOf(toRemove);
      if (idx !== -1) messagesList.splice(idx, 1);
    }
    return rec;
  },
  async update(patch = {}, options = {}) {
    const targets = await this.findAll({ where: options.where || {} });
    for (const m of targets) {
      await m.update(patch);
    }
    return [targets.length];
  },
  async destroy(options = {}) {
    const targets = await this.findAll({ where: options.where || {} });
    for (const m of targets) {
      const idx = messagesList.indexOf(m);
      if (idx !== -1) messagesList.splice(idx, 1);
    }
    return targets.length;
  },
};

const ChatbotApplicationDraft = {
  async findByPk(id) {
    return id ? draftsMap.get(String(id)) || null : null;
  },
  async findAll(options = {}) {
    const filtered = Array.from(draftsMap.values()).filter((d) => matchesWhere(d, options.where || {}));
    return applyOrderAndLimit(filtered, options);
  },
  async findOne(options = {}) {
    const list = await this.findAll({ ...options, limit: 1 });
    return list[0] || null;
  },
  async create(values = {}) {
    if (draftsMap.size >= MAX_SESSIONS) {
      const oldestKey = draftsMap.keys().next().value;
      if (oldestKey) draftsMap.delete(oldestKey);
    }
    const id = String(values.id || crypto.randomUUID());
    const now = new Date();
    const rec = attachInstanceMethods(
      {
        id,
        session_id: String(values.session_id || ""),
        company_id: Number(values.company_id || 101),
        customer_id: values.customer_id ?? null,
        loan_type: values.loan_type ?? null,
        loan_category: values.loan_category ?? null,
        current_step: values.current_step || "category",
        form_data_encrypted: values.form_data_encrypted ?? null,
        uploaded_docs_json: Array.isArray(values.uploaded_docs_json) ? values.uploaded_docs_json : [],
        submitted_application_ids_json: values.submitted_application_ids_json ?? null,
        idempotency_key: values.idempotency_key ?? null,
        status: values.status || "in_progress",
        expires_at: values.expires_at || new Date(Date.now() + SESSION_IDLE_TTL_MS),
        created_at: values.created_at || now,
        updated_at: values.updated_at || now,
      },
      (item) => draftsMap.delete(item.id)
    );
    draftsMap.set(id, rec);
    return rec;
  },
  async destroy(options = {}) {
    const targets = await this.findAll({ where: options.where || {} });
    for (const t of targets) draftsMap.delete(t.id);
    return targets.length;
  },
};

function createRingBufferModel(list, seqRef, maxCap, mapper) {
  return {
    async create(values = {}) {
      if (list.length >= maxCap) {
        list.shift();
      }
      const item = mapper(values, seqRef.next());
      list.push(item);
      return item;
    },
    async findAll(options = {}) {
      const filtered = list.filter((row) => matchesWhere(row, options.where || {}));
      return applyOrderAndLimit(filtered, options);
    },
    async count(options = {}) {
      const filtered = list.filter((row) => matchesWhere(row, options.where || {}));
      return filtered.length;
    },
    async destroy(options = {}) {
      const targets = list.filter((row) => matchesWhere(row, options.where || {}));
      for (const t of targets) {
        const idx = list.indexOf(t);
        if (idx !== -1) list.splice(idx, 1);
      }
      return targets.length;
    },
  };
}

const ChatbotAnalyticsEvent = createRingBufferModel(
  analyticsEventsList,
  { next: () => evtSeq++ },
  MAX_EVENTS,
  (v, id) => ({
    id,
    company_id: Number(v.company_id || 101),
    session_id: v.session_id || null,
    event_type: v.event_type,
    loan_category: v.loan_category || null,
    provider_names_json: v.provider_names_json || [],
    topic_tag: v.topic_tag || null,
    rating: v.rating ?? null,
    created_at: v.created_at || new Date(),
  })
);

const ChatbotAuditLog = createRingBufferModel(
  auditLogsList,
  { next: () => auditSeq++ },
  MAX_AUDITS,
  (v, id) => {
    const entry = {
      id,
      actor_id: v.actor_id ?? null,
      actor_role: v.actor_role || "system",
      action: v.action,
      resource_type: v.resource_type || null,
      resource_id: v.resource_id || null,
      ip_address: v.ip_address || null,
      metadata_json: v.metadata_json || {},
      created_at: v.created_at || new Date(),
    };
    if (process.env.CHATBOT_AUDIT_STDOUT !== "false") {
      console.info("[ChatbotAudit]", JSON.stringify({ action: entry.action, role: entry.actor_role, resource: entry.resource_type, id: entry.resource_id }));
    }
    return entry;
  }
);

const ChatbotTurnTrace = createRingBufferModel(
  turnTracesList,
  { next: () => traceSeq++ },
  MAX_TRACES,
  (v, id) => ({
    id,
    company_id: Number(v.company_id || 101),
    session_id: String(v.session_id || ""),
    message_id: v.message_id ?? null,
    actor_role: v.actor_role || "guest",
    intent: v.intent || null,
    routing_tier: v.routing_tier || "small",
    model_used: v.model_used || null,
    cache_hit: Boolean(v.cache_hit),
    prompt_tokens: Number(v.prompt_tokens || 0),
    completion_tokens: Number(v.completion_tokens || 0),
    total_tokens: Number(v.total_tokens || 0),
    estimated_cost_usd: Number(v.estimated_cost_usd || 0),
    latency_ms: Number(v.latency_ms || 0),
    tools_called_json: Array.isArray(v.tools_called_json) ? v.tools_called_json : [],
    guardrail_flags_json: Array.isArray(v.guardrail_flags_json) ? v.guardrail_flags_json : [],
    created_at: v.created_at || new Date(),
  })
);

/**
 * Compute admin dashboard KPIs, charts & LLM observability from ephemeral ring buffers (zero MySQL reads).
 */
function getEphemeralAnalyticsSummary(companyId = 101, sinceDate = new Date(0)) {
  const cid = Number(companyId);
  const sinceTs = sinceDate.getTime();

  const recentSessions = Array.from(sessionsMap.values()).filter(
    (s) => Number(s.company_id) === cid && new Date(s.created_at).getTime() >= sinceTs
  );
  const recentEvents = analyticsEventsList.filter(
    (e) => Number(e.company_id) === cid && new Date(e.created_at).getTime() >= sinceTs
  );
  const recentTraces = turnTracesList.filter(
    (t) => Number(t.company_id) === cid && new Date(t.created_at).getTime() >= sinceTs
  );

  const eventMap = {};
  const categoryMap = {};
  const faqTopicMap = {};
  const unresolvedMap = {};
  const providerCompareCounts = {};
  let positiveCount = 0;
  let negativeCount = 0;

  for (const evt of recentEvents) {
    eventMap[evt.event_type] = (eventMap[evt.event_type] || 0) + 1;
    if (evt.loan_category) {
      categoryMap[evt.loan_category] = (categoryMap[evt.loan_category] || 0) + 1;
    }
    if (evt.event_type === "faq_asked" && evt.topic_tag) {
      faqTopicMap[evt.topic_tag] = (faqTopicMap[evt.topic_tag] || 0) + 1;
    }
    if (evt.event_type === "unresolved_query" && evt.topic_tag) {
      unresolvedMap[evt.topic_tag] = (unresolvedMap[evt.topic_tag] || 0) + 1;
    }
    if (evt.event_type === "feedback_submitted") {
      if (Number(evt.rating) === 1) positiveCount += 1;
      else if (Number(evt.rating) === -1) negativeCount += 1;
    }
    if (evt.event_type === "comparison_run" && Array.isArray(evt.provider_names_json)) {
      for (const p of evt.provider_names_json) {
        providerCompareCounts[p] = (providerCompareCounts[p] || 0) + 1;
      }
    }
  }

  let totalLatencyMs = 0;
  let cacheHits = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;
  let guardrailTriggeredCount = 0;
  const routingBreakdown = {};
  const modelBreakdown = {};

  for (const tr of recentTraces) {
    totalLatencyMs += tr.latency_ms;
    if (tr.cache_hit) cacheHits += 1;
    totalPromptTokens += tr.prompt_tokens;
    totalCompletionTokens += tr.completion_tokens;
    totalTokens += tr.total_tokens;
    estimatedCostUsd += tr.estimated_cost_usd;
    routingBreakdown[tr.routing_tier] = (routingBreakdown[tr.routing_tier] || 0) + 1;
    const mKey = tr.model_used || "unknown";
    if (!modelBreakdown[mKey]) modelBreakdown[mKey] = { count: 0, totalTokens: 0 };
    modelBreakdown[mKey].count += 1;
    modelBreakdown[mKey].totalTokens += tr.total_tokens;
    if (tr.guardrail_flags_json.length > 0) guardrailTriggeredCount += 1;
  }

  const totalFeedback = positiveCount + negativeCount;
  const totalTraces = recentTraces.length;
  const toSortedPairs = (obj, kName) =>
    Object.entries(obj)
      .map(([k, count]) => ({ [kName]: k, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

  return {
    storageMode: "ephemeral_in_memory_zero_chat_persistence",
    kpis: {
      totalConversations: recentSessions.length,
      uniqueAuthenticatedUsers: new Set(
        recentSessions.map((s) => s.customer_id).filter((id) => id !== null && id !== undefined)
      ).size,
      comparisonsRun: eventMap.comparison_run || 0,
      recommendationsGenerated: eventMap.recommendation_run || 0,
      emiCalculations: eventMap.emi_calculated || 0,
      applicationsInitiated: eventMap.app_started || 0,
      applicationsCompleted: eventMap.app_completed || 0,
      applicationsAbandoned: Math.max(0, (eventMap.app_started || 0) - (eventMap.app_completed || 0)),
      documentUploadFailures: eventMap.doc_upload_failed || 0,
      unresolvedQueriesCount: eventMap.unresolved_query || 0,
      supportEscalations: eventMap.support_escalated || 0,
      csatPositivePercent: totalFeedback > 0 ? Math.round((positiveCount / totalFeedback) * 100) : null,
      totalFeedback,
    },
    observability: {
      totalTraces,
      avgLatencyMs: totalTraces > 0 ? Math.round(totalLatencyMs / totalTraces) : 0,
      cacheHitRatePercent: totalTraces > 0 ? Math.round((cacheHits / totalTraces) * 100) : 0,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
      guardrailTriggeredCount,
      routingBreakdown,
      modelUsage: Object.entries(modelBreakdown).map(([model, stats]) => ({
        model,
        count: stats.count,
        totalTokens: stats.totalTokens,
      })),
    },
    charts: {
      loanCategoriesExplored: toSortedPairs(categoryMap, "category"),
      providerComparisons: toSortedPairs(providerCompareCounts, "provider"),
      frequentlyAskedTopics: toSortedPairs(faqTopicMap, "topic"),
      unresolvedTopics: toSortedPairs(unresolvedMap, "topic"),
    },
  };
}

module.exports = {
  ChatbotSession,
  ChatbotMessage,
  ChatbotApplicationDraft,
  ChatbotAnalyticsEvent,
  ChatbotAuditLog,
  ChatbotTurnTrace,
  getEphemeralAnalyticsSummary,
};

