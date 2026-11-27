/**
 * Store Adapters Over Single `chatbot_store` MySQL Table
 * Exposes Sequelize-compatible repository methods for `ChatbotKnowledgeBase`,
 * `LoanProductCatalog`, and `LoanFormConfig` backed exclusively by `chatbot_store`.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const ChatbotStore = require("./chatbotStore");
const { safeParseJson } = require("./jsonColumn");
const { matchesWhere, applyOrderAndLimit } = require("./queryMatcher");

const CONFIGS = {
  kb: {
    recordType: "kb",
    keyField: "slug",
    categoryField: "category",
    titleField: "title",
    keywordsField: "keywords",
    defaultCategory: "faq",
    defaultStatus: "draft",
  },
  catalog: {
    recordType: "catalog",
    keyField: "product_slug",
    categoryField: "loan_category_slug",
    titleField: "provider_name",
    keywordsField: null,
    defaultCategory: "general",
    defaultStatus: "approved",
  },
  form_config: {
    recordType: "form_config",
    keyField: "loan_type",
    categoryField: "loan_category",
    titleField: "display_name",
    keywordsField: null,
    defaultCategory: "unsecured",
    defaultStatus: "approved",
  },
};

function createStoreAdapter(cfg) {
  function hydrate(storeRow) {
    if (!storeRow) return null;
    const payload = safeParseJson(storeRow.payload_json, {});
    const obj = {
      ...payload,
      id: storeRow.id,
      company_id: storeRow.company_id,
      [cfg.keyField]: storeRow.record_key,
      [cfg.categoryField]: storeRow.category,
      [cfg.titleField]: storeRow.title,
      ...(cfg.keywordsField ? { [cfg.keywordsField]: storeRow.keywords } : {}),
      status: storeRow.status,
      created_at: storeRow.created_at,
      updated_at: storeRow.updated_at,
    };

    Object.defineProperty(obj, "update", {
      enumerable: false,
      value: async function update(patch = {}) {
        const nextMerged = { ...obj, ...patch, updated_at: new Date() };
        const serialized = toStoreFields(nextMerged);
        await storeRow.update(serialized);
        Object.assign(obj, {
          ...serialized.payload_json,
          id: storeRow.id,
          company_id: serialized.company_id,
          [cfg.keyField]: serialized.record_key,
          [cfg.categoryField]: serialized.category,
          [cfg.titleField]: serialized.title,
          ...(cfg.keywordsField ? { [cfg.keywordsField]: serialized.keywords } : {}),
          status: serialized.status,
          updated_at: serialized.updated_at,
        });
        return obj;
      },
    });

    Object.defineProperty(obj, "destroy", {
      enumerable: false,
      value: async function destroy() {
        await storeRow.destroy();
      },
    });

    return obj;
  }

  function toStoreFields(input = {}) {
    const clean = { ...input };
    const companyId = Number(clean.company_id || 101);
    const recordKey = String(clean[cfg.keyField] || clean.record_key || `${cfg.recordType}-${Date.now()}`).trim();
    const category = clean[cfg.categoryField] ?? clean.category ?? cfg.defaultCategory;
    const title = String(clean[cfg.titleField] ?? clean.title ?? recordKey).trim();
    const keywords = cfg.keywordsField ? clean[cfg.keywordsField] ?? null : null;
    const status = String(clean.status || cfg.defaultStatus);
    const now = new Date();

    const payload = { ...clean };
    delete payload.id;
    delete payload.update;
    delete payload.destroy;
    delete payload.company_id;
    delete payload[cfg.keyField];
    delete payload[cfg.categoryField];
    delete payload[cfg.titleField];
    if (cfg.keywordsField) delete payload[cfg.keywordsField];
    delete payload.status;
    delete payload.created_at;
    delete payload.updated_at;

    return {
      company_id: companyId,
      record_type: cfg.recordType,
      record_key: recordKey,
      category: category !== undefined ? String(category) : null,
      title,
      keywords,
      status,
      payload_json: payload,
      updated_at: clean.updated_at || now,
    };
  }

  return {
    async findAll(options = {}) {
      const baseWhere = { record_type: cfg.recordType };
      if (options.where?.company_id !== undefined && typeof options.where.company_id !== "object") {
        baseWhere.company_id = Number(options.where.company_id);
      }
      if (options.where?.status !== undefined && typeof options.where.status !== "object") {
        baseWhere.status = String(options.where.status);
      }

      const rawRows = await ChatbotStore.findAll({ where: baseWhere });
      const hydrated = rawRows.map(hydrate);
      const filtered = hydrated.filter((item) => matchesWhere(item, options.where || {}));
      return applyOrderAndLimit(filtered, {
        order: options.order,
        limit: options.limit,
        attributes: options.attributes,
      });
    },

    async findOne(options = {}) {
      const list = await this.findAll({ ...options, limit: 1 });
      return list[0] || null;
    },

    async findByPk(id) {
      if (!id) return null;
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) return null;
      const storeRow = await ChatbotStore.findOne({
        where: { id: numericId, record_type: cfg.recordType },
      });
      return hydrate(storeRow);
    },

    async create(values = {}) {
      const fields = toStoreFields(values);
      const created = await ChatbotStore.create({
        ...fields,
        created_at: values.created_at || new Date(),
      });
      return hydrate(created);
    },

    async upsert(values = {}) {
      const fields = toStoreFields(values);
      const existing = await ChatbotStore.findOne({
        where: {
          company_id: fields.company_id,
          record_type: cfg.recordType,
          record_key: fields.record_key,
        },
      });

      if (existing) {
        await existing.update(fields);
        return [hydrate(existing), false];
      }

      const created = await ChatbotStore.create({
        ...fields,
        created_at: values.created_at || new Date(),
      });
      return [hydrate(created), true];
    },

    async destroy(options = {}) {
      const matches = await this.findAll({ where: options.where || {} });
      for (const m of matches) {
        await m.destroy();
      }
      return matches.length;
    },
  };
}

module.exports = {
  ChatbotKnowledgeBase: createStoreAdapter(CONFIGS.kb),
  LoanProductCatalog: createStoreAdapter(CONFIGS.catalog),
  LoanFormConfig: createStoreAdapter(CONFIGS.form_config),
};

