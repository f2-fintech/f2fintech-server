/**
 * Sequelize JSON Column Helper (MySQL 8 & XAMPP MariaDB Compatible)
 * MariaDB stores JSON as LONGTEXT and returns strings via mysql2; this getter
 * transparently parses stringified JSON into JS objects/arrays everywhere.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const Sequelize = require("sequelize");

function safeParseJson(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function jsonColumn(fieldName, { allowNull = true, defaultValue = undefined, fallback = null } = {}) {
  const def = {
    type: Sequelize.JSON,
    allowNull,
    get() {
      return safeParseJson(this.getDataValue(fieldName), fallback);
    },
  };
  if (defaultValue !== undefined) {
    def.defaultValue = defaultValue;
  }
  return def;
}

module.exports = {
  safeParseJson,
  jsonColumn,
};

