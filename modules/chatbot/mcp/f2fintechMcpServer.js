/**
 * Standardized F2Fintech Model Context Protocol (MCP) Server & Client Adapter
 * Exposes all F2Fintech live DB, catalog, bureau/card, ATS, and support tools over MCP
 * with strict zod schemas and RBAC actor enforcement.
 * Copyright © 2024-2026, F2FINTECH. ALL RIGHTS RESERVED.
 */

const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");
const { ChatbotAnalyticsEvent } = require("../../../model/chatbot");
const {
  retrieveVerifiedKnowledge,
  getActiveCareerOpenings,
  getCreditCardAdvisorData,
  getFormConfiguration,
} = require("../services/knowledge.service");
const { calculateRepaymentDetails } = require("../services/repayment.service");
const { compareLoanProducts } = require("../services/comparison.service");
const { recommendLoans } = require("../services/recommendation.service");
const {
  getOrCreateDraft,
  evaluateDraftProgress,
  updateApplicationDraft,
  buildReviewSummary,
} = require("../services/applicationOrchestrator.service");
const {
  getCustomerApplicationStatus,
  lookupApplicationForStaff,
  escalateSupportIssue,
} = require("../services/support.service");
const { resolveActorContext, hasPermission } = require("../utils/rbacPolicy");

function mcpPack(result, uiPayloads = [], analyticsEvents = []) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          result,
          _uiPayloads: uiPayloads,
          _analyticsEvents: analyticsEvents,
        }),
      },
    ],
  };
}

/**
 * Create an RBAC-aware F2Fintech MCP Server bound to the active turn context.
 */
