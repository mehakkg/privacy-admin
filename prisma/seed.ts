/**
 * Seed fixtures.
 *
 * Chosen so every Scenario 1 screen has a real state to render AND every branch
 * that matters is demoable without live integrations: a retention conflict, a
 * multi-account identity conflict, a hard failure with a genuine diagnostic, a
 * system with no API, a backup on a delayed rotation window, and a processor
 * whose DPA does not cover what we would need to instruct it about.
 *
 * Deterministic: fixed dates and fixed ids, no randomness, so a reseed produces
 * an identical database and screenshots stay stable.
 *
 * PRIVACY_ADMIN_SEED=1 is what lets this script write the governance-owned
 * models. It stands in for the DPO / CISO modules, which are not part of this
 * build. Nothing in src/ sets that variable.
 */

process.env.PRIVACY_ADMIN_SEED = "1";

import { PrismaClient } from "@prisma/client";
import { computeFulfilmentDeadline } from "../src/lib/engines/sla";

const prisma = new PrismaClient();

/** Fixed "today" for the fixtures, so relative deadlines stay stable. */
const NOW = new Date("2026-08-28T09:00:00.000Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function list(values: string[]): string {
  return JSON.stringify(values);
}

async function main() {
  console.log("Clearing existing data…");
  // Postgres: TRUNCATE ... CASCADE clears the whole graph in one statement and
  // resets the audit log's sequence, so a reseed produces identical `seq`
  // values and the hash chain is reproducible.
  //
  // The table list below is retained because it also documents the dependency
  // order, and because `RESTART IDENTITY` needs every table named explicitly.
  const tables = [
    "VerificationChecklistItem",
    "ExecutionRecord",
    "Escalation",
    "RetentionException",
    "DataLocation",
    "Notification",
    "AuditLogEntry",
    "DataPrincipalRequest",
    "PrincipalIdentifier",
    "DataPrincipal",
    "ConnectedSystem",
    "DataProcessor",
    "AccountDisposition",
    "RevocationRecord",
    "ActiveSession",
    "AccessGrant",
    "SystemAccount",
    "InternalUser",
    "ProvisioningRequest",
    "RBACRole",
    "TriageItem",
    "MergeStep",
    "DuplicatePair",
    "ROTCandidate",
    "ScanRun",
    "ConsentRecord",
    "ConsentApiConfig",
    "Webhook",
    "CookieScanFinding",
    "CookieScript",
    "NoticeVariant",
    "NoticeRevision",
    "Notice",
    "ProcessingActivity",
    "ClassifiedField",
    "DiscoverySource",
    "NotificationRoute",
    "OnboardingState",
    "RetentionCategory",
    "PurposeTag",
    "NoticeVersion",
    "CookieCategory",
    "ProtectionRuleException",
    "ProtectionRuleScope",
    "EntityUserMapping",
    "DataFlowConnection",
    "DataFlowNode",
    "ProtectionRule",
    "DataFlowConnection",
    "DataFlowNode",
    "Entity",
    "Actor",
  ];

  // Postgres in deployment, SQLite when running locally without a hosted
  // database. TRUNCATE ... CASCADE does not exist in SQLite, so pick the reset
  // that the connected engine actually supports rather than assuming one.
  const isSqlite = (process.env.DATABASE_URL ?? "").startsWith("file:");
  if (isSqlite) {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    for (const table of tables) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  } else {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  }

  // -- Actors ---------------------------------------------------------------
  const admin = await prisma.actor.create({
    data: { id: "act_admin", name: "R. Iyer", email: "admin@example.in", role: "admin" },
  });
  const dpo = await prisma.actor.create({
    data: { id: "act_dpo", name: "S. Menon", email: "dpo@example.in", role: "dpo" },
  });
  await prisma.actor.create({
    data: { id: "act_ciso", name: "A. Khan", email: "ciso@example.in", role: "ciso" },
  });
  await prisma.actor.create({
    data: {
      id: "act_go",
      name: "P. Deshmukh",
      email: "grievance@example.in",
      role: "grievance_officer",
    },
  });

  // -- Connected systems ----------------------------------------------------
  // Five systems covering each execution path the engine can take.
  const coreBanking = await prisma.connectedSystem.create({
    data: {
      id: "sys_core",
      name: "Core Banking (Finacle)",
      kind: "database",
      hasApi: true,
      connectionStatus: "healthy",
      executionMode: "api",
      ownerTeam: "Core Platform",
    },
  });
  const crm = await prisma.connectedSystem.create({
    data: {
      id: "sys_crm",
      name: "Salesforce CRM",
      kind: "crm",
      hasApi: true,
      connectionStatus: "healthy",
      executionMode: "api",
      ownerTeam: "Sales Ops",
    },
  });
  const marketing = await prisma.connectedSystem.create({
    data: {
      id: "sys_mkt",
      name: "Marketing Automation",
      kind: "saas",
      hasApi: true,
      connectionStatus: "down",
      executionMode: "api",
      ownerTeam: "Growth",
    },
  });
  const legacyArchive = await prisma.connectedSystem.create({
    data: {
      id: "sys_legacy",
      name: "Legacy Loan Archive",
      kind: "archive",
      hasApi: false,
      connectionStatus: "manual_only",
      executionMode: "manual",
      ownerTeam: "Retail Lending",
    },
  });
  const backupVault = await prisma.connectedSystem.create({
    data: {
      id: "sys_backup",
      name: "Backup Vault",
      kind: "backup",
      hasApi: true,
      connectionStatus: "healthy",
      executionMode: "delayed",
      delayDays: 30,
      ownerTeam: "Infrastructure",
    },
  });

  // -- Processors -----------------------------------------------------------
  // The email vendor's DPA covers marketing only: instructing it about KYC or
  // financial data is refused by the DPA-scope check, which is the point.
  const emailVendor = await prisma.dataProcessor.create({
    data: {
      id: "proc_email",
      name: "Sendwave (email delivery)",
      dpaId: "DPA-2025-014",
      dpaScopeJson: list(["marketing", "contact"]),
      contactChannel: "email",
      dpaExpiresAt: new Date("2027-03-31T00:00:00.000Z"),
    },
  });
  const analyticsVendor = await prisma.dataProcessor.create({
    data: {
      id: "proc_analytics",
      name: "Metriq Analytics",
      dpaId: "DPA-2024-208",
      dpaScopeJson: list(["behavioural", "contact"]),
      contactChannel: "portal",
      dpaExpiresAt: new Date("2026-12-31T00:00:00.000Z"),
    },
  });
  const printVendor = await prisma.dataProcessor.create({
    data: {
      id: "proc_print",
      name: "Chitra Print & Mail",
      dpaId: "DPA-2025-051",
      dpaScopeJson: list(["contact", "identity"]),
      contactChannel: "sftp",
      dpaExpiresAt: new Date("2027-06-30T00:00:00.000Z"),
    },
  });

  // -- Data Principals ------------------------------------------------------
  const meera = await prisma.dataPrincipal.create({
    data: { id: "dp_meera", displayName: "Meera Krishnan", createdAt: daysAgo(1400) },
  });
  const arun = await prisma.dataPrincipal.create({
    data: { id: "dp_arun", displayName: "Arun Nair", createdAt: daysAgo(900) },
  });
  const kavya = await prisma.dataPrincipal.create({
    data: { id: "dp_kavya", displayName: "Kavya Reddy", createdAt: daysAgo(600) },
  });
  // Two principals share a phone number — the multi-account conflict.
  const rohanA = await prisma.dataPrincipal.create({
    data: { id: "dp_rohan_a", displayName: "Rohan Sharma (retail)", createdAt: daysAgo(1100) },
  });
  const rohanB = await prisma.dataPrincipal.create({
    data: { id: "dp_rohan_b", displayName: "Rohan Sharma (business)", createdAt: daysAgo(420) },
  });

  await prisma.principalIdentifier.createMany({
    data: [
      { principalId: meera.id, kind: "email", value: "meera.k@example.in", verified: true, assertedBy: "Core Banking" },
      { principalId: meera.id, kind: "customer_id", value: "CUST-449120", verified: true, assertedBy: "Core Banking" },
      { principalId: meera.id, kind: "pan", value: "ABCPK1234F", verified: true, assertedBy: "KYC" },
      { principalId: arun.id, kind: "email", value: "arun.nair@example.in", verified: true, assertedBy: "CRM" },
      { principalId: arun.id, kind: "customer_id", value: "CUST-772301", verified: true, assertedBy: "Core Banking" },
      { principalId: kavya.id, kind: "email", value: "kavya.reddy@example.in", verified: true, assertedBy: "CRM" },
      { principalId: kavya.id, kind: "phone", value: "+91 98860 11234", verified: true, assertedBy: "CRM" },
      { principalId: rohanA.id, kind: "phone", value: "+91 99010 55512", verified: true, assertedBy: "Core Banking" },
      { principalId: rohanA.id, kind: "customer_id", value: "CUST-110945", verified: true, assertedBy: "Core Banking" },
      { principalId: rohanB.id, kind: "phone", value: "+91 99010 55512", verified: true, assertedBy: "CRM" },
      { principalId: rohanB.id, kind: "customer_id", value: "CUST-330871", verified: false, assertedBy: "CRM" },
    ],
  });

  // -- Data locations -------------------------------------------------------
  const loc = (
    principalId: string,
    target: { systemId?: string; processorId?: string },
    categories: string[],
    recordCount: number,
    discoveredDaysAgo: number,
    source = "scan",
    stale = false,
  ) => ({
    principalId,
    systemId: target.systemId ?? null,
    processorId: target.processorId ?? null,
    dataCategoriesJson: list(categories),
    recordCount,
    discoveredAt: daysAgo(discoveredDaysAgo),
    discoverySource: source,
    stale,
  });

  await prisma.dataLocation.createMany({
    data: [
      // Meera — the KYC retention conflict. Five targets, one with no API,
      // one on a delayed backup window.
      loc(meera.id, { systemId: coreBanking.id }, ["identity", "kyc", "financial", "transaction"], 1284, 3),
      loc(meera.id, { systemId: crm.id }, ["identity", "contact", "support"], 96, 3),
      loc(meera.id, { systemId: legacyArchive.id }, ["identity", "financial"], 12, 5, "questionnaire"),
      loc(meera.id, { systemId: backupVault.id }, ["identity", "kyc", "financial"], 1284, 3),
      loc(meera.id, { processorId: emailVendor.id }, ["marketing", "contact"], 41, 4),
      // The print vendor receives account statements, so it holds `financial`
      // data — but DPA-2025-051 was only ever scoped to name and address.
      // Dispatch here is refused until the DPO extends the DPA.
      loc(meera.id, { processorId: printVendor.id }, ["contact", "identity", "financial"], 18, 4),

      // Arun — the clean erasure. Everything has an API and is healthy.
      loc(arun.id, { systemId: coreBanking.id }, ["identity", "contact"], 214, 2),
      loc(arun.id, { systemId: crm.id }, ["identity", "contact", "support"], 58, 2),

      // Kavya — the failing system, plus a stale location so coverage is
      // demonstrably incomplete.
      loc(kavya.id, { systemId: crm.id }, ["identity", "contact"], 33, 2),
      loc(kavya.id, { systemId: marketing.id }, ["marketing", "behavioural"], 187, 2),
      loc(kavya.id, { systemId: legacyArchive.id }, ["identity"], 4, 240, "manual", true),
      loc(kavya.id, { processorId: analyticsVendor.id }, ["behavioural", "contact"], 512, 2),

      // Rohan (retail) — used once identity is resolved.
      loc(rohanA.id, { systemId: coreBanking.id }, ["identity", "contact", "transaction"], 640, 6),
      loc(rohanA.id, { systemId: crm.id }, ["identity", "contact"], 22, 6),
    ],
  });

  // -- Requests -------------------------------------------------------------
  const mkRequest = (
    id: string,
    referenceCode: string,
    type: string,
    status: string,
    principalId: string | null,
    rawIdentifier: string,
    rawIdentifierKind: string,
    receivedDaysAgo: number,
    escalationSource: string,
    extra: Record<string, unknown> = {},
  ) => {
    const receivedAt = daysAgo(receivedDaysAgo);
    return {
      id,
      referenceCode,
      type,
      status,
      principalId,
      rawIdentifier,
      rawIdentifierKind,
      receivedAt,
      slaDeadline: computeFulfilmentDeadline(receivedAt),
      escalationSource,
      ...extra,
    };
  };

  await prisma.dataPrincipalRequest.create({
    data: mkRequest(
      "req_meera", "DPR-2026-0412", "erasure", "retention_review",
      meera.id, "meera.k@example.in", "email", 24, "grievance_officer",
      {
        linkedGrievanceCaseId: "GRV-2026-0188",
        assignedToActorId: admin.id,
        notes:
          "Data Principal withdrew consent for all non-essential processing and " +
          "asked for erasure across every system.",
      },
    ),
  });

  await prisma.dataPrincipalRequest.create({
    data: mkRequest(
      "req_arun", "DPR-2026-0418", "erasure", "received",
      arun.id, "arun.nair@example.in", "email", 6, "portal",
      { assignedToActorId: admin.id, notes: "Closed both accounts last month; asks for full erasure." },
    ),
  });

  await prisma.dataPrincipalRequest.create({
    data: mkRequest(
      "req_kavya", "DPR-2026-0402", "erasure", "executing",
      kavya.id, "kavya.reddy@example.in", "email", 27, "portal",
      {
        // Already executing, so the Rule 8 notice was served and has elapsed.
        preNoticeSentAt: daysAgo(25),
        preNoticeDueAt: daysAgo(23),
        notes: "Marketing Automation has been failing since the token expiry.",
      },
    ),
  });

  await prisma.dataPrincipalRequest.create({
    data: mkRequest(
      "req_rohan", "DPR-2026-0421", "erasure", "identity_review",
      null, "+91 99010 55512", "phone", 2, "branch",
      {
        requiresIdentityReview: true,
        identityNote:
          "Two Data Principals share this phone number: a retail customer and a " +
          "business account opened later. Erasing the wrong one is unrecoverable.",
        notes: "Walk-in request captured at the Koramangala branch.",
      },
    ),
  });

  await prisma.dataPrincipalRequest.create({
    data: mkRequest(
      "req_access", "DPR-2026-0419", "access", "received",
      arun.id, "CUST-772301", "customer_id", 9, "email",
      { notes: "Asks for a copy of all personal data held, plus processing purposes." },
    ),
  });

  await prisma.dataPrincipalRequest.create({
    data: mkRequest(
      "req_dpb", "DPR-2026-0377", "erasure", "awaiting_confirmation",
      kavya.id, "kavya.reddy@example.in", "email", 86, "dpb",
      {
        linkedGrievanceCaseId: "GRV-2026-0102",
        preNoticeSentAt: daysAgo(84),
        preNoticeDueAt: daysAgo(82),
        notes:
          "Escalated to the Data Protection Board after the published response " +
          "period lapsed. Approaching the 90-day statutory ceiling.",
      },
    ),
  });

  // -- Retention exceptions -------------------------------------------------
  // Meera's KYC and transaction records are held by statute. These are field
  // scoped: the rest of her record can still be erased.
  await prisma.retentionException.createMany({
    data: [
      {
        id: "ret_kyc",
        principalId: meera.id,
        requestId: "req_meera",
        dataCategory: "kyc",
        fieldPathsJson: list([
          "customer.pan",
          "customer.aadhaar_ref",
          "kyc.document_scans",
          "kyc.verification_log",
        ]),
        legalBasis:
          "KYC records must be retained for five years after the end of the " +
          "business relationship.",
        statuteRef: "PMLA 2002 s.12 r/w PML (Maintenance of Records) Rules 2005, r.10",
        expiryCondition: "Five years from account closure (closed 2025-11-30).",
        expiresAt: new Date("2030-11-30T00:00:00.000Z"),
        reviewStatus: "unreviewed",
        autoFlagged: true,
      },
      {
        id: "ret_txn",
        principalId: meera.id,
        requestId: "req_meera",
        dataCategory: "transaction",
        fieldPathsJson: list(["ledger.entries", "ledger.statements"]),
        legalBasis:
          "Books of account and transaction records must be preserved for eight " +
          "financial years.",
        statuteRef: "Companies Act 2013 s.128(5)",
        expiryCondition: "Eight financial years from FY 2024-25.",
        expiresAt: new Date("2033-03-31T00:00:00.000Z"),
        reviewStatus: "unreviewed",
        autoFlagged: true,
      },
      {
        // Already reviewed, so Kavya's request is not blocked and can show the
        // downstream screens in a working state.
        id: "ret_kavya",
        principalId: kavya.id,
        requestId: "req_kavya",
        dataCategory: "identity",
        fieldPathsJson: list(["customer.name", "customer.dob"]),
        legalBasis: "Retained pending closure of an open dispute.",
        statuteRef: "Limitation Act 1963, Sch. Art. 113",
        expiryCondition: "Until the dispute is closed.",
        reviewStatus: "acknowledged",
        autoFlagged: true,
        reviewedByActorId: admin.id,
        reviewedAt: daysAgo(20),
      },
    ],
  });

  // -- Execution records for the in-flight request --------------------------
  // Kavya's request shows the three-state model honestly: CRM verified, the
  // processor pending, the archive awaiting manual verification, and Marketing
  // Automation hard-failed with a diagnostic Admin can actually act on.
  await prisma.executionRecord.create({
    data: {
      id: "exec_kavya_crm",
      requestId: "req_kavya",
      systemId: crm.id,
      mode: "api",
      status: "verified",
      dispatchedAt: daysAgo(19),
      confirmedAt: daysAgo(19),
      confirmedByActorId: admin.id,
      verificationMethod: "api_ack",
    },
  });

  await prisma.executionRecord.create({
    data: {
      id: "exec_kavya_mkt",
      requestId: "req_kavya",
      systemId: marketing.id,
      mode: "api",
      status: "failed",
      dispatchedAt: daysAgo(19),
      attempt: 3,
      failureCode: "ERR_CONN_REFUSED",
      failureDetail:
        "Connection to Marketing Automation was refused. The service account " +
        "token expired on the integration host, so the erasure endpoint rejected " +
        "the request before it reached the data layer.",
      failureRawResponse: JSON.stringify(
        {
          httpStatus: 401,
          error: "invalid_token",
          error_description: "Token expired at 2026-08-21T02:14:07Z",
          endpoint: "POST /v2/subjects/erase",
          correlationId: "cid-8f2a41b0",
        },
        null,
        2,
      ),
    },
  });

  const kavyaManual = await prisma.executionRecord.create({
    data: {
      id: "exec_kavya_legacy",
      requestId: "req_kavya",
      systemId: legacyArchive.id,
      mode: "manual",
      status: "pending",
    },
  });

  await prisma.executionRecord.create({
    data: {
      id: "exec_kavya_analytics",
      requestId: "req_kavya",
      processorId: analyticsVendor.id,
      mode: "processor_instruction",
      status: "pending",
      dispatchedAt: daysAgo(18),
      deliveredAt: daysAgo(18),
    },
  });

  await prisma.verificationChecklistItem.createMany({
    data: [
      { executionRecordId: kavyaManual.id, ordinal: 1, label: "Locate the customer's records in the archive index", checked: true, checkedAt: daysAgo(15), checkedByActorId: admin.id },
      { executionRecordId: kavyaManual.id, ordinal: 2, label: "Confirm no open legal hold applies to these records", checked: true, checkedAt: daysAgo(15), checkedByActorId: admin.id },
      { executionRecordId: kavyaManual.id, ordinal: 3, label: "Retail Lending performs the deletion on the archive host", checked: false },
      { executionRecordId: kavyaManual.id, ordinal: 4, label: "Obtain written confirmation from the system owner", checked: false },
      { executionRecordId: kavyaManual.id, ordinal: 5, label: "Re-run the archive index search and confirm zero results", checked: false },
    ],
  });

  // -- Governance-owned objects (seeded only; read-only to Admin) -----------
  await prisma.purposeTag.createMany({
    data: [
      { id: "pt_servicing", name: "Account servicing", description: "Operating and servicing the customer's accounts.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
      { id: "pt_regulatory", name: "Regulatory compliance", description: "Meeting KYC, AML and reporting obligations.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
      { id: "pt_fraud", name: "Fraud prevention", description: "Detecting and preventing fraudulent transactions.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
      { id: "pt_marketing", name: "Marketing communication", description: "Sending offers where consent has been given.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(150) },
      { id: "pt_service", name: "Service improvement", description: "Analysing usage to improve the service.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(150) },
      { id: "pt_grievance", name: "Grievance redressal", description: "Handling complaints and rights requests.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
    ],
  });

  await prisma.noticeVersion.createMany({
    data: [
      {
        version: "v3.1",
        title: "Privacy Notice",
        content: "Notice to Data Principals under s.5 of the DPDP Act, 2023.",
        publishedRegionsJson: list(["IN"]),
        languagesJson: list(["English", "Hindi", "Tamil", "Bengali", "Marathi"]),
        status: "published",
        approvedBy: dpo.name,
        approvedAt: daysAgo(120),
      },
      {
        version: "v3.2",
        title: "Privacy Notice (draft)",
        content: "Adds the nomination right and revised retention schedule.",
        publishedRegionsJson: list([]),
        languagesJson: list(["English"]),
        status: "approved_pending_publication",
        approvedBy: dpo.name,
        approvedAt: daysAgo(9),
      },
    ],
  });

  await prisma.cookieCategory.createMany({
    data: [
      { name: "Strictly necessary", description: "Required for the site to function.", defaultState: "on", approvedBy: dpo.name, approvedAt: daysAgo(120) },
      { name: "Functional", description: "Remembers preferences.", defaultState: "off", approvedBy: dpo.name, approvedAt: daysAgo(120) },
      { name: "Analytics", description: "Measures usage.", defaultState: "off", approvedBy: dpo.name, approvedAt: daysAgo(120) },
      { name: "Advertising", description: "Personalised advertising.", defaultState: "off", approvedBy: dpo.name, approvedAt: daysAgo(120) },
    ],
  });

  await prisma.protectionRule.createMany({
    data: [
      { id: "pr_pan", ruleName: "PAN masking — customer-facing views", dataCategory: "kyc", ruleType: "mask", strictness: "high", scope: "Customer-facing views", definition: "PAN masked to last four digits in every customer-facing view.", approvedBy: "A. Khan", approvedAt: daysAgo(90) },
      { id: "pr_kyc_enc", ruleName: "KYC document encryption at rest", dataCategory: "kyc", ruleType: "encrypt", strictness: "high", scope: "At rest, all systems", definition: "AES-256 with HSM-held keys.", approvedBy: "A. Khan", approvedAt: daysAgo(180) },
      { id: "pr_acct_mask", ruleName: "Account number masking — non-prod", dataCategory: "financial", ruleType: "mask", strictness: "medium", scope: "Non-production environments", definition: "Account numbers masked to last four in non-prod.", approvedBy: "A. Khan", approvedAt: daysAgo(180) },
      { id: "pr_kyc_dlp", ruleName: "KYC egress block", dataCategory: "kyc", ruleType: "dlp", strictness: "high", scope: "Outbound email and file share", definition: "Block egress of KYC document scans.", approvedBy: "A. Khan", approvedAt: daysAgo(90) },
      { id: "pr_beh_dlp", ruleName: "Behavioural transfer restriction", dataCategory: "behavioural", ruleType: "dlp", strictness: "medium", scope: "Third-party transfers", definition: "Block transfer outside processors named in a current DPA.", approvedBy: "A. Khan", approvedAt: daysAgo(60) },
    ],
  });

  // Admin-editable scope (separate from the CISO-owned definition). PAN masking
  // is applied to two systems and NOT yet to Northgate's — "needs scope".
  await prisma.protectionRuleScope.createMany({
    data: [
      { ruleId: "pr_pan", systemsJson: JSON.stringify(["sys_core", "sys_legacy"]), updatedBy: "R. Iyer" },
      { ruleId: "pr_kyc_enc", systemsJson: JSON.stringify(["sys_core", "sys_crm", "sys_backup"]), updatedBy: "R. Iyer" },
      { ruleId: "pr_acct_mask", systemsJson: JSON.stringify([]), updatedBy: null },
    ],
  });
  await prisma.protectionRuleException.create({
    data: {
      ruleId: "pr_pan",
      process: "Internal reporting dashboard",
      narrowedScope: "Last-4-digits display only, read-only analysts",
      status: "approved",
      approvedBy: "A. Khan",
      approvedAt: daysAgo(20),
    },
  });

  // -- Entities (multi-entity: parent NBFC + acquired subsidiary) ----------
  await prisma.entity.create({
    data: {
      id: "ent_meridian",
      name: "Meridian Financial Services",
      kind: "legal_entity",
      sdfStatus: "sdf",
      sdfHistoryJson: JSON.stringify([
        { status: "not_assessed", note: "Initial", at: daysAgo(400).toISOString() },
        { status: "sdf", note: "Notified as Significant Data Fiduciary", at: new Date("2026-06-15").toISOString() },
      ]),
    },
  });
  await prisma.entity.create({
    data: {
      id: "ent_northgate",
      name: "Northgate Lending",
      kind: "business_unit",
      hierarchyParentId: "ent_meridian",
      sdfStatus: "not_assessed",
      mergerPending: true,
    },
  });
  await prisma.entityUserMapping.createMany({
    data: [
      { userName: "Ritu Nair", entityId: "ent_meridian", accessScope: "single" },
      {
        userName: "Priya Iyer",
        entityId: "ent_meridian",
        accessScope: "cross",
        additionalEntitiesJson: JSON.stringify(["ent_northgate"]),
        justification: "Shared compliance function across both entities during integration.",
      },
      { userName: "R. Iyer", entityId: "ent_meridian", accessScope: "single" },
    ],
  });

  // -- Flow map nodes and edges (generated from the connected estate) ------
  const flowNode = (id: string, label: string, nodeType: string, subtitle: string, refHref?: string) =>
    prisma.dataFlowNode.create({ data: { id, label, nodeType, subtitle, refHref: refHref ?? null, entityId: "ent_meridian" } });

  await flowNode("fn_core", "Core Banking DB", "source", "PostgreSQL · 6 schemas", "/discovery/sources/src_core");
  await flowNode("fn_share", "Finance File Share", "system", "Internal system", "/discovery/sources/src_share");
  await flowNode("fn_cloudsupport", "CloudSupport Ticketing", "processor", "DPA-2026-0143");
  await flowNode("fn_portal", "Self-service portal", "touchpoint", "Data principal touchpoint");
  await flowNode("fn_branch", "Branch (assisted)", "touchpoint", "Data principal touchpoint");

  await prisma.dataFlowConnection.createMany({
    data: [
      { fromNodeId: "fn_portal", toNodeId: "fn_core", dataCategoriesJson: JSON.stringify(["identity", "contact"]), purposeTagId: "pt_servicing", status: "documented" },
      { fromNodeId: "fn_branch", toNodeId: "fn_core", dataCategoriesJson: JSON.stringify(["identity", "kyc"]), purposeTagId: "pt_regulatory", status: "documented" },
      { fromNodeId: "fn_core", toNodeId: "fn_share", dataCategoriesJson: JSON.stringify(["financial"]), purposeTagId: "pt_servicing", dpiaRef: "DPIA-2025-004", status: "documented" },
      // The undisclosed transfer — detected via recent API activity, no purpose,
      // no linked DPIA. This is the whole reason the flow map exists.
      { fromNodeId: "fn_core", toNodeId: "fn_cloudsupport", dataCategoriesJson: JSON.stringify(["contact", "support"]), status: "undisclosed", processorId: "proc_analytics" },
    ],
  });

  // -- Statutory retention categories (DPO-defined, governance-owned) -------
  // Read-only to Admin. These are what Screen 1 of onboarding surfaces under
  // the policy-lock treatment, and what the retention check tests against.
  await prisma.retentionCategory.createMany({
    data: [
      {
        id: "rc_kyc",
        name: "KYC records",
        retentionPeriod: "5 years after the business relationship ends",
        statuteRef: "PMLA 2002 s.12 r/w PML (Maintenance of Records) Rules 2005, r.10",
        description: "Identity and verification documents collected at onboarding.",
        approvedBy: "S. Menon",
        approvedAt: daysAgo(150),
      },
      {
        id: "rc_tax",
        name: "Books of account",
        retentionPeriod: "8 financial years",
        statuteRef: "Companies Act 2013 s.128(5)",
        description: "Ledger entries, statements and transaction records.",
        approvedBy: "S. Menon",
        approvedAt: daysAgo(150),
      },
      {
        id: "rc_dispute",
        name: "Dispute records",
        retentionPeriod: "3 years from closure of the matter",
        statuteRef: "Limitation Act 1963, Sch. Art. 113",
        description: "Correspondence and evidence relating to an open dispute.",
        approvedBy: "S. Menon",
        approvedAt: daysAgo(120),
      },
      {
        id: "rc_grievance",
        name: "Grievance case files",
        retentionPeriod: "1 year after the grievance is resolved",
        statuteRef: "DPDP Rules, 2025 — Rule 14",
        description: "Records of grievances raised by Data Principals and their outcome.",
        approvedBy: "S. Menon",
        approvedAt: daysAgo(90),
      },
    ],
  });

  // -- Escalations ----------------------------------------------------------
  // One shared Escalation object serves retention conflicts, failure disputes
  // and RBAC baseline requests alike — three sources, one case type, so the
  // queue is a single place to look.
  //
  // Deliberately NOT raised against Meera's two obligations: her request is the
  // "blocked, nothing reviewed yet" demo and must stay that way.
  await prisma.escalation.create({
    data: {
      id: "esc_kavya_failure",
      requestId: "req_kavya",
      sourceRole: "admin",
      targetRole: "dpo",
      reason:
        "Marketing Automation has refused deletion for six days with an expired " +
        "service token. The fulfilment deadline is in three days and I cannot " +
        "reach the vendor's integration owner. Need a decision on whether to " +
        "proceed with a partial completion or seek an extension.",
      contextJson: JSON.stringify({
        request: "DPR-2026-0402",
        system: "Marketing Automation",
        failureCode: "ERR_CONN_REFUSED",
        attempts: 3,
        deadline: "2026-08-31",
      }),
      attachedEvidenceJson: list(["exec_kavya_mkt"]),
      status: "open",
      createdAt: daysAgo(2),
    },
  });

  await prisma.escalation.create({
    data: {
      id: "esc_kavya_retention",
      requestId: "req_kavya",
      retentionExceptionId: "ret_kavya",
      sourceRole: "admin",
      targetRole: "dpo",
      reason:
        "The Data Principal disputes that an open matter still exists and has " +
        "asked for the identity fields to be erased. Requesting a ruling on " +
        "whether the limitation-period retention still applies.",
      contextJson: JSON.stringify({
        request: "DPR-2026-0402",
        dataCategory: "identity",
        statuteRef: "Limitation Act 1963, Sch. Art. 113",
        fieldsWithheld: ["customer.name", "customer.dob"],
      }),
      attachedEvidenceJson: list(["ret_kavya"]),
      status: "ruled",
      ruling: "uphold_retention",
      rulingRationale:
        "The dispute remains open on the register; the limitation period has " +
        "not run. Retention stands. Re-raise once the matter is formally closed.",
      ruledByActorId: dpo.id,
      ruledAt: daysAgo(9),
      createdAt: daysAgo(14),
    },
  });

  await prisma.escalation.create({
    data: {
      id: "esc_withdrawn",
      requestId: "req_arun",
      sourceRole: "admin",
      targetRole: "dpo",
      reason:
        "Raised on the assumption that the Legacy Loan Archive held KYC records " +
        "for this Data Principal.",
      contextJson: JSON.stringify({
        request: "DPR-2026-0418",
        withdrawnBecause:
          "A re-scan showed the archive holds no record for this Data Principal, " +
          "so there was no conflict to rule on.",
      }),
      status: "withdrawn",
      createdAt: daysAgo(5),
    },
  });

  // =========================================================================
  // Scenario 2 — Access Lifecycle & Identity Hygiene
  // =========================================================================

  // A degraded system: reachable enough to accept a role removal, not reachable
  // enough to clear the session store. This is what produces a genuinely
  // PARTIAL revocation rather than a contrived one.
  const warehouse = await prisma.connectedSystem.create({
    data: {
      id: "sys_warehouse",
      name: "Data Warehouse (Snowflake)",
      kind: "database",
      hasApi: true,
      connectionStatus: "degraded",
      executionMode: "api",
      ownerTeam: "Data Platform",
    },
  });

  // -- Roles, with CISO-approved baselines ----------------------------------
  const roleSupport = await prisma.rBACRole.create({
    data: {
      id: "role_support",
      name: "Support Agent",
      description: "Handles customer queries in the support console.",
      isTemplate: true,
      permissionsJson: list(["read:customer_profile", "read:support_tickets"]),
      baselineSnapshotJson: list(["read:customer_profile", "read:support_tickets"]),
      baselineCategoriesJson: list(["identity", "contact", "support"]),
      baselineApprovedBy: "A. Khan",
      baselineApprovedAt: daysAgo(180),
    },
  });

  // Drift: this role has picked up `read:kyc_documents`, which its baseline
  // does not contain. Nobody approved that.
  const roleEngineer = await prisma.rBACRole.create({
    data: {
      id: "role_engineer",
      name: "Data Engineer",
      description: "Runs and maintains data pipelines.",
      permissionsJson: list([
        "read:pipeline_metadata",
        "run:etl_job",
        "read:kyc_documents",
        "export:bulk_data",
      ]),
      baselineSnapshotJson: list(["read:pipeline_metadata", "run:etl_job"]),
      baselineCategoriesJson: list(["behavioural"]),
      baselineApprovedBy: "A. Khan",
      baselineApprovedAt: daysAgo(180),
    },
  });

  const roleBranch = await prisma.rBACRole.create({
    data: {
      id: "role_branch",
      name: "Branch Officer",
      description: "Serves customers at a branch counter.",
      isTemplate: true,
      // Narrower than its baseline — allowed, and not flagged as drift.
      permissionsJson: list(["read:customer_profile", "read:account_balance"]),
      baselineSnapshotJson: list([
        "read:customer_profile",
        "read:account_balance",
        "create:service_request",
      ]),
      baselineCategoriesJson: list(["identity", "contact", "financial"]),
      baselineApprovedBy: "A. Khan",
      baselineApprovedAt: daysAgo(180),
    },
  });

  await prisma.rBACRole.create({
    data: {
      id: "role_auditor",
      name: "Read-only Auditor",
      description: "Reads the audit log. Grants no access to personal data.",
      isTemplate: true,
      permissionsJson: list(["read:audit_log"]),
      baselineSnapshotJson: list(["read:audit_log"]),
      baselineCategoriesJson: list([]),
      baselineApprovedBy: "A. Khan",
      baselineApprovedAt: daysAgo(180),
      lastReviewedAt: daysAgo(120),
    },
  });

  // Least-privilege templates the Provisioning screen grants from. "Standard
  // Analyst" is the one Arjun Mehta's HR-sync request maps to: Core Banking
  // (read), Finance File Share (read), no access to the Legacy Loan Archive.
  const roleAnalyst = await prisma.rBACRole.create({
    data: {
      id: "role_analyst",
      name: "Standard Analyst",
      description: "Reads Core Banking and the Finance File Share. No archive access.",
      isTemplate: true,
      permissionsJson: list(["read:core_banking", "read:finance_share"]),
      baselineSnapshotJson: list(["read:core_banking", "read:finance_share"]),
      baselineCategoriesJson: list(["identity", "contact", "financial"]),
      baselineApprovedBy: "A. Khan",
      baselineApprovedAt: daysAgo(200),
      lastReviewedAt: daysAgo(30),
    },
  });

  await prisma.rBACRole.create({
    data: {
      id: "role_ops_ro",
      name: "Ops — Read Only",
      description: "Read-only operational visibility across core systems.",
      isTemplate: true,
      permissionsJson: list(["read:core_banking", "read:ops_dashboards"]),
      baselineSnapshotJson: list(["read:core_banking", "read:ops_dashboards"]),
      baselineCategoriesJson: list(["identity", "financial"]),
      baselineApprovedBy: "A. Khan",
      baselineApprovedAt: daysAgo(200),
      lastReviewedAt: daysAgo(45),
    },
  });

  // The RBAC drift example: baseline of 12 permissions, current holds 15. The
  // three additions include write:dpa_records — a sensitive write, added six
  // weeks ago with no record of why. That single sensitive addition is what
  // pushes this from "minor" to "significant" drift.
  const complianceBaseline = [
    "read:consent_records",
    "read:notices",
    "read:purposes",
    "read:cookie_categories",
    "read:processing_activities",
    "read:dpa_records",
    "read:grievances",
    "read:audit_log",
    "read:data_inventory",
    "read:retention_schedule",
    "read:breach_register",
    "export:compliance_report",
  ];
  await prisma.rBACRole.create({
    data: {
      id: "role_compliance",
      name: "Compliance Reviewer",
      description: "Reviews compliance evidence across the platform.",
      permissionsJson: list([
        ...complianceBaseline,
        "read:pipeline_metadata",
        "read:support_tickets",
        "write:dpa_records",
      ]),
      baselineSnapshotJson: list(complianceBaseline),
      baselineCategoriesJson: list(["identity", "contact", "kyc", "financial"]),
      baselineApprovedBy: "A. Khan",
      baselineApprovedAt: daysAgo(200),
      // Never re-reviewed since the drift crept in — which is how it went
      // unnoticed for six weeks.
      lastReviewedAt: daysAgo(200),
    },
  });

  // -- Internal users -------------------------------------------------------
  const priya = await prisma.internalUser.create({
    data: {
      id: "iu_priya",
      fullName: "Priya Sharma",
      email: "priya.sharma@example.in",
      department: "Retail Lending",
      employmentStatus: "on_notice",
      joinedAt: daysAgo(1500),
      offboardingDueAt: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
    },
  });

  const vikram = await prisma.internalUser.create({
    data: {
      id: "iu_vikram",
      fullName: "Vikram Rao",
      email: "vikram.rao@example.in",
      department: "Data Platform",
      employmentStatus: "active",
      joinedAt: daysAgo(700),
    },
  });

  // Left the company seven months ago. Her CRM account is still active and
  // still has a live session — access that outlived the person.
  const anjali = await prisma.internalUser.create({
    data: {
      id: "iu_anjali",
      fullName: "Anjali Desai",
      email: "anjali.desai@example.in",
      department: "Growth",
      employmentStatus: "offboarded",
      joinedAt: daysAgo(1200),
      leftAt: daysAgo(210),
    },
  });

  const svc = await prisma.internalUser.create({
    data: {
      id: "iu_svc_etl",
      fullName: "svc-etl-nightly (service identity)",
      email: "svc-etl-nightly@example.in",
      department: "Data Platform",
      employmentStatus: "active",
      joinedAt: daysAgo(900),
    },
  });

  // -- Accounts -------------------------------------------------------------
  const account = async (
    id: string,
    userId: string,
    systemId: string,
    username: string,
    status: string,
    createdDaysAgo: number,
    lastActiveDaysAgo: number | null,
  ) =>
    prisma.systemAccount.create({
      data: {
        id,
        userId,
        systemId,
        username,
        status,
        createdAt: daysAgo(createdDaysAgo),
        lastActiveAt: lastActiveDaysAgo === null ? null : daysAgo(lastActiveDaysAgo),
      },
    });

  const priyaCore = await account("acc_priya_core", priya.id, coreBanking.id, "psharma", "active", 1400, 1);
  const priyaWarehouse = await account("acc_priya_wh", priya.id, warehouse.id, "priya.sharma", "active", 500, 3);
  const priyaMkt = await account("acc_priya_mkt", priya.id, marketing.id, "p.sharma", "active", 400, 12);

  const vikramWarehouse = await account("acc_vikram_wh", vikram.id, warehouse.id, "vikram.rao", "active", 650, 1);
  await account("acc_vikram_core", vikram.id, coreBanking.id, "vrao", "active", 600, 2);

  const anjaliCrm = await account("acc_anjali_crm", anjali.id, crm.id, "adesai", "active", 1100, 220);
  const svcWarehouse = await account("acc_svc_wh", svc.id, warehouse.id, "svc_etl_nightly", "active", 900, 400);

  // -- Grants ---------------------------------------------------------------
  const grant = async (
    accountId: string,
    roleId: string,
    categories: string[],
    grantedDaysAgo: number,
    expiresAt: Date | null = null,
  ) =>
    prisma.accessGrant.create({
      data: {
        accountId,
        roleId,
        scopeCategoriesJson: list(categories),
        grantedAt: daysAgo(grantedDaysAgo),
        grantedByActorId: admin.id,
        expiresAt,
      },
    });

  await grant(priyaCore.id, roleBranch.id, ["identity", "contact", "financial"], 1400);
  await grant(priyaWarehouse.id, roleEngineer.id, ["behavioural"], 500);
  // Over-broad: the Support Agent baseline covers identity/contact/support, but
  // this grant reaches marketing data too. Seeded directly, because
  // `grantAccess` would refuse to create it — which is the point.
  await grant(priyaMkt.id, roleSupport.id, ["identity", "contact", "marketing"], 400);

  await grant(vikramWarehouse.id, roleEngineer.id, ["behavioural"], 650);
  await grant(anjaliCrm.id, roleSupport.id, ["identity", "contact", "support"], 1100);
  await grant(svcWarehouse.id, roleEngineer.id, ["behavioural"], 900);

  // -- Live sessions and tokens --------------------------------------------
  const session = async (
    accountId: string,
    kind: string,
    tokenRef: string,
    startedDaysAgo: number,
    lastSeenDaysAgo: number,
    expiresInDays: number | null,
  ) =>
    prisma.activeSession.create({
      data: {
        accountId,
        kind,
        tokenRef,
        startedAt: daysAgo(startedDaysAgo),
        lastSeenAt: daysAgo(lastSeenDaysAgo),
        expiresAt:
          expiresInDays === null
            ? null
            : new Date(NOW.getTime() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

  // These two survive the warehouse revocation, making it partial.
  await session(priyaWarehouse.id, "api_token", "tok_7f3a91c4", 120, 3, 240);
  await session(priyaWarehouse.id, "refresh_token", "rt_2b88ce10", 60, 3, 90);

  // A revocation that was dispatched but did not fully take: the Data Warehouse
  // (degraded) removed the roles but its session store did not respond, so two
  // tokens remain valid. This is the residual-access state the Verification tab
  // exists to surface — "Access still active" 20 minutes after the revoke was
  // triggered, resolvable by a retry or, if the vendor is at fault, an escalation.
  await prisma.revocationRecord.create({
    data: {
      accountId: priyaWarehouse.id,
      batchId: "batch_seed_resid",
      status: "partial",
      mode: "api",
      grantsRevoked: 1,
      sessionsKilled: 0,
      sessionsRemaining: 2,
      dispatchedAt: new Date(NOW.getTime() - 20 * 60 * 1000),
      confirmedAt: null,
      failureDetail:
        "Roles were removed, but the session store did not respond, so existing " +
        "tokens remain valid until they expire.",
      attempt: 1,
    },
  });
  await session(priyaCore.id, "session", "sess_a41f0092", 1, 1, 1);
  await session(vikramWarehouse.id, "api_token", "tok_9d2e77b1", 200, 1, 300);
  // Anjali left 210 days ago; this token is still valid.
  await session(anjaliCrm.id, "refresh_token", "rt_5c19ab33", 230, 220, 400);
  await session(svcWarehouse.id, "api_token", "tok_e08b4416", 900, 400, 1000);

  // -- Provisioning request queue -------------------------------------------
  // Access requests awaiting a grant. A request is not a grant: it sits here
  // until Admin applies a least-privilege template and executes it. The queue
  // shows the full three-state spread — pending, granted, and a failed one with
  // a retryable per-system error.
  const provReq = async (
    id: string,
    requesterName: string,
    requesterDept: string,
    source: string,
    roleId: string,
    roleRequested: string,
    status: string,
    requestedDaysAgo: number,
    systems: { system: string; level: string; status: string; outcome?: string; reason?: string | null }[],
    broadenedJustification: string | null = null,
  ) =>
    prisma.provisioningRequest.create({
      data: {
        id,
        requesterName,
        requesterDept,
        source,
        roleId,
        roleRequested,
        status,
        requestedAt: daysAgo(requestedDaysAgo),
        systemsJson: JSON.stringify(systems),
        broadenedJustification,
        executedAt: status === "pending" ? null : daysAgo(requestedDaysAgo),
      },
    });

  // Arjun Mehta — new hire, HR-sync triggered, Standard Analyst template.
  // Core Banking (read) + Finance File Share (read); no Legacy Loan Archive.
  await provReq(
    "pr_arjun",
    "Arjun Mehta",
    "Retail Analytics",
    "hr_sync",
    roleAnalyst.id,
    "Standard Analyst",
    "pending",
    1,
    [
      { system: "Core Banking DB", level: "read", status: "pending", outcome: "ok" },
      { system: "Finance File Share", level: "read", status: "pending", outcome: "ok" },
    ],
  );

  // Priya Iyer — manual request needing read/write on Core Banking, beyond the
  // Standard Analyst template. Broadened, so a justification is on record.
  await provReq(
    "pr_priya_iyer",
    "Priya Iyer",
    "Finance Operations",
    "manual",
    roleAnalyst.id,
    "Standard Analyst",
    "pending",
    2,
    [
      { system: "Core Banking DB", level: "read/write", status: "pending", outcome: "ok" },
      { system: "Finance File Share", level: "read", status: "pending", outcome: "ok" },
    ],
    "Handles reconciliation exceptions requiring write access to correct transaction records.",
  );

  // Rohan Gupta — HR-sync, Ops — Read Only, already granted cleanly.
  await provReq(
    "pr_rohan",
    "Rohan Gupta",
    "Operations",
    "hr_sync",
    "role_ops_ro",
    "Ops — Read Only",
    "granted",
    6,
    [
      { system: "Core Banking DB", level: "read", status: "granted", outcome: "ok" },
      { system: "Ops Dashboards", level: "read", status: "granted", outcome: "ok" },
    ],
  );

  // Neha Kulkarni — manual, Standard Analyst, one system failed to grant: the
  // target account does not exist in the Finance File Share yet. Retryable on
  // its own, independent of the Core Banking grant that already succeeded.
  await provReq(
    "pr_neha",
    "Neha Kulkarni",
    "Retail Lending",
    "manual",
    roleAnalyst.id,
    "Standard Analyst",
    "failed",
    3,
    [
      { system: "Core Banking DB", level: "read", status: "granted", outcome: "ok" },
      {
        system: "Finance File Share",
        level: "read",
        status: "failed",
        outcome: "fail",
        reason: "target account does not exist in this system",
      },
    ],
  );

  // -- Onboarding state -----------------------------------------------------
  // An org past the mandatory gate, with two technical steps deferred.
  //
  // This is the middle case and the most realistic one: escalation routing is
  // set, so the route guard lets the console load, while the deferred steps stay
  // visible on the setup strip. Seeding a fresh org instead would send every
  // page straight to the wizard, and seeding a fully-finished one would hide the
  // deferral behaviour entirely.
  // =========================================================================
  // Data Discovery & Classification
  //
  // Sources cover every coverage state, because "never scanned" and "stale" are
  // different problems needing different follow-up and the Overview has to show
  // them apart.
  // =========================================================================

  const srcCore = await prisma.discoverySource.create({
    data: {
      id: "src_core",
      name: "Core Banking DB",
      kind: "database",
      connectionState: "connected",
      dpoApprovedForScanning: true,
      scanStatus: "scanned",
      lastScanned: daysAgo(3),
      scanSchedule: "weekly",
      scanDepth: "standard",
      entityId: "retail",
    },
  });
  const srcCrm = await prisma.discoverySource.create({
    data: {
      id: "src_crm",
      name: "Salesforce CRM",
      kind: "saas",
      connectionState: "connected",
      dpoApprovedForScanning: true,
      scanStatus: "scanned",
      // Past the 30-day staleness threshold: a maintenance gap.
      lastScanned: daysAgo(52),
      scanSchedule: "monthly",
      scanDepth: "standard",
      entityId: "retail",
    },
  });
  const srcShare = await prisma.discoverySource.create({
    data: {
      id: "src_share",
      name: "Finance File Share",
      kind: "file_share",
      connectionState: "connected",
      dpoApprovedForScanning: true,
      scanStatus: "partial",
      lastScanned: daysAgo(9),
      scanSchedule: "monthly",
      scanDepth: "shallow",
      offPeakWindow: "22:00-05:00",
      entityId: "corporate",
    },
  });
  // Approved but never run: a SETUP gap, shown distinctly from stale.
  const srcWarehouse = await prisma.discoverySource.create({
    data: {
      id: "src_warehouse",
      name: "Data Warehouse (Snowflake)",
      kind: "database",
      connectionState: "connected",
      dpoApprovedForScanning: true,
      scanStatus: "pending",
      lastScanned: null,
      scanSchedule: "on_demand",
      scanDepth: "standard",
      entityId: "corporate",
    },
  });
  // Connected, but scope not approved: the governance boundary, visible here
  // and everywhere else this source appears.
  await prisma.discoverySource.create({
    data: {
      id: "src_legacy",
      name: "Legacy Loan Archive",
      kind: "other",
      connectionState: "connected",
      dpoApprovedForScanning: false,
      requiresManualVerification: true,
      scanStatus: "pending",
      entityId: "retail",
    },
  });
  const srcMkt = await prisma.discoverySource.create({
    data: {
      id: "src_mkt",
      name: "Marketing Automation",
      kind: "saas",
      connectionState: "failed",
      failureCode: "ERR_AUTH_EXPIRED",
      failureDetail:
        "The stored API credentials were rejected. The integration token expired on 2026-08-21.",
      connectionHint: "Issue a new API token in the vendor console and update it under Integrations.",
      dpoApprovedForScanning: true,
      scanStatus: "failed",
      lastScanned: daysAgo(21),
      scanSchedule: "weekly",
      scanDepth: "standard",
      entityId: "retail",
    },
  });

  // -- Scan history ---------------------------------------------------------
  const stages = (upTo: string | null, failed = false) => {
    const all = ["connect", "enumerate", "sample", "classify", "reconcile"];
    const idx = upTo ? all.indexOf(upTo) : all.length;
    return JSON.stringify(
      all.map((stage, i) => ({
        stage,
        state: i < idx ? "done" : i === idx ? (failed ? "failed" : "done") : "pending",
      })),
    );
  };

  await prisma.scanRun.createMany({
    data: [
      { sourceId: srcCore.id, status: "completed", startedAt: daysAgo(31), completedAt: daysAgo(31), stagesJson: stages(null), fieldsFound: 108 },
      { sourceId: srcCore.id, status: "completed", startedAt: daysAgo(17), completedAt: daysAgo(17), stagesJson: stages(null), fieldsFound: 112 },
      { sourceId: srcCore.id, status: "completed", startedAt: daysAgo(3), completedAt: daysAgo(3), stagesJson: stages(null), fieldsFound: 119, fieldsNew: 7 },
      { sourceId: srcCrm.id, status: "completed", startedAt: daysAgo(52), completedAt: daysAgo(52), stagesJson: stages(null), fieldsFound: 64 },
      {
        sourceId: srcShare.id,
        status: "partial",
        startedAt: daysAgo(9),
        completedAt: daysAgo(9),
        stagesJson: stages("enumerate"),
        fieldsFound: 41,
        failureStage: "enumerate",
        failureReason:
          "Enumeration timed out after 45 minutes with roughly a third of the share still unread. What was read has been classified.",
        failureAction:
          "Set an off-peak window in Scan Config and re-run, or reduce scan depth to shallow for a first pass.",
      },
      {
        sourceId: srcMkt.id,
        status: "failed",
        startedAt: daysAgo(21),
        completedAt: daysAgo(21),
        stagesJson: stages("connect", true),
        fieldsFound: 0,
        failureStage: "connect",
        failureReason:
          "The stored API credentials were rejected. The integration token expired on 2026-08-21.",
        failureAction:
          "Issue a new API token in the vendor console, update it under Integrations, then re-run the scan.",
      },
    ],
  });

  // -- Classified fields ----------------------------------------------------
  const field = (
    id: string,
    sourceId: string,
    fieldPath: string,
    detectedType: string,
    confidence: string,
    maskedSample: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    sourceId,
    fieldPath,
    detectedType,
    confidence,
    maskedSample,
    ...extra,
  });

  await prisma.classifiedField.createMany({
    data: [
      // Settled inventory rows.
      field("cf_pan", srcCore.id, "customer.pan", "PAN", "high", "ABC***234F", {
        reviewState: "approved", category: "kyc", sensitivityTier: "high",
        purposeTagId: "pt_regulatory", dataSubjectType: "customer",
        lastVerified: daysAgo(3), catalogSyncStatus: "synced",
      }),
      field("cf_email", srcCore.id, "customer.email", "Email", "high", "m****@example.in", {
        reviewState: "approved", category: "contact", sensitivityTier: "medium",
        purposeTagId: "pt_servicing", dataSubjectType: "customer",
        lastVerified: daysAgo(3), catalogSyncStatus: "synced",
      }),
      field("cf_balance", srcCore.id, "account.balance", "Currency", "high", "₹**,***", {
        reviewState: "approved", category: "financial", sensitivityTier: "high",
        purposeTagId: "pt_servicing", dataSubjectType: "customer",
        lastVerified: daysAgo(3), catalogSyncStatus: "synced",
      }),
      // No purpose tag: flagged in the inventory, not left blank.
      field("cf_dob", srcCore.id, "customer.dob", "Date of birth", "high", "19**-**-14", {
        reviewState: "approved", category: "identity", sensitivityTier: "high",
        dataSubjectType: "customer", lastVerified: daysAgo(3),
        catalogSyncStatus: "pending",
      }),
      field("cf_phone_crm", srcCrm.id, "contact.mobile", "Phone", "high", "+91 98*** **34", {
        reviewState: "approved", category: "contact", sensitivityTier: "medium",
        purposeTagId: "pt_servicing", dataSubjectType: "customer",
        lastVerified: daysAgo(52), catalogSyncStatus: "synced",
      }),
      // DRIFT: previously classified as a free-text note, now reads as a PAN.
      // Different problem from a never-classified field, and flagged as such.
      field("cf_drift", srcCrm.id, "contact.notes", "PAN", "needs_review", "…ABC***234F…", {
        category: "kyc", sensitivityTier: "high", dataSubjectType: "customer",
        driftFlag: true, previousType: "Free text",
        catalogSyncStatus: "not_configured",
      }),
      // Needs review.
      field("cf_ref", srcCrm.id, "contact.external_ref", "Customer ID", "needs_review", "CUST-4****0", {
        category: "identity", sensitivityTier: "low", dataSubjectType: "customer",
      }),
      field("cf_notes2", srcShare.id, "payroll_2024.xlsx:col_G", "Aadhaar", "needs_review", "XXXX XXXX 4412", {
        category: "kyc", sensitivityTier: "high", dataSubjectType: "employee",
      }),
      field("cf_salary", srcShare.id, "payroll_2024.xlsx:col_D", "Currency", "high", "₹**,***", {
        reviewState: "approved", category: "financial", sensitivityTier: "high",
        purposeTagId: "pt_servicing", dataSubjectType: "employee",
        lastVerified: daysAgo(9), catalogSyncStatus: "failed",
      }),
      // Duplicate candidates.
      field("cf_dup_a", srcCore.id, "customer.mobile_no", "Phone", "high", "+91 98*** **34", {
        reviewState: "approved", category: "contact", sensitivityTier: "medium",
        purposeTagId: "pt_servicing", dataSubjectType: "customer",
        lastVerified: daysAgo(3), catalogSyncStatus: "synced",
      }),
      field("cf_dup_b", srcCrm.id, "contact.phone_primary", "Phone", "high", "+91 98*** **34", {
        reviewState: "approved", category: "contact", sensitivityTier: "medium",
        purposeTagId: "pt_servicing", dataSubjectType: "customer",
        lastVerified: daysAgo(52), catalogSyncStatus: "synced",
      }),
      // ROT candidates.
      field("cf_rot_old", srcShare.id, "archive_2019/leads_export.csv", "Email", "high", "j****@example.in", {
        reviewState: "approved", category: "marketing", sensitivityTier: "medium",
        dataSubjectType: "customer", lastVerified: daysAgo(9),
        catalogSyncStatus: "not_configured",
      }),
      field("cf_rot_tmp", srcShare.id, "tmp/export_backup_copy.csv", "Email", "high", "a****@example.in", {
        reviewState: "approved", category: "marketing", sensitivityTier: "low",
        dataSubjectType: "customer", lastVerified: daysAgo(9),
        catalogSyncStatus: "not_configured",
      }),
      // New PII found on the most recent scan.
      field("cf_newpii", srcCore.id, "support.ticket_body", "Aadhaar", "needs_review", "XXXX XXXX 9013", {
        category: "kyc", sensitivityTier: "high", dataSubjectType: "customer",
      }),
      // Quarantined.
      field("cf_quar", srcShare.id, "unsecured/customer_dump.csv", "PAN", "high", "ABC***234F", {
        reviewState: "approved", category: "kyc", sensitivityTier: "high",
        dataSubjectType: "customer", lastVerified: daysAgo(9),
        catalogSyncStatus: "not_configured",
      }),
    ],
  });

  // -- Duplicates and ROT ---------------------------------------------------
  const dupPair = await prisma.duplicatePair.create({
    data: {
      id: "dup_phone",
      fieldAId: "cf_dup_a",
      fieldBId: "cf_dup_b",
      similarityScore: 96,
      createdAt: daysAgo(3),
    },
  });
  // A deliberately weaker match: the case where "keep both" is the right answer
  // and merging would quietly destroy a real distinction.
  const dupWeak = await prisma.duplicatePair.create({
    data: {
      id: "dup_weak",
      fieldAId: "cf_email",
      fieldBId: "cf_rot_old",
      similarityScore: 71,
      createdAt: daysAgo(3),
    },
  });

  await prisma.rOTCandidate.createMany({
    data: [
      {
        id: "rot_2019",
        fieldId: "cf_rot_old",
        businessValueScore: 8,
        lastAccessed: daysAgo(1400),
        reason: "Marketing export from 2019; no access in nearly four years.",
      },
      {
        id: "rot_tmp",
        fieldId: "cf_rot_tmp",
        businessValueScore: 3,
        lastAccessed: daysAgo(700),
        reason: "Backup copy of a file that already exists elsewhere on the share.",
      },
    ],
  });

  // -- Triage items ---------------------------------------------------------
  // One row per underlying record, in its primary category. The phone field is
  // both low-confidence-adjacent and half of a duplicate pair; it appears once,
  // under Duplicates, with a cross-reference rather than in both tabs.
  await prisma.triageItem.createMany({
    data: [
      { id: "tr_drift", type: "low_confidence", fieldId: "cf_drift", priority: "high", createdAt: daysAgo(3), note: "Reclassified from free text to PAN since the last scan." },
      { id: "tr_ref", type: "low_confidence", fieldId: "cf_ref", priority: "low", createdAt: daysAgo(52) },
      { id: "tr_aadhaar_share", type: "low_confidence", fieldId: "cf_notes2", priority: "high", createdAt: daysAgo(9) },
      { id: "tr_newpii", type: "new_pii", fieldId: "cf_newpii", priority: "high", createdAt: daysAgo(3), note: "Aadhaar numbers found in free-text support tickets." },
      { id: "tr_newpii2", type: "new_pii", fieldId: "cf_notes2", priority: "medium", createdAt: daysAgo(9), crossRefType: "low_confidence" },
      { id: "tr_rot1", type: "rot", fieldId: "cf_rot_old", priority: "medium", createdAt: daysAgo(9) },
      { id: "tr_rot2", type: "rot", fieldId: "cf_rot_tmp", priority: "low", createdAt: daysAgo(9) },
      { id: "tr_dup1", type: "duplicate", duplicatePairId: dupPair.id, priority: "medium", createdAt: daysAgo(3) },
      { id: "tr_dup2", type: "duplicate", duplicatePairId: dupWeak.id, priority: "low", createdAt: daysAgo(3) },
      { id: "tr_quar", type: "quarantine", fieldId: "cf_quar", priority: "high", createdAt: daysAgo(9), note: "PAN data found in an unsecured share directory." },
    ],
  });

  // Upsert, not create: the app lazily creates this singleton on first read, so
  // a running server can recreate the row between the reset and this write.
  const onboarding = {
    currentStep: 7,
    startedAt: daysAgo(40),
    // Step 3 is `done` because scan history exists: leaving it skipped would
    // put "nothing has been scanned" on the dashboard next to six completed
    // scan runs. Only notification routing stays deferred, so the setup strip
    // still demonstrates a live deferral without contradicting the data.
    stepStatusJson: JSON.stringify({
      "1": "done",
      "2": "done",
      "3": "done",
      "4": "done",
      "5": "done",
      "6": "skipped",
    }),
    escalationContactActorId: dpo.id,
    backupContactActorId: admin.id,
    retentionCategoriesAcknowledged: true,
  };
  await prisma.onboardingState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...onboarding },
    update: onboarding,
  });

  // -- Processing activities (hand-entered records) ------------------------
  // =========================================================================
  // Consent & Notices
  // =========================================================================

  // -- Notices --------------------------------------------------------------
  const noticePrivacy = await prisma.notice.create({
    data: {
      id: "notice_privacy",
      name: "Customer Privacy Notice",
      status: "published",
      currentVersion: "v3.1",
      origin: "template",
      content:
        "We collect and process your personal data to open and service your " +
        "accounts, meet our KYC and regulatory obligations, and prevent fraud…",
      regionsJson: JSON.stringify(["IN", "IN-MH", "IN-KA"]),
      notifyOnChange: true,
    },
  });
  await prisma.noticeRevision.createMany({
    data: [
      { noticeId: "notice_privacy", version: "v3.0", content: "…", note: "Added fraud-prevention purpose.", savedBy: "R. Iyer", savedAt: daysAgo(120) },
      { noticeId: "notice_privacy", version: "v3.1", content: "…", note: "Reworded retention section for clarity.", savedBy: "R. Iyer", savedAt: daysAgo(30) },
    ],
  });
  await prisma.noticeVariant.createMany({
    data: [
      { noticeId: "notice_privacy", language: "en", content: "We collect and process your personal data…" },
      { noticeId: "notice_privacy", language: "hi", content: "हम आपके व्यक्तिगत डेटा को एकत्र और संसाधित करते हैं…" },
      { noticeId: "notice_privacy", language: "mr", content: "आम्ही तुमचा वैयक्तिक डेटा संकलित करतो…" },
    ],
  });
  await prisma.notice.create({
    data: {
      id: "notice_cookie",
      name: "Cookie Notice",
      status: "published",
      currentVersion: "v1.2",
      origin: "template",
      regionsJson: JSON.stringify(["IN"]),
    },
  });
  await prisma.notice.create({
    data: {
      id: "notice_marketing",
      name: "Marketing Consent Notice",
      status: "draft",
      currentVersion: "v0.3",
      origin: "scratch",
      regionsJson: JSON.stringify([]),
    },
  });

  // -- Cookie scripts (mapped to the governance-owned categories) -----------
  const cookieCats = await prisma.cookieCategory.findMany();
  const catByName = (n: string) => cookieCats.find((c) => c.name.toLowerCase().includes(n.toLowerCase()))?.id ?? null;
  await prisma.cookieScript.createMany({
    data: [
      { name: "Google Analytics", vendor: "Google", page: "/", categoryId: catByName("analyt") },
      { name: "Hotjar", vendor: "Hotjar", page: "/dashboard", categoryId: catByName("analyt") },
      { name: "Meta Pixel", vendor: "Meta", page: "/offers", categoryId: catByName("market") },
      { name: "Session cookie", vendor: "First-party", page: "/", categoryId: catByName("necess") ?? catByName("strict") },
    ],
  });
  await prisma.cookieScanFinding.createMany({
    data: [
      { scriptName: "LinkedIn Insight Tag", vendor: "LinkedIn", page: "/careers", disclosed: false, status: "open", suggestedCategory: "Marketing", firstSeen: daysAgo(2) },
      { scriptName: "Intercom", vendor: "Intercom", page: "/support", disclosed: false, status: "open", suggestedCategory: "Functional", firstSeen: daysAgo(5) },
      { scriptName: "Google Analytics", vendor: "Google", page: "/", disclosed: true, status: "categorised", suggestedCategory: "Analytics", firstSeen: daysAgo(40) },
    ],
  });

  // -- Webhooks -------------------------------------------------------------
  await prisma.webhook.createMany({
    data: [
      { endpoint: "https://hooks.meridianfin.in/consent", event: "consent.granted", status: "active", lastTestAt: daysAgo(3), lastTestResult: "200 OK" },
      { endpoint: "https://hooks.meridianfin.in/consent", event: "consent.withdrawn", status: "active", lastTestAt: daysAgo(3), lastTestResult: "200 OK" },
      { endpoint: "https://crm.example.in/webhooks/notice", event: "notice.published", status: "failing", lastTestAt: daysAgo(1), lastTestResult: "503 Service Unavailable" },
    ],
  });

  // -- Consent API config (singleton) --------------------------------------
  await prisma.consentApiConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      apiEndpoint: "https://consent.meridianfin.in/api/v2",
      preferenceCenterBrand: "Meridian Financial",
      businessUnitIsolation: true,
      defaultExpiryMonths: 24,
    },
    update: {},
  });

  // -- Consent records (one model, channel-origin tag) ----------------------
  await prisma.consentRecord.createMany({
    data: [
      { subjectRef: "CUST-449120", purposeTagId: "pt_marketing", channelOrigin: "digital", status: "granted", artifactHash: "sha256:9f2a…c4", collectedAt: daysAgo(60), expiresAt: new Date(NOW.getTime() + 700 * 86400000), syncStatus: "synced" },
      { subjectRef: "CUST-772301", purposeTagId: "pt_servicing", channelOrigin: "digital", status: "granted", artifactHash: "sha256:11bd…07", collectedAt: daysAgo(200), syncStatus: "synced" },
      { subjectRef: "CUST-889100", purposeTagId: "pt_marketing", channelOrigin: "branch", status: "granted", artifactHash: "sha256:44ce…9a", collectedAt: daysAgo(1), syncStatus: "synced", idVerification: "PAN card + staff witness" },
      { subjectRef: "CUST-889233", purposeTagId: "pt_marketing", channelOrigin: "branch", status: "granted", collectedAt: daysAgo(0), syncStatus: "pending", idVerification: "Aadhaar (masked) + staff witness" },
      { subjectRef: "CUST-889401", purposeTagId: "pt_servicing", channelOrigin: "branch", status: "granted", collectedAt: daysAgo(0), syncStatus: "failed", idVerification: "Passport + staff witness" },
      { subjectRef: "CUST-771002", purposeTagId: "pt_marketing", channelOrigin: "phone", status: "withdrawn", collectedAt: daysAgo(15), syncStatus: "synced" },
    ],
  });

  await prisma.processingActivity.createMany({
    data: [
      {
        activity: "Pre-approved loan offers to existing customers",
        purposeTagId: "pt_marketing",
        subjectType: "customer",
        dataElementsJson: JSON.stringify(["customer.email", "customer.mobile_no", "account.balance"]),
        origin: "manual",
      },
      {
        activity: "Branch staff attendance register",
        purposeTagId: "pt_servicing",
        subjectType: "employee",
        dataElementsJson: JSON.stringify(["staff_name", "biometric_id"]),
        origin: "csv",
      },
    ],
  });

  const counts = {
    actors: await prisma.actor.count(),
    systems: await prisma.connectedSystem.count(),
    processors: await prisma.dataProcessor.count(),
    principals: await prisma.dataPrincipal.count(),
    requests: await prisma.dataPrincipalRequest.count(),
    locations: await prisma.dataLocation.count(),
    exceptions: await prisma.retentionException.count(),
    executions: await prisma.executionRecord.count(),
    internalUsers: await prisma.internalUser.count(),
    accounts: await prisma.systemAccount.count(),
    grants: await prisma.accessGrant.count(),
    sessions: await prisma.activeSession.count(),
    roles: await prisma.rBACRole.count(),
  };
  console.log("Seeded:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
