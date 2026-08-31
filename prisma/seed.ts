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
    "RBACRole",
    "ClassifiedField",
    "DiscoverySource",
    "NotificationRoute",
    "OnboardingState",
    "RetentionCategory",
    "PurposeTag",
    "NoticeVersion",
    "CookieCategory",
    "ProtectionRule",
    "DataFlowConnection",
    "DataFlowNode",
    "Entity",
    "Actor",
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );

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
      { notes: "Closed both accounts last month; asks for full erasure." },
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
      { name: "Account servicing", description: "Operating and servicing the customer's accounts.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
      { name: "Regulatory compliance", description: "Meeting KYC, AML and reporting obligations.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
      { name: "Fraud prevention", description: "Detecting and preventing fraudulent transactions.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
      { name: "Marketing communication", description: "Sending offers where consent has been given.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(150) },
      { name: "Service improvement", description: "Analysing usage to improve the service.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(150) },
      { name: "Grievance redressal", description: "Handling complaints and rights requests.", status: "approved", approvedBy: dpo.name, approvedAt: daysAgo(200) },
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
      { dataCategory: "kyc", ruleType: "encrypt", scope: "At rest, all systems", definition: "AES-256 with HSM-held keys.", approvedBy: "A. Khan", approvedAt: daysAgo(180) },
      { dataCategory: "financial", ruleType: "mask", scope: "All non-production environments", definition: "Account numbers masked to last four digits.", approvedBy: "A. Khan", approvedAt: daysAgo(180) },
      { dataCategory: "identity", ruleType: "mask", scope: "Support console", definition: "PAN and Aadhaar reference masked in the agent view.", approvedBy: "A. Khan", approvedAt: daysAgo(90) },
      { dataCategory: "kyc", ruleType: "dlp", scope: "Outbound email and file share", definition: "Block egress of KYC document scans.", approvedBy: "A. Khan", approvedAt: daysAgo(90) },
      { dataCategory: "behavioural", ruleType: "dlp", scope: "Third-party transfers", definition: "Block transfer outside processors named in a current DPA.", approvedBy: "A. Khan", approvedAt: daysAgo(60) },
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
  await session(priyaCore.id, "session", "sess_a41f0092", 1, 1, 1);
  await session(vikramWarehouse.id, "api_token", "tok_9d2e77b1", 200, 1, 300);
  // Anjali left 210 days ago; this token is still valid.
  await session(anjaliCrm.id, "refresh_token", "rt_5c19ab33", 230, 220, 400);
  await session(svcWarehouse.id, "api_token", "tok_e08b4416", 900, 400, 1000);

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
