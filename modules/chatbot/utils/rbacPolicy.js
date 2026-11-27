/**
 * Role-Based Access Control (RBAC) Policy & PII Field Projection
 * Enforces least-privilege access across customer, support_agent, compliance_officer, and admin roles.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { maskPan, maskContact, maskEmail } = require("./piiCrypto");

const ROLES = Object.freeze({
  GUEST: "guest",
  CUSTOMER: "customer",
  MARKETING_AGENT: "marketing_agent",
  SUPPORT_AGENT: "support_agent",
  COMPLIANCE_OFFICER: "compliance_officer",
  ADMIN: "admin",
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.GUEST]: ["kb:read", "catalog:read", "calculator:use", "application:draft_own"],
  [ROLES.CUSTOMER]: [
    "kb:read",
    "catalog:read",
    "calculator:use",
    "application:draft_own",
    "application:read_own",
    "application:upload_own",
    "support:escalate",
  ],
  [ROLES.MARKETING_AGENT]: [
    "kb:read",
    "catalog:read",
    "calculator:use",
    "application:draft_own",
    "application:read_own",
    "application:upload_own",
    "support:escalate",
  ],
  [ROLES.SUPPORT_AGENT]: [
    "kb:read",
    "catalog:read",
    "application:read_masked",
    "ticket:read",
    "support:escalate",
  ],
  [ROLES.COMPLIANCE_OFFICER]: [
    "kb:read",
    "catalog:read",
    "application:read_full_kyc",
    "ticket:read",
    "audit:read",
    "analytics:read",
    "kb:review",
  ],
  [ROLES.ADMIN]: ["*"],
});

/**
 * Resolve normalized caller RBAC context from JWT/Passport req.user and verified OTP session.
 */
function resolveActorContext(req, session = null) {
  const userRoleRaw = req?.user?.role ? String(req.user.role).toLowerCase().trim() : "";
  const hasOtpVerifiedCustomer = Boolean(session && session.customer_id && session.otp_verified_at);

  let role = ROLES.GUEST;
  let customerId = null;

  if (req?.user?.id && Object.values(ROLES).includes(userRoleRaw)) {
    role = userRoleRaw;
    customerId = Number(req.user.id);
  } else if (hasOtpVerifiedCustomer) {
    role = ROLES.CUSTOMER;
    customerId = Number(session.customer_id);
  }

  return {
    actorId: customerId,
    role,
    permissions: ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.GUEST],
    isStaff: [ROLES.SUPPORT_AGENT, ROLES.COMPLIANCE_OFFICER, ROLES.ADMIN].includes(role),
  };
}

function hasPermission(role, permission) {
  const normalized = String(role || ROLES.GUEST).toLowerCase().trim();
  const perms = ROLE_PERMISSIONS[normalized] || [];
  return perms.includes("*") || perms.includes(permission);
}

/**
 * Assert whether a role can access the target record and project fields with role-appropriate PII masking.
 */
function projectCustomerRecordByRole({
  role,
  viewerCustomerId = null,
  ownerCustomerId = null,
  customer = {},
  customerInfo = {},
  application = {},
  documents = [],
}) {
  const normalizedRole = String(role || ROLES.GUEST).toLowerCase().trim();
  const sameOwner =
    viewerCustomerId && ownerCustomerId && Number(viewerCustomerId) === Number(ownerCustomerId);

  if (normalizedRole === ROLES.COMPLIANCE_OFFICER || normalizedRole === ROLES.ADMIN) {
    return {
      allowed: true,
      accessLevel: "full_kyc",
      auditRequired: true,
      applicant: {
        customerId: ownerCustomerId ? Number(ownerCustomerId) : null,
        name: customer.name || null,
        contact: customer.contact || null,
        email: customer.email || null,
        pan: customerInfo.pan || null,
        dob: customerInfo.dob || customer.dob || null,
        currentAddress: customerInfo.current_address || null,
        permanentAddress: customerInfo.permanent_address || null,
      },
      application,
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        customerApplicationId: d.customer_application_id || null,
        document_url: d.document_url || null,
      })),
    };
  }

  if (normalizedRole === ROLES.SUPPORT_AGENT) {
    return {
      allowed: true,
      accessLevel: "masked_support",
      auditRequired: true,
      applicant: {
        customerId: ownerCustomerId ? Number(ownerCustomerId) : null,
        name: customer.name || null,
        contactMasked: maskContact(customer.contact),
        emailMasked: maskEmail(customer.email),
        panMasked: maskPan(customerInfo.pan),
      },
      application,
      // Support agents see document types uploaded without raw KYC file download URLs
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        customerApplicationId: d.customer_application_id || null,
        uploaded: true,
      })),
    };
  }

  if ((normalizedRole === ROLES.CUSTOMER || normalizedRole === ROLES.MARKETING_AGENT) && sameOwner) {
    return {
      allowed: true,
      accessLevel: "owner_self",
      auditRequired: false,
      applicant: {
        customerId: Number(ownerCustomerId),
        name: customer.name || null,
        contactMasked: maskContact(customer.contact),
        emailMasked: maskEmail(customer.email),
        panMasked: maskPan(customerInfo.pan),
      },
      application,
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        customerApplicationId: d.customer_application_id || null,
        uploaded: true,
      })),
    };
  }

  return {
    allowed: false,
    accessLevel: "denied",
    error: "Access denied: insufficient permissions to view this customer record.",
  };
}

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
  resolveActorContext,
  hasPermission,
  projectCustomerRecordByRole,
};

