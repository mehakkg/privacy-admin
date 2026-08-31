-- CreateTable
CREATE TABLE "Actor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataPrincipal" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrincipalIdentifier" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "assertedBy" TEXT,

    CONSTRAINT "PrincipalIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataPrincipalRequest" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "principalId" TEXT,
    "rawIdentifier" TEXT NOT NULL,
    "rawIdentifierKind" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "preNoticeDueAt" TIMESTAMP(3),
    "preNoticeSentAt" TIMESTAMP(3),
    "escalationSource" TEXT NOT NULL,
    "linkedGrievanceCaseId" TEXT,
    "requiresIdentityReview" BOOLEAN NOT NULL DEFAULT false,
    "identityNote" TEXT,
    "notes" TEXT,

    CONSTRAINT "DataPrincipalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedSystem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hasApi" BOOLEAN NOT NULL,
    "connectionStatus" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "delayDays" INTEGER,
    "ownerTeam" TEXT NOT NULL,

    CONSTRAINT "ConnectedSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataProcessor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dpaId" TEXT NOT NULL,
    "dpaScopeJson" TEXT NOT NULL,
    "contactChannel" TEXT NOT NULL,
    "dpaExpiresAt" TIMESTAMP(3),
    "dpaStatus" TEXT NOT NULL DEFAULT 'active',
    "subProcessorsJson" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "DataProcessor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataLocation" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "systemId" TEXT,
    "processorId" TEXT,
    "dataCategoriesJson" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "discoverySource" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DataLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRecord" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "systemId" TEXT,
    "processorId" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "excludedFieldsJson" TEXT NOT NULL DEFAULT '[]',
    "scheduledFor" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedByActorId" TEXT,
    "verificationMethod" TEXT,
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "failureRawResponse" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationChecklistItem" (
    "id" TEXT NOT NULL,
    "executionRecordId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "checkedByActorId" TEXT,
    "note" TEXT,

    CONSTRAINT "VerificationChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionException" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "requestId" TEXT,
    "dataCategory" TEXT NOT NULL,
    "fieldPathsJson" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "statuteRef" TEXT NOT NULL,
    "expiryCondition" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
    "autoFlagged" BOOLEAN NOT NULL DEFAULT true,
    "reviewedByActorId" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "RetentionException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "retentionExceptionId" TEXT,
    "sourceRole" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "contextJson" TEXT NOT NULL,
    "attachedEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "ruling" TEXT,
    "rulingRationale" TEXT,
    "ruledByActorId" TEXT,
    "ruledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "seq" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "requestId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "evidenceRef" TEXT,
    "payloadHash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "targetActorId" TEXT,
    "triggerEvent" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requestId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurposeTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurposeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedRegionsJson" TEXT NOT NULL,
    "languagesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoticeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookieCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultState" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CookieCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtectionRule" (
    "id" TEXT NOT NULL,
    "dataCategory" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalUser" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "employmentStatus" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "offboardingDueAt" TIMESTAMP(3),

    CONSTRAINT "InternalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "SystemAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeCategoriesJson" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "grantedByActorId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenRef" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "terminatedByActorId" TEXT,

    CONSTRAINT "ActiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevocationRecord" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "grantsRevoked" INTEGER NOT NULL DEFAULT 0,
    "sessionsKilled" INTEGER NOT NULL DEFAULT 0,
    "sessionsRemaining" INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedByActorId" TEXT,
    "verificationMethod" TEXT,
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "failureRawResponse" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevocationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDisposition" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "decidedByActorId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "stepStatusJson" TEXT NOT NULL DEFAULT '{}',
    "escalationContactActorId" TEXT,
    "backupContactActorId" TEXT,
    "scopedEntityId" TEXT,
    "governanceUnavailableAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "retentionCategoriesAcknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "retentionPeriod" TEXT NOT NULL,
    "statuteRef" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRoute" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "configuredAt" TIMESTAMP(3),

    CONSTRAINT "NotificationRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassifiedField" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "detectedType" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "maskedSample" TEXT NOT NULL,
    "reviewState" TEXT NOT NULL DEFAULT 'pending',
    "overriddenType" TEXT,
    "overrideReason" TEXT,
    "highConfidenceOverride" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByActorId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "category" TEXT,
    "sensitivityTier" TEXT NOT NULL DEFAULT 'medium',
    "purposeTagId" TEXT,
    "dataSubjectType" TEXT,
    "lastVerified" TIMESTAMP(3),
    "catalogSyncStatus" TEXT NOT NULL DEFAULT 'not_configured',
    "driftFlag" BOOLEAN NOT NULL DEFAULT false,
    "previousType" TEXT,

    CONSTRAINT "ClassifiedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriageItem" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fieldId" TEXT,
    "duplicatePairId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "crossRefType" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByActorId" TEXT,

    CONSTRAINT "TriageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicatePair" (
    "id" TEXT NOT NULL,
    "fieldAId" TEXT NOT NULL,
    "fieldBId" TEXT NOT NULL,
    "similarityScore" INTEGER NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT 'unresolved',
    "keptFieldId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByActorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicatePair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeStep" (
    "id" TEXT NOT NULL,
    "duplicatePairId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "referencesUpdated" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureDetail" TEXT,

    CONSTRAINT "MergeStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ROTCandidate" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "businessValueScore" INTEGER NOT NULL,
    "lastAccessed" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT 'unresolved',
    "resolutionReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByActorId" TEXT,

    CONSTRAINT "ROTCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverySource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'database',
    "connectionState" TEXT NOT NULL DEFAULT 'untested',
    "connectionHint" TEXT,
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "dpoApprovedForScanning" BOOLEAN NOT NULL DEFAULT false,
    "requiresManualVerification" BOOLEAN NOT NULL DEFAULT false,
    "scanStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastScanned" TIMESTAMP(3),
    "estimatedDurationMinutes" INTEGER,
    "classificationSummary" TEXT,
    "scanFailureDetail" TEXT,
    "scanSchedule" TEXT NOT NULL DEFAULT 'on_demand',
    "scanDepth" TEXT NOT NULL DEFAULT 'standard',
    "offPeakWindow" TEXT,
    "entityId" TEXT,

    CONSTRAINT "DiscoverySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "stagesJson" TEXT NOT NULL DEFAULT '[]',
    "fieldsFound" INTEGER NOT NULL DEFAULT 0,
    "fieldsNew" INTEGER NOT NULL DEFAULT 0,
    "fieldsChanged" INTEGER NOT NULL DEFAULT 0,
    "fieldsRemoved" INTEGER NOT NULL DEFAULT 0,
    "failureStage" TEXT,
    "failureReason" TEXT,
    "failureAction" TEXT,

    CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataFlowNode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "DataFlowNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataFlowConnection" (
    "id" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "dataCategoriesJson" TEXT NOT NULL,

    CONSTRAINT "DataFlowConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hierarchyParentId" TEXT,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RBACRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "systemId" TEXT,
    "permissionsJson" TEXT NOT NULL,
    "baselineSnapshotJson" TEXT NOT NULL,
    "baselineCategoriesJson" TEXT NOT NULL DEFAULT '[]',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "baselineApprovedBy" TEXT NOT NULL DEFAULT 'A. Khan',
    "baselineApprovedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RBACRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Actor_email_key" ON "Actor"("email");

-- CreateIndex
CREATE INDEX "PrincipalIdentifier_kind_value_idx" ON "PrincipalIdentifier"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "DataPrincipalRequest_referenceCode_key" ON "DataPrincipalRequest"("referenceCode");

-- CreateIndex
CREATE INDEX "DataPrincipalRequest_status_idx" ON "DataPrincipalRequest"("status");

-- CreateIndex
CREATE INDEX "DataPrincipalRequest_slaDeadline_idx" ON "DataPrincipalRequest"("slaDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedSystem_name_key" ON "ConnectedSystem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DataProcessor_name_key" ON "DataProcessor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DataProcessor_dpaId_key" ON "DataProcessor"("dpaId");

-- CreateIndex
CREATE INDEX "DataLocation_principalId_idx" ON "DataLocation"("principalId");

-- CreateIndex
CREATE INDEX "ExecutionRecord_requestId_idx" ON "ExecutionRecord"("requestId");

-- CreateIndex
CREATE INDEX "ExecutionRecord_status_idx" ON "ExecutionRecord"("status");

-- CreateIndex
CREATE INDEX "VerificationChecklistItem_executionRecordId_idx" ON "VerificationChecklistItem"("executionRecordId");

-- CreateIndex
CREATE INDEX "RetentionException_principalId_idx" ON "RetentionException"("principalId");

-- CreateIndex
CREATE INDEX "RetentionException_reviewStatus_idx" ON "RetentionException"("reviewStatus");

-- CreateIndex
CREATE INDEX "Escalation_status_idx" ON "Escalation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLogEntry_id_key" ON "AuditLogEntry"("id");

-- CreateIndex
CREATE INDEX "AuditLogEntry_requestId_idx" ON "AuditLogEntry"("requestId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_targetType_targetId_idx" ON "AuditLogEntry"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_action_idx" ON "AuditLogEntry"("action");

-- CreateIndex
CREATE INDEX "Notification_targetRole_idx" ON "Notification"("targetRole");

-- CreateIndex
CREATE UNIQUE INDEX "PurposeTag_name_key" ON "PurposeTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeVersion_version_key" ON "NoticeVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "CookieCategory_name_key" ON "CookieCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InternalUser_email_key" ON "InternalUser"("email");

-- CreateIndex
CREATE INDEX "SystemAccount_userId_idx" ON "SystemAccount"("userId");

-- CreateIndex
CREATE INDEX "SystemAccount_status_idx" ON "SystemAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SystemAccount_systemId_username_key" ON "SystemAccount"("systemId", "username");

-- CreateIndex
CREATE INDEX "AccessGrant_accountId_idx" ON "AccessGrant"("accountId");

-- CreateIndex
CREATE INDEX "ActiveSession_accountId_idx" ON "ActiveSession"("accountId");

-- CreateIndex
CREATE INDEX "RevocationRecord_batchId_idx" ON "RevocationRecord"("batchId");

-- CreateIndex
CREATE INDEX "RevocationRecord_status_idx" ON "RevocationRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDisposition_accountId_key" ON "AccountDisposition"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionCategory_name_key" ON "RetentionCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRoute_eventType_key" ON "NotificationRoute"("eventType");

-- CreateIndex
CREATE INDEX "ClassifiedField_sourceId_idx" ON "ClassifiedField"("sourceId");

-- CreateIndex
CREATE INDEX "ClassifiedField_confidence_idx" ON "ClassifiedField"("confidence");

-- CreateIndex
CREATE INDEX "ClassifiedField_category_idx" ON "ClassifiedField"("category");

-- CreateIndex
CREATE INDEX "ClassifiedField_purposeTagId_idx" ON "ClassifiedField"("purposeTagId");

-- CreateIndex
CREATE INDEX "TriageItem_type_status_idx" ON "TriageItem"("type", "status");

-- CreateIndex
CREATE INDEX "TriageItem_createdAt_idx" ON "TriageItem"("createdAt");

-- CreateIndex
CREATE INDEX "DuplicatePair_resolution_idx" ON "DuplicatePair"("resolution");

-- CreateIndex
CREATE INDEX "MergeStep_duplicatePairId_idx" ON "MergeStep"("duplicatePairId");

-- CreateIndex
CREATE UNIQUE INDEX "ROTCandidate_fieldId_key" ON "ROTCandidate"("fieldId");

-- CreateIndex
CREATE INDEX "ROTCandidate_resolution_idx" ON "ROTCandidate"("resolution");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverySource_name_key" ON "DiscoverySource"("name");

-- CreateIndex
CREATE INDEX "ScanRun_sourceId_idx" ON "ScanRun"("sourceId");

-- CreateIndex
CREATE INDEX "ScanRun_status_idx" ON "ScanRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RBACRole_name_key" ON "RBACRole"("name");

-- AddForeignKey
ALTER TABLE "PrincipalIdentifier" ADD CONSTRAINT "PrincipalIdentifier_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataPrincipalRequest" ADD CONSTRAINT "DataPrincipalRequest_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "DataPrincipal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataLocation" ADD CONSTRAINT "DataLocation_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataLocation" ADD CONSTRAINT "DataLocation_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ConnectedSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataLocation" ADD CONSTRAINT "DataLocation_processorId_fkey" FOREIGN KEY ("processorId") REFERENCES "DataProcessor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataPrincipalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ConnectedSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_processorId_fkey" FOREIGN KEY ("processorId") REFERENCES "DataProcessor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRecord" ADD CONSTRAINT "ExecutionRecord_confirmedByActorId_fkey" FOREIGN KEY ("confirmedByActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationChecklistItem" ADD CONSTRAINT "VerificationChecklistItem_executionRecordId_fkey" FOREIGN KEY ("executionRecordId") REFERENCES "ExecutionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationChecklistItem" ADD CONSTRAINT "VerificationChecklistItem_checkedByActorId_fkey" FOREIGN KEY ("checkedByActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionException" ADD CONSTRAINT "RetentionException_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "DataPrincipal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionException" ADD CONSTRAINT "RetentionException_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataPrincipalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionException" ADD CONSTRAINT "RetentionException_reviewedByActorId_fkey" FOREIGN KEY ("reviewedByActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataPrincipalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_retentionExceptionId_fkey" FOREIGN KEY ("retentionExceptionId") REFERENCES "RetentionException"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_ruledByActorId_fkey" FOREIGN KEY ("ruledByActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_targetActorId_fkey" FOREIGN KEY ("targetActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataPrincipalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccount" ADD CONSTRAINT "SystemAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "InternalUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAccount" ADD CONSTRAINT "SystemAccount_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ConnectedSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SystemAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RBACRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveSession" ADD CONSTRAINT "ActiveSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SystemAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevocationRecord" ADD CONSTRAINT "RevocationRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SystemAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDisposition" ADD CONSTRAINT "AccountDisposition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SystemAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_escalationContactActorId_fkey" FOREIGN KEY ("escalationContactActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_backupContactActorId_fkey" FOREIGN KEY ("backupContactActorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassifiedField" ADD CONSTRAINT "ClassifiedField_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DiscoverySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassifiedField" ADD CONSTRAINT "ClassifiedField_purposeTagId_fkey" FOREIGN KEY ("purposeTagId") REFERENCES "PurposeTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageItem" ADD CONSTRAINT "TriageItem_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ClassifiedField"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageItem" ADD CONSTRAINT "TriageItem_duplicatePairId_fkey" FOREIGN KEY ("duplicatePairId") REFERENCES "DuplicatePair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicatePair" ADD CONSTRAINT "DuplicatePair_fieldAId_fkey" FOREIGN KEY ("fieldAId") REFERENCES "ClassifiedField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicatePair" ADD CONSTRAINT "DuplicatePair_fieldBId_fkey" FOREIGN KEY ("fieldBId") REFERENCES "ClassifiedField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeStep" ADD CONSTRAINT "MergeStep_duplicatePairId_fkey" FOREIGN KEY ("duplicatePairId") REFERENCES "DuplicatePair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeStep" ADD CONSTRAINT "MergeStep_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "ConnectedSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ROTCandidate" ADD CONSTRAINT "ROTCandidate_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ClassifiedField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRun" ADD CONSTRAINT "ScanRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DiscoverySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataFlowConnection" ADD CONSTRAINT "DataFlowConnection_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "DataFlowNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataFlowConnection" ADD CONSTRAINT "DataFlowConnection_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "DataFlowNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

