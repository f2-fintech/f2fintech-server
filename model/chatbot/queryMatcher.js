/**
 * Shared Sequelize-Compatible In-Memory Filter, Sort & Limit Matcher
 * Reused by single-table store adapters and ephemeral RAM collections.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { Op } = require("sequelize");

function compareValues(a, b) {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

function matchCondition(val, cond) {
  if (cond === null || cond === undefined) {
    return val === null || val === undefined;
  }
  if (typeof cond !== "object" || cond instanceof Date) {
    return compareValues(val, cond);
  }

  for (const sym of Object.getOwnPropertySymbols(cond)) {
    const target = cond[sym];
    if (sym === Op.in) {
      const arr = Array.isArray(target) ? target : [];
      if (!arr.some((x) => compareValues(val, x))) return false;
    } else if (sym === Op.notIn) {
      const arr = Array.isArray(target) ? target : [];
      if (arr.some((x) => compareValues(val, x))) return false;
    } else if (sym === Op.ne) {
      if (target === null ? val === null || val === undefined : compareValues(val, target)) return false;
    } else if (sym === Op.gte) {
      const left = val instanceof Date ? val.getTime() : Number(val);
      const right = target instanceof Date ? target.getTime() : Number(target);
      if (!(left >= right)) return false;
    } else if (sym === Op.gt) {
      const left = val instanceof Date ? val.getTime() : Number(val);
      const right = target instanceof Date ? target.getTime() : Number(target);
      if (!(left > right)) return false;
    } else if (sym === Op.lte) {
      const left = val instanceof Date ? val.getTime() : Number(val);
      const right = target instanceof Date ? target.getTime() : Number(target);
      if (!(left <= right)) return false;
    } else if (sym === Op.lt) {
      const left = val instanceof Date ? val.getTime() : Number(val);
      const right = target instanceof Date ? target.getTime() : Number(target);
      if (!(left < right)) return false;
    } else if (sym === Op.like) {
      const pattern = String(target || "")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      if (!new RegExp(`^${pattern}$`, "i").test(String(val || ""))) return false;
    }
  }

  return true;
}

function matchesWhere(record, where = {}) {
  if (!where || typeof where !== "object") return true;

  for (const sym of Object.getOwnPropertySymbols(where)) {
    const sub = where[sym];
    if (sym === Op.or && Array.isArray(sub)) {
      if (!sub.some((clause) => matchesWhere(record, clause))) return false;
    } else if (sym === Op.and && Array.isArray(sub)) {
      if (!sub.every((clause) => matchesWhere(record, clause))) return false;
    }
  }

  for (const [key, expected] of Object.entries(where)) {
    if (!matchCondition(record?.[key], expected)) return false;
  }

  return true;
}

function applyOrderAndLimit(items, { order = null, limit = null, attributes = null } = {}) {
  let result = [...items];

  if (Array.isArray(order) && order.length > 0) {
    result.sort((a, b) => {
      for (const spec of order) {
        if (!Array.isArray(spec) || typeof spec[0] !== "string") continue;
        const field = spec[0];
        const dir = String(spec[1] || "ASC").toUpperCase() === "DESC" ? -1 : 1;
        const va = a?.[field];
        const vb = b?.[field];
        if (va == null && vb == null) continue;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (va instanceof Date || vb instanceof Date) {
          const cmp = new Date(va).getTime() - new Date(vb).getTime();
          if (cmp !== 0) return cmp * dir;
        } else if (typeof va === "number" && typeof vb === "number") {
          if (va !== vb) return (va - vb) * dir;
        } else if (!Number.isNaN(Number(va)) && !Number.isNaN(Number(vb)) && String(va).trim() !== "" && String(vb).trim() !== "") {
          const cmp = Number(va) - Number(vb);
          if (cmp !== 0) return cmp * dir;
        } else {
          const cmp = String(va).localeCompare(String(vb));
          if (cmp !== 0) return cmp * dir;
        }
      }
      return 0;
    });
  }

  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    result = result.slice(0, Number(limit));
  }

  if (Array.isArray(attributes) && attributes.length > 0) {
    result = result.map((row) => {
      const picked = {};
      for (const attr of attributes) {
        if (typeof attr === "string") {
          picked[attr] = row[attr];
        }
      }
      return picked;
    });
  }

  return result;
}

module.exports = {
  matchesWhere,
  applyOrderAndLimit,
};

