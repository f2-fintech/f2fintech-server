/**
 * Authentication Guard Middleware
 * Supports session, JWT (x-access-token / Bearer), and Firebase ID tokens.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const jwt = require("jsonwebtoken");
const config = require("../config");
const CustomerModel = require("../model/customer");
let firebaseAdmin = null;

try {
  const admin = require("firebase-admin");
  if (admin.apps && admin.apps.length > 0) {
    firebaseAdmin = admin;
  }
} catch (e) {
  // firebase-admin not initialized yet
}

/**
 * Extracts and verifies token from request headers
 */
async function verifyUserToken(req) {
  // 1. Check Passport session
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return { authenticated: true, user: req.user, source: "session" };
  }

  // 2. Check x-access-token header (custom JWT)
  const xAccessToken = req.headers["x-access-token"];
  if (xAccessToken) {
    try {
      const decoded = jwt.verify(xAccessToken, config.SECRET || "secret_key");
      return { authenticated: true, user: decoded, source: "jwt" };
    } catch (err) {
      // Invalid JWT
      return { authenticated: false, error: "Invalid x-access-token" };
    }
  }

  // 3. Check Authorization header: Bearer <token>
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    // Try verifying as JWT first
    try {
      const decoded = jwt.verify(token, config.SECRET || "secret_key");
      return { authenticated: true, user: decoded, source: "jwt_bearer" };
    } catch (jwtErr) {
      // Try verifying with Firebase Admin if available
      if (firebaseAdmin) {
        try {
          const decodedFirebase = await firebaseAdmin.auth().verifyIdToken(token);
          return { authenticated: true, user: decodedFirebase, source: "firebase" };
        } catch (fbErr) {
          return { authenticated: false, error: "Invalid Bearer token" };
        }
      }
      return { authenticated: false, error: "Invalid Bearer token" };
    }
  }

  return { authenticated: false };
}

/**
 * Strict authentication guard: rejects with 401 if unauthenticated
 */
const requireAuth = async (req, res, next) => {
  try {
    const authResult = await verifyUserToken(req);
    if (authResult.authenticated) {
      req.user = authResult.user;
      return next();
    }
    return res.status(401).json({
      success: false,
      error: "Authentication required to access this endpoint.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Authentication service error.",
    });
  }
};

/**
 * Optional authentication guard: attaches user if present, allows guest through
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authResult = await verifyUserToken(req);
    if (authResult.authenticated) {
      req.user = authResult.user;
    } else {
      req.user = null;
    }
    return next();
  } catch (err) {
    req.user = null;
    return next();
  }
};

/**
 * Role-based authorization factory: verifies token and checks DB role against allowedRoles.
 */
const requireRoles = (allowedRoles = ["admin"]) => {
  const normalizedAllowed = new Set(allowedRoles.map((r) => String(r).toLowerCase().trim()));
  return async (req, res, next) => {
    try {
      const authResult = await verifyUserToken(req);
      if (!authResult.authenticated || !authResult.user) {
        return res.status(401).json({
          success: false,
          error: "Authentication required for authorized access.",
        });
      }

      const userId = authResult.user.id;
      let role = authResult.user.role;
      if (userId) {
        const dbUser = await CustomerModel.findByPk(userId, {
          attributes: ["id", "role", "status", "company_id"],
        });
        if (!dbUser || dbUser.status === "inactive") {
          return res.status(403).json({
            success: false,
            error: "Account is inactive or not authorized.",
          });
        }
        role = dbUser.role;
        req.user = {
          ...authResult.user,
          id: dbUser.id,
          role: dbUser.role,
          company_id: dbUser.company_id,
        };
      }

      const cleanRole = String(role || "").toLowerCase().trim();
      if (!normalizedAllowed.has(cleanRole)) {
        return res.status(403).json({
          success: false,
          error: `Role privileges (${Array.from(normalizedAllowed).join(", ")}) required.`,
        });
      }

      return next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "Authorization check failed.",
      });
    }
  };
};

const requireAdmin = requireRoles(["admin"]);
const requireComplianceOrAdmin = requireRoles(["compliance_officer", "admin"]);
const requireStaffRole = requireRoles(["support_agent", "compliance_officer", "admin"]);

module.exports = {
  requireAuth,
  optionalAuth,
  requireRoles,
  requireAdmin,
  requireComplianceOrAdmin,
  requireStaffRole,
  verifyUserToken,
};