function createF2FintechMcpServer(runtimeCtx = {}) {
  const {
    session = null,
    authorizedCustomerId = null,
    companyId = 101,
    language = "en",
    userMessage = "",
  } = runtimeCtx;

  const actorContext = runtimeCtx.actorContext || resolveActorContext(null, session);
  const server = new McpServer({
    name: "f2fintech-mcp-server",
    version: "1.0.0",
  });

  server.registerTool(
    "search_f2fintech_knowledge",
    {
      description:
        "Search F2Fintech's approved internal knowledge base, company profile, About Us (/about-us), loan policies, FAQs, Credit Cards, CIBIL, Compliance, Fair Practices, Grievance Policy, Realtor/DSA/Channel Partner, Careers, and Tech Products.",
      inputSchema: {
        query: z.string().optional(),
      },
    },
    async (args = {}) => {
      const kbRes = await retrieveVerifiedKnowledge(args.query || userMessage, {
        companyId,
        language,
      });
      return mcpPack(kbRes, [], [
        {
          company_id: companyId,
          session_id: session?.id || null,
          event_type: kbRes.hasVerifiedMatch ? "faq_asked" : "unresolved_query",
          topic_tag: String(args.query || userMessage || "").slice(0, 120),
        },
      ]);
    }
  );

  server.registerTool(
    "get_active_career_openings",
    {
      description:
        "Fetch live active job openings from F2Fintech ATS (/careers), hiring departments, shift schedule, perks, Talent Waitlist details, and 6-step application steps.",
      inputSchema: {
        search: z.string().optional(),
        department: z.string().optional(),
      },
    },
    async (args = {}) => {
      const [atsRes, kbRes] = await Promise.all([
        getActiveCareerOpenings({ search: args.search || "", department: args.department || "" }),
        retrieveVerifiedKnowledge(
          `careers jobs openings ${args.department || ""} ${args.search || ""} application steps`,
          { companyId, language, includeLiveJobs: false }
        ),
      ]);
      return mcpPack(
        { ...atsRes, careerGuideChunks: kbRes.chunks || [] },
        [],
        [
          {
            company_id: companyId,
            session_id: session?.id || null,
            event_type: "faq_asked",
            topic_tag: "careers_openings",
          },
        ]
      );
    }
  );

  server.registerTool(
    "get_credit_cards",
    {
      description:
        "Fetch verified credit cards from BankKaro / CardGenius (/cards), filterable by bank, category, free cards, or search term.",
      inputSchema: {
        category: z.string().optional(),
        bank: z.string().optional(),
        freeOnly: z.boolean().optional(),
        search: z.string().optional(),
      },
    },
    async (args = {}) => {
      const [cardsRes, kbRes] = await Promise.all([
        getCreditCardAdvisorData({
          category: args.category || "",
          bank: args.bank || "",
          freeOnly: Boolean(args.freeOnly),
          search: args.search || "",
          limit: 8,
        }),
        retrieveVerifiedKnowledge("credit cards cardgenius bankkaro lifetime free categories", {
          companyId,
          language,
          includeLiveCards: false,
        }),
      ]);
      return mcpPack(
        { ...cardsRes, guideChunks: kbRes.chunks || [] },
        [],
        [
          {
            company_id: companyId,
            session_id: session?.id || null,
            event_type: "faq_asked",
            topic_tag: "credit_cards",
          },
        ]
      );
    }
  );

  server.registerTool(
    "compare_loan_products",
    {
      description:
        "Compare F2Fintech approved lending partners using consistent loan amount and tenure.",
      inputSchema: {
        loanCategory: z.string().optional(),
        providerNames: z.array(z.string()).optional(),
        loanAmount: z.number().optional(),
        tenureMonths: z.number().optional(),
      },
    },
    async (args = {}) => {
      const compRes = await compareLoanProducts({
        loanCategory: args.loanCategory,
        providerNames: args.providerNames || [],
        loanAmount: args.loanAmount || session?.context_json?.loanAmount || 500000,
        tenureMonths: args.tenureMonths || session?.context_json?.tenureMonths || 60,
        companyId,
      });
      const payloads = compRes.found ? [{ type: "comparison_table", data: compRes }] : [];
      const events = compRes.found
        ? [
            {
              company_id: companyId,
              session_id: session?.id || null,
              event_type: "comparison_run",
              loan_category: compRes.loanCategory,
              provider_names_json: compRes.items.map((i) => i.providerName),
            },
          ]
        : [];
      return mcpPack(compRes, payloads, events);
    }
  );

  server.registerTool(
    "recommend_loans",
    {
      description:
        "Evaluate customer profile and recommend matching F2Fintech loans, or return the next missing intake question.",
      inputSchema: {
        purpose: z.string().optional(),
        loanCategory: z.string().optional(),
        loanAmount: z.number().optional(),
        employmentType: z.string().optional(),
        monthlyIncome: z.number().optional(),
        existingEmi: z.number().optional(),
        experienceYears: z.number().optional(),
        tenureMonths: z.number().optional(),
        city: z.string().optional(),
        cibilScore: z.number().optional(),
      },
    },
    async (args = {}) => {
      const mergedProfile = {
        ...(session?.context_json || {}),
        ...Object.fromEntries(Object.entries(args || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")),
      };
      if (session?.update) {
        await session.update({ context_json: mergedProfile });
      }
      const recRes = await recommendLoans(mergedProfile, companyId);
      const payloads =
        !recRes.needsMoreInfo && recRes.recommendations.length > 0
          ? [{ type: "recommendation_cards", data: recRes }]
          : [];
      return mcpPack(recRes, payloads, [
        {
          company_id: companyId,
          session_id: session?.id || null,
          event_type: "recommendation_run",
          loan_category: recRes.inferredCategory,
        },
      ]);
    }
  );

  server.registerTool(
    "calculate_repayment",
    {
      description:
        "Calculate reducing-balance EMI, total interest payable, total repayment, FOIR, and prepayment savings.",
      inputSchema: {
        principal: z.number(),
        annualRatePercent: z.number(),
        tenureMonths: z.number(),
        extraMonthlyPayment: z.number().optional(),
        extraEmiPerYear: z.boolean().optional(),
        lumpSumPrepayment: z.number().optional(),
        lumpSumAtMonth: z.number().optional(),
        monthlyIncome: z.number().optional(),
        existingEmi: z.number().optional(),
      },
    },
    async (args = {}) => {
      const calcRes = calculateRepaymentDetails({
        principal: args.principal,
        annualRatePercent: args.annualRatePercent,
        tenureMonths: args.tenureMonths,
        extraMonthlyPayment: args.extraMonthlyPayment,
        extraEmiPerYear: args.extraEmiPerYear,
        lumpSumPrepayment: args.lumpSumPrepayment,
        lumpSumAtMonth: args.lumpSumAtMonth,
        monthlyIncome: args.monthlyIncome || session?.context_json?.monthlyIncome,
        existingEmi: args.existingEmi ?? session?.context_json?.existingEmi ?? 0,
      });
      return mcpPack(
        calcRes,
        [{ type: "emi_calculator", data: calcRes }],
        [
          {
            company_id: companyId,
            session_id: session?.id || null,
            event_type: "emi_calculated",
          },
        ]
      );
    }
  );

  server.registerTool(
    "get_application_form_config",
    {
      description:
        "Retrieve loan application form steps, validations, providers, and mandatory document checklist.",
      inputSchema: {
        loanType: z.string().optional(),
      },
    },
    async (args = {}) => {
      const formRes = await getFormConfiguration(args.loanType || null, companyId);
      const draft = await getOrCreateDraft({
        sessionId: session.id,
        customerId: authorizedCustomerId,
        companyId,
      });
      const progress = await evaluateDraftProgress(draft, companyId);
      const availableCategories = (formRes.configs || []).map((c) => ({
        loanType: c.loan_type,
        displayName: language === "hi" && c.display_name_hi ? c.display_name_hi : c.display_name,
        loanCategory: c.loan_category,
      }));
      return mcpPack(
        {
          configs: formRes.configs,
          availableCategories,
          availableProviders: formRes.providers.map((p) => p.title),
          currentDraftProgress: {
            currentStep: progress.currentStep,
            loanType: progress.loanType,
            missingPersonal: progress.missingPersonal,
            missingFinancial: progress.missingFinancial,
            missingLoanReq: progress.missingLoanReq,
            missingDocuments: progress.missingDocuments.map((d) => d.label),
          },
        },
        [
          {
            type: "application_step",
            data: {
              draftId: progress.draftId,
              loanType: progress.loanType,
              currentStep: progress.currentStep,
              documentChecklist: progress.documentChecklist,
              availableCategories,
              providers: formRes.providers.map((p) => p.title),
            },
          },
        ]
      );
    }
  );

  server.registerTool(
    "update_application_draft",
    {
      description:
        "Update conversational loan application draft fields and return next missing fields or documents.",
      inputSchema: {
        loan_type: z.string().optional(),
        amount: z.number().optional(),
        tenure: z.string().optional(),
        providers: z.array(z.string()).optional(),
        prefix: z.string().optional(),
        name: z.string().optional(),
        contact: z.string().optional(),
        email: z.string().optional(),
        pan: z.string().optional(),
        dob: z.string().optional(),
        father_name: z.string().optional(),
        mother_name: z.string().optional(),
        working_address: z.string().optional(),
        permanent_address: z.string().optional(),
        current_address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        employment_type: z.string().optional(),
        salary: z.number().optional(),
        existing_emi: z.number().optional(),
        existing_liability: z.number().optional(),
        company: z.string().optional(),
        gst_number: z.string().optional(),
        degree: z.string().optional(),
        license_number: z.string().optional(),
        case_type: z.string().optional(),
        has_running_loans: z.string().optional(),
      },
    },
    async (args = {}) => {
      const fields = { ...(args || {}) };
      if (fields.has_running_loans !== undefined) {
        fields.existing_loans = [
          {
            has_running_loans: fields.has_running_loans,
            which_loan: "",
            loan_amount: "",
            running_emi: fields.existing_emi || "",
          },
        ];
        delete fields.has_running_loans;
      }

      const updateRes = await updateApplicationDraft({
        sessionId: session.id,
        customerId: authorizedCustomerId,
        fields,
        companyId,
      });

      if (!updateRes.success) {
        return mcpPack(updateRes);
      }

      const prog = updateRes.progress;
      const payloads = [];
      if (prog.currentStep === "documents") {
        payloads.push({
          type: "document_checklist",
          data: {
            draftId: prog.draftId,
            loanType: prog.loanType,
            checklist: prog.documentChecklist,
          },
        });
      } else if (prog.currentStep === "review" || prog.isReadyForReview) {
        payloads.push({
          type: "application_review",
          data: buildReviewSummary(prog),
        });
      } else {
        payloads.push({
          type: "application_step",
          data: {
            draftId: prog.draftId,
            loanType: prog.loanType,
            currentStep: prog.currentStep,
            missingPersonal: prog.missingPersonal,
            missingFinancial: prog.missingFinancial,
            missingLoanReq: prog.missingLoanReq,
          },
        });
      }

      return mcpPack(
        {
          success: true,
          duplicateWarning: updateRes.duplicateWarning,
          currentStep: prog.currentStep,
          loanType: prog.loanType,
          isReadyForReview: prog.isReadyForReview,
          missingPersonal: prog.missingPersonal,
          missingFinancial: prog.missingFinancial,
          missingLoanReq: prog.missingLoanReq,
          missingDocuments: prog.missingDocuments.map((d) => ({ type: d.type, label: d.label })),
        },
        payloads
      );
    }
  );

  server.registerTool(
    "check_my_application_status",
    {
      description:
        "Check submitted loan applications, trackingStatus, current ticket status, and missing documents scoped strictly by caller RBAC.",
      inputSchema: {
        applicationNo: z.number().optional(),
        targetCustomerId: z.number().optional(),
      },
    },
    async (args = {}) => {
      // Enforce RBAC if a caller attempts cross-customer lookup via targetCustomerId
      if (args.targetCustomerId && Number(args.targetCustomerId) !== Number(authorizedCustomerId)) {
        if (
          !hasPermission(actorContext.role, "application:read_masked") &&
          !hasPermission(actorContext.role, "application:read_full_kyc")
        ) {
          return mcpPack({
            authorized: false,
            accessDenied: true,
            message: "Access denied: you can only inspect applications belonging to your verified account.",
          });
        }
        const staffView = await lookupApplicationForStaff({
          role: actorContext.role,
          viewerCustomerId: actorContext.actorId,
          applicationNo: args.applicationNo || null,
          customerId: args.targetCustomerId,
        });
        return mcpPack(staffView);
      }

      const statusRes = await getCustomerApplicationStatus({
        customerId: authorizedCustomerId,
        verifiedContact: session?.verified_contact || null,
        verifiedEmail: session?.verified_email || null,
        applicationNo: args.applicationNo || null,
        companyId,
        language,
      });
      const payloads = [];
      if (statusRes.requiresVerification) {
        payloads.push({
          type: "otp_verification",
          data: { sessionId: session.id },
        });
      } else if (statusRes.hasApplications) {
        payloads.push({
          type: "application_status_cards",
          data: statusRes.applications,
        });
      }
      return mcpPack(statusRes, payloads);
    }
  );

  server.registerTool(
    "escalate_to_support",
    {
      description:
        "Create an official F2Fintech support ticket when an issue cannot be resolved automatically or customer requests support/grievance.",
      inputSchema: {
        title: z.string().optional(),
        description: z.string().optional(),
        contactInfo: z.string().optional(),
      },
    },
    async (args = {}) => {
      const escRes = await escalateSupportIssue({
        customerId: authorizedCustomerId,
        sessionId: session?.id || null,
        title: args.title || "general inquiry",
        description: args.description || userMessage || "Customer support request via AI Assistant",
        contactInfo: args.contactInfo || session?.verified_contact || session?.verified_email || null,
        companyId,
      });
      return mcpPack(escRes, [{ type: "escalation_card", data: escRes }]);
    }
  );

  return server;
}

/**
 * Invoke any registered F2Fintech MCP tool over linked in-memory MCP Client <-> Server transport.
 */
async function callMcpTool(toolName, args = {}, runtimeCtx = {}) {
  const server = createF2FintechMcpServer(runtimeCtx);
  const client = new Client({ name: "f2fintech-gemini-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const response = await client.callTool({
      name: toolName,
      arguments: args || {},
    });

    const textBlock = (response?.content || []).find((c) => c.type === "text")?.text;
    if (!textBlock) {
      return response?.isError ? { error: `MCP tool ${toolName} failed` } : {};
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock);
    } catch {
      return { text: textBlock };
    }

    if (Array.isArray(parsed._uiPayloads) && Array.isArray(runtimeCtx.uiPayloads)) {
      runtimeCtx.uiPayloads.push(...parsed._uiPayloads);
    }
    if (Array.isArray(parsed._analyticsEvents)) {
      for (const evt of parsed._analyticsEvents) {
        if (evt?.company_id && evt?.event_type) {
          ChatbotAnalyticsEvent.create(evt).catch(() => {});
        }
      }
    }

    return parsed.result !== undefined ? parsed.result : parsed;
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

/**
 * Return standard MCP tool metadata list (`tools/list`) for health checks and introspection.
 */
async function listMcpToolDefinitions() {
  const server = createF2FintechMcpServer({});
  const client = new Client({ name: "f2fintech-inspector", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const res = await client.listTools();
    return res.tools || [];
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

module.exports = {
  createF2FintechMcpServer,
  callMcpTool,
  listMcpToolDefinitions,
};

