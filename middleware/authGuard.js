/**
 * Authentication Guard Middleware
 * Supports session, JWT (x-access-token / Bearer), and Firebase ID tokens.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const jwt = require("jsonwebtoken");
const config = require("../config");
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

module.exports = {
  requireAuth,
  optionalAuth,
  verifyUserToken,
};

