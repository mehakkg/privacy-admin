// Auto-generated from the Features task register + workflow definitions. Do not hand-edit.
export interface WFStep { role: string; task: string; mod?: string; alt?: boolean; gap?: boolean; note?: string; }
export interface Workflow { id: string; name: string; domain: string; trigger: string; gap: string | null; step1note: string | null; steps: WFStep[]; }
export interface TaskRec { module: string; role: string; feature: string; capability: string; status: string; priority: string; }

export const WORKFLOWS: Workflow[] = [
 {
  "id": "WF-DD-01",
  "name": "Discovery scope expansion",
  "domain": "Data Discovery & Mapping",
  "trigger": "a team asks to scan new sources.",
  "gap": "DPO approval gate not built; scan runs without governance sign-off.",
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Receive request to add new sources to discovery scan scope"
   },
   {
    "role": "DPO",
    "task": "Assess whether sources genuinely need to be in scope",
    "mod": "Approved Policy"
   },
   {
    "role": "DPO",
    "task": "Approve or reject scan scope expansion"
   },
   {
    "role": "Admin",
    "task": "Configure new discovery scan across approved sources"
   },
   {
    "role": "Admin",
    "task": "Schedule scan to avoid timeout on large legacy source"
   },
   {
    "role": "Admin",
    "task": "Review scan results"
   },
   {
    "role": "Admin",
    "task": "Onboard newly discovered sources into inventory"
   },
   {
    "role": "Admin",
    "task": "Export the monthly scan compliance report",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-DD-02",
  "name": "Data hygiene (ROT & duplicates)",
  "domain": "Data Discovery & Mapping",
  "trigger": "a scheduled scan completes.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Identify ROT (redundant, obsolete, trivial) data with no ongoing business value"
   },
   {
    "role": "Admin",
    "task": "Identify duplicate or near-duplicate files/documents"
   },
   {
    "role": "Admin",
    "task": "Override an existing classification label with a corrected one"
   },
   {
    "role": "Admin",
    "task": "Push classification metadata to an external data catalog"
   }
  ]
 },
 {
  "id": "WF-DD-03",
  "name": "New sensitive-PII alert & quarantine",
  "domain": "Data Discovery & Mapping",
  "trigger": "new PII is detected in a source that was previously clean.",
  "gap": "Alerting is Partial; no DPO review step after quarantine.",
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Receive real-time alert when new sensitive PII appears in a previously scanned source",
    "mod": "Notifications"
   },
   {
    "role": "Admin",
    "task": "Quarantine files flagged as high-risk pending review"
   },
   {
    "role": "DPO",
    "task": "Notify relevant internal stakeholders of the classification change",
    "mod": "Notifications"
   }
  ]
 },
 {
  "id": "WF-DD-04",
  "name": "Data map maintenance",
  "domain": "Data Discovery & Mapping",
  "trigger": "a new integration or a scheduled reassessment.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Bulk-import pre-defined assets, processing activities, and data elements"
   },
   {
    "role": "Admin",
    "task": "Configure field mapping and sync frequency"
   },
   {
    "role": "Admin",
    "task": "Trigger scheduled reassessment of existing data mapping"
   },
   {
    "role": "Admin",
    "task": "Update data flow diagram for new integration"
   },
   {
    "role": "Admin",
    "task": "Add node and connection to the flow map",
    "mod": "Data Flow & Protection Rules"
   },
   {
    "role": "DPO",
    "task": "Review data flow map for a processing activity",
    "mod": "Data Flow & Protection Rules"
   }
  ]
 },
 {
  "id": "WF-DD-05",
  "name": "Metric spike investigation",
  "domain": "Data Discovery & Mapping",
  "trigger": "an anomaly appears on the dashboard.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Identify an unexplained metric spike",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Drill into the underlying data to determine root cause",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Confirm whether the spike reflects real risk or a reporting artifact"
   },
   {
    "role": "DPO",
    "task": "Investigate root cause of false positives",
    "mod": "Notifications"
   },
   {
    "role": "DPO",
    "task": "Adjust alert threshold configuration",
    "mod": "Notifications"
   }
  ]
 },
 {
  "id": "WF-EC-01",
  "name": "Acquired entity onboarding",
  "domain": "Entity & Identity Resolution",
  "trigger": "an acquisition closes.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Set up technical entity configuration for acquired platform"
   },
   {
    "role": "Admin",
    "task": "Map users to correct entity scope",
    "mod": "Data Flow & Protection Rules"
   },
   {
    "role": "DPO",
    "task": "Review newly acquired entity's SDF/compliance status separately"
   },
   {
    "role": "DPO",
    "task": "Set entity-specific policy variation"
   },
   {
    "role": "DPO",
    "task": "Flag flow for enhanced monitoring"
   }
  ]
 },
 {
  "id": "WF-EC-02",
  "name": "Identity-resolution threshold tuning",
  "domain": "Entity & Identity Resolution",
  "trigger": "the periodic accuracy report.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Review identity-resolution accuracy report"
   },
   {
    "role": "DPO",
    "task": "Identify a threshold generating false positives"
   },
   {
    "role": "DPO",
    "task": "Investigate a flagged potential mismatch"
   },
   {
    "role": "DPO",
    "task": "Approve a stricter matching threshold"
   },
   {
    "role": "Admin",
    "task": "Run identity resolution using approved matching threshold",
    "mod": "Data Discovery & Classification"
   },
   {
    "role": "Admin",
    "task": "Review flagged near-duplicate profiles",
    "mod": "Data Discovery & Classification"
   },
   {
    "role": "Admin",
    "task": "Merge confirmed duplicates or keep distinct profiles separate",
    "mod": "Data Discovery & Classification"
   }
  ]
 },
 {
  "id": "WF-DF-01",
  "name": "New data protection rule",
  "domain": "Data Protection Rules",
  "trigger": "the DPO flags a risk.",
  "gap": "Entire module Not Built / unprioritised.",
  "step1note": null,
  "steps": [
   {
    "role": "CISO",
    "task": "Receive a DPO-flagged risk requiring a new protection rule"
   },
   {
    "role": "CISO",
    "task": "Identify a gap against the risk-tier standard"
   },
   {
    "role": "CISO",
    "task": "Define the new data protection rule and its scope"
   },
   {
    "role": "CISO",
    "task": "Set rule strictness tier"
   },
   {
    "role": "Admin",
    "task": "Implement approved data protection rule"
   },
   {
    "role": "Admin",
    "task": "Configure rule scope to the correct data category"
   }
  ]
 },
 {
  "id": "WF-DF-02",
  "name": "Rule exception handling",
  "domain": "Data Protection Rules",
  "trigger": "a business team says a rule is blocking legitimate work.",
  "gap": "Entire module Not Built / unprioritised.",
  "step1note": null,
  "steps": [
   {
    "role": "CISO",
    "task": "Receive an exception request against the new rule"
   },
   {
    "role": "Admin",
    "task": "Investigate exception request against the rule"
   },
   {
    "role": "CISO",
    "task": "Investigate the legitimate process the rule is blocking"
   },
   {
    "role": "CISO",
    "task": "Adjudicate the exception and adjust rule scope accordingly"
   },
   {
    "role": "Admin",
    "task": "Adjust rule scope to resolve legitimate process conflict"
   }
  ]
 },
 {
  "id": "WF-AP-01",
  "name": "Purpose definition & approval",
  "domain": "Purpose, Notice & Policy",
  "trigger": "a processing activity has no matching purpose.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Identify a processing activity with no matching purpose category"
   },
   {
    "role": "DPO",
    "task": "Define a new purpose category"
   },
   {
    "role": "DPO",
    "task": "Approve purpose for use"
   },
   {
    "role": "Admin",
    "task": "Tag new product's data fields against approved purpose",
    "mod": "Data Privacy Notice Management"
   },
   {
    "role": "Admin",
    "task": "Bulk-apply purpose tag across relevant data category",
    "mod": "Data Privacy Notice Management"
   }
  ]
 },
 {
  "id": "WF-NT-01",
  "name": "Notice draft → publish",
  "domain": "Purpose, Notice & Policy",
  "trigger": "a new product launch or a policy change.",
  "gap": "Publish, versioning and rendering tests all Not Built.",
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Maintain and draw from a template library of standard notices/policies"
   },
   {
    "role": "DPO",
    "task": "Review draft notice language for a new product",
    "mod": "Approved Policy"
   },
   {
    "role": "DPO",
    "task": "Check notice against Rule 3 itemization requirements",
    "mod": "Approved Policy"
   },
   {
    "role": "Admin",
    "task": "Configure regional/language display variants"
   },
   {
    "role": "Admin",
    "task": "Configure auto-generation of consent notices across required Indian languages",
    "mod": "Consent Management Platform"
   },
   {
    "role": "Admin",
    "task": "Verify each language variant renders and reads correctly",
    "mod": "Consent Management Platform"
   },
   {
    "role": "Admin",
    "task": "Test notice rendering across devices"
   },
   {
    "role": "Admin",
    "task": "Fix a display issue found during testing",
    "alt": true
   },
   {
    "role": "DPO",
    "task": "Approve notice for publishing"
   },
   {
    "role": "Admin",
    "task": "Publish approved notice to the app"
   },
   {
    "role": "Admin",
    "task": "Maintain version history for every notice/policy change"
   },
   {
    "role": "Admin",
    "task": "Trigger proactive user notification when a policy meaningfully changes",
    "mod": "Notifications"
   }
  ]
 },
 {
  "id": "WF-MG-01",
  "name": "Legacy migration",
  "domain": "Purpose, Notice & Policy",
  "trigger": "the client is moving off a legacy or retiring system.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Import and reconcile existing policies already in use into the platform",
    "mod": "Data Privacy Notice Management"
   },
   {
    "role": "Admin",
    "task": "Bulk-import pre-existing consent records from a legacy or retiring system",
    "mod": "Consent Management Platform"
   },
   {
    "role": "Admin",
    "task": "Bulk-import pre-defined assets, processing activities, and data elements",
    "mod": "Data Discovery & Classification"
   }
  ]
 },
 {
  "id": "WF-CM-01",
  "name": "Consent platform setup",
  "domain": "Consent",
  "trigger": "tenant onboarding.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Set up business-unit consent isolation within the organization"
   },
   {
    "role": "Admin",
    "task": "Configure Universal Consent API parameters for a new data field requirement"
   },
   {
    "role": "Admin",
    "task": "Configure a webhook for partner/API-based consent access"
   },
   {
    "role": "Admin",
    "task": "Configure auto-expiry rules for consent based on retention timelines"
   },
   {
    "role": "Admin",
    "task": "Configure Preference Center branding and display customization"
   },
   {
    "role": "Admin",
    "task": "Verify granular, timestamped, purpose-specific consent artifacts are retrievable via API"
   },
   {
    "role": "Admin",
    "task": "Confirm consent artifacts are being created as immutable, tamper-proof records",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-CM-02",
  "name": "Assisted / offline consent capture",
  "domain": "Consent",
  "trigger": "a customer at a branch or BC point.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Verify identity through in-person/assisted verification method"
   },
   {
    "role": "Admin",
    "task": "Capture consent via a branch or BC-point collection flow"
   },
   {
    "role": "Admin",
    "task": "Support offline-capable consent capture for low-connectivity locations",
    "alt": true
   },
   {
    "role": "Admin",
    "task": "Sync offline-collected consent once connectivity is restored",
    "alt": true
   },
   {
    "role": "Admin",
    "task": "Confirm assisted-channel submissions feed into the same central system as digital ones"
   }
  ]
 },
 {
  "id": "WF-CM-03",
  "name": "Data Principal consent review & withdrawal",
  "domain": "Consent",
  "trigger": "the Data Principal opens account settings.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Data Principal",
    "task": "Open privacy/account settings"
   },
   {
    "role": "Data Principal",
    "task": "Open consent preference center"
   },
   {
    "role": "Data Principal",
    "task": "View summary of data held and processing purposes"
   },
   {
    "role": "Data Principal",
    "task": "Review current consent state by purpose and processor"
   },
   {
    "role": "Data Principal",
    "task": "Identify an unfamiliar or inferred data category"
   },
   {
    "role": "Data Principal",
    "task": "Withdraw consent for a specific processor"
   },
   {
    "role": "Data Principal",
    "task": "Confirm consent change has been applied"
   },
   {
    "role": "Data Processor",
    "task": "Maintain audit trail specifically tied to consent updates/revocations shared with this processor",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Verify the entries actually reflect the consent-withdrawal and data-sharing-stop events",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-CK-01",
  "name": "Undisclosed script detection",
  "domain": "Cookie Consent",
  "trigger": "a scheduled domain scan.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Run scheduled full-domain cookie/tracker scan"
   },
   {
    "role": "Admin",
    "task": "Review scan results for undisclosed cookies or scripts"
   },
   {
    "role": "Admin",
    "task": "Identify a script not covered by the published cookie policy"
   },
   {
    "role": "Admin",
    "task": "Auto-block the undisclosed script pending proper categorization"
   },
   {
    "role": "Admin",
    "task": "Flag the gap for policy update"
   },
   {
    "role": "Admin",
    "task": "Identify and fix a script firing before consent capture",
    "mod": "Consent Management Platform"
   }
  ]
 },
 {
  "id": "WF-CK-02",
  "name": "New cookie category → live banner",
  "domain": "Cookie Consent",
  "trigger": "WF-CK-01 step 5, or a business request.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Receive request for a new cookie consent category"
   },
   {
    "role": "DPO",
    "task": "Define the cookie category and its default consent state"
   },
   {
    "role": "DPO",
    "task": "Approve category policy for technical implementation",
    "mod": "Approved Policy"
   },
   {
    "role": "Admin",
    "task": "Implement new cookie consent category technically"
   },
   {
    "role": "Admin",
    "task": "Configure banner to reflect approved default state"
   },
   {
    "role": "Admin",
    "task": "Confirm a cookie policy version change triggers reconsent for returning visitors"
   },
   {
    "role": "Admin",
    "task": "Verify geo-detection correctly serves the appropriate compliance model by visitor location"
   },
   {
    "role": "Admin",
    "task": "Verify language auto-detection serves the correct banner variant"
   },
   {
    "role": "Admin",
    "task": "Audit script-firing behavior against policy",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-DR-01",
  "name": "Erasure request end-to-end (digital)",
  "domain": "Data Principal Rights (DPRR)",
  "trigger": "the Data Principal submits an erasure request.",
  "gap": "Central intake queue and every per-system deletion trigger Not Built; journey cannot complete.",
  "step1note": null,
  "steps": [
   {
    "role": "Data Principal",
    "task": "Select the right to exercise (erasure)"
   },
   {
    "role": "Data Principal",
    "task": "Choose identity verification method"
   },
   {
    "role": "Data Principal",
    "task": "Complete verification (OTP)"
   },
   {
    "role": "Data Principal",
    "task": "Upload supporting attachment as part of identity verification"
   },
   {
    "role": "Data Principal",
    "task": "Complete the scoped request form"
   },
   {
    "role": "Data Principal",
    "task": "Submit request and receive tracking ID"
   },
   {
    "role": "Admin",
    "task": "Auto-send acknowledgment on receipt",
    "mod": "Notifications"
   },
   {
    "role": "Admin",
    "task": "Receive and log a new DPRR (access/correction/deletion/nomination) into the central queue"
   },
   {
    "role": "Admin",
    "task": "Validate request scope against customer identifiers"
   },
   {
    "role": "Admin",
    "task": "Auto-assign the request to an available reviewer by type"
   },
   {
    "role": "Admin",
    "task": "Reassign a ticket when the original reviewer is unavailable",
    "alt": true
   },
   {
    "role": "Admin",
    "task": "Monitor time remaining against the regulatory deadline for each open request"
   },
   {
    "role": "Admin",
    "task": "Check for legal-retention exceptions before proceeding"
   },
   {
    "role": "Admin",
    "task": "Cross-check the deletion request against active retention flags"
   },
   {
    "role": "Admin",
    "task": "Identify every connected system and processor holding the customer's data"
   },
   {
    "role": "Admin",
    "task": "Trigger deletion in the primary CRM"
   },
   {
    "role": "Admin",
    "task": "Trigger deletion in the marketing platform"
   },
   {
    "role": "Admin",
    "task": "Trigger deletion in cloud backup/archive storage"
   },
   {
    "role": "Admin",
    "task": "Trigger deletion in the transaction ledger, respecting any statutory retention flag"
   },
   {
    "role": "Admin",
    "task": "Send deletion instruction to the third-party Data Processor",
    "note": "→ WF-DR-02"
   },
   {
    "role": "Admin",
    "task": "Track per-system completion status as confirmations come in"
   },
   {
    "role": "Admin",
    "task": "Manually verify systems with no API-based confirmation available"
   },
   {
    "role": "Admin",
    "task": "Investigate and resolve any system reporting a failed or partial deletion",
    "alt": true
   },
   {
    "role": "Admin",
    "task": "Compile cross-system completion evidence"
   },
   {
    "role": "Admin",
    "task": "Log completion timestamp and evidence in the audit trail",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Data Principal",
    "task": "Check request status via self-service portal"
   },
   {
    "role": "Data Principal",
    "task": "Confirm request marked resolved",
    "mod": "Notifications"
   }
  ]
 },
 {
  "id": "WF-DR-02",
  "name": "Processor deletion execution",
  "domain": "Data Principal Rights (DPRR)",
  "trigger": "WF-DR-01 step 20.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Data Processor",
    "task": "Receive deletion instruction from Fiduciary client"
   },
   {
    "role": "Data Processor",
    "task": "Check instruction against current DPA scope",
    "mod": "Third Party Vendor Risk Management"
   },
   {
    "role": "Data Processor",
    "task": "Confirm instruction is within authorized scope"
   },
   {
    "role": "Data Processor",
    "task": "Validate exact records the instruction applies to"
   },
   {
    "role": "Data Processor",
    "task": "Execute deletion action"
   },
   {
    "role": "Data Processor",
    "task": "Generate structured completion evidence"
   },
   {
    "role": "Data Processor",
    "task": "Format evidence to match client's required schema"
   },
   {
    "role": "Data Processor",
    "task": "Upload explicit proof-of-completion artifacts alongside the acknowledgment",
    "mod": "Notifications"
   },
   {
    "role": "Data Processor",
    "task": "Submit evidence through the designated channel"
   },
   {
    "role": "Data Processor",
    "task": "Confirm client acceptance of submitted evidence"
   },
   {
    "role": "Data Processor",
    "task": "Log the action taken internally",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-DR-03",
  "name": "Assisted-channel rights request",
  "domain": "Data Principal Rights (DPRR)",
  "trigger": "a customer calls or walks into a branch.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Receive in-person or phone-based rights request from a customer"
   },
   {
    "role": "Admin",
    "task": "Verify identity through in-person/assisted verification method",
    "mod": "Consent Management Platform"
   },
   {
    "role": "Admin",
    "task": "Submit request on behalf of the customer, tagged with assisted-channel origin",
    "mod": "Consent Management Platform"
   },
   {
    "role": "Admin",
    "task": "Notify the customer of confirmation/tracking ID through their preferred assisted channel",
    "mod": "Notifications"
   },
   {
    "role": "Admin",
    "task": "Receive and log a new DPRR (access/correction/deletion/nomination) into the central queue"
   }
  ]
 },
 {
  "id": "WF-DR-04",
  "name": "Complex request (sub-tasks, re-verification, extension)",
  "domain": "Data Principal Rights (DPRR)",
  "trigger": "a request spans multiple owners or the identity is unclear.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Create a sub-task within a complex request requiring multiple owners"
   },
   {
    "role": "Admin",
    "task": "Track each sub-task to completion under the parent ticket"
   },
   {
    "role": "Data Principal",
    "task": "Receive prompt for additional verification",
    "mod": "Notifications"
   },
   {
    "role": "Data Principal",
    "task": "Respond to additional verification request"
   },
   {
    "role": "Admin",
    "task": "Grant and document a deadline extension where genuinely warranted",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Data Principal",
    "task": "Receive communication of an extended deadline, where genuinely warranted",
    "mod": "Notifications"
   },
   {
    "role": "Admin",
    "task": "Generate export-ready reports of DPRR queue activity for DPB or internal reporting"
   }
  ]
 },
 {
  "id": "WF-DR-05",
  "name": "Nomination",
  "domain": "Data Principal Rights (DPRR)",
  "trigger": "the Data Principal designates a nominee.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Data Principal",
    "task": "Open nomination designation flow on a separate platform"
   },
   {
    "role": "Data Principal",
    "task": "Enter nominee details"
   },
   {
    "role": "Data Principal",
    "task": "Confirm nomination saved"
   }
  ]
 },
 {
  "id": "WF-DR-06",
  "name": "Retention-expiry erasure (48-hour notice)",
  "domain": "Data Principal Rights (DPRR)",
  "trigger": "the retention period lapses for an inactive principal.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Data Principal",
    "task": "Receive 48-hour advance erasure notice",
    "mod": "Data Privacy Notice Management"
   },
   {
    "role": "Data Principal",
    "task": "Review notice content and options",
    "mod": "Data Privacy Notice Management"
   },
   {
    "role": "Data Principal",
    "task": "Decide to act or allow erasure to proceed"
   }
  ]
 },
 {
  "id": "WF-DR-07",
  "name": "Correction denial → grievance",
  "domain": "Data Principal Rights (DPRR)",
  "trigger": "a correction request is denied.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Data Principal",
    "task": "Receive denial on a filed correction request"
   },
   {
    "role": "Data Principal",
    "task": "Initiate grievance escalation from the denial screen",
    "mod": "Grievance & Escalation Management"
   },
   {
    "role": "Data Principal",
    "task": "Confirm original request context carried into the grievance automatically",
    "mod": "Grievance & Escalation Management"
   },
   {
    "role": "Grievance Officer",
    "task": "Receive new grievance submission",
    "mod": "Grievance & Escalation Management",
    "note": "→ WF-GR-01"
   }
  ]
 },
 {
  "id": "WF-GR-01",
  "name": "Grievance intake → resolution",
  "domain": "Grievance & Escalation",
  "trigger": "a grievance is submitted.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Grievance Officer",
    "task": "Receive new grievance submission"
   },
   {
    "role": "Grievance Officer",
    "task": "Log grievance with timestamp"
   },
   {
    "role": "Grievance Officer",
    "task": "Capture complainant contact and case metadata"
   },
   {
    "role": "Grievance Officer",
    "task": "Send acknowledgment with tracking ID",
    "mod": "Notifications"
   },
   {
    "role": "Grievance Officer",
    "task": "Review full open-case queue"
   },
   {
    "role": "Grievance Officer",
    "task": "Sort queue by deadline proximity"
   },
   {
    "role": "Grievance Officer",
    "task": "Open investigation into flagged case"
   },
   {
    "role": "Grievance Officer",
    "task": "Coordinate with Admin to confirm underlying facts"
   },
   {
    "role": "Grievance Officer",
    "task": "Determine case validity"
   },
   {
    "role": "Grievance Officer",
    "task": "Document corrective action for a valid case"
   },
   {
    "role": "Grievance Officer",
    "task": "Close case with remedy confirmed"
   },
   {
    "role": "Grievance Officer",
    "task": "Draft denial citing specific applicable section",
    "alt": true
   },
   {
    "role": "Grievance Officer",
    "task": "Send denial response to complainant",
    "alt": true
   },
   {
    "role": "Data Principal",
    "task": "Track grievance status through to resolution"
   }
  ]
 },
 {
  "id": "WF-GR-02",
  "name": "Audit evidence for a grievance",
  "domain": "Grievance & Escalation",
  "trigger": "the Grievance Officer needs proof of what happened.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Receive an audit evidence request from the Grievance Officer"
   },
   {
    "role": "Admin",
    "task": "Search the unified audit log by customer identifier and date range",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Extract the relevant timestamped log entries",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Verify the entries actually reflect the consent-withdrawal and data-sharing-stop events",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Export the evidence in the required format",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Deliver the evidence to the Grievance Officer"
   }
  ]
 },
 {
  "id": "WF-GR-03",
  "name": "Escalated deletion with retention conflict (DPO ruling)",
  "domain": "Grievance & Escalation",
  "trigger": "the Grievance Officer escalates a deletion that hits a statutory retention flag.",
  "gap": "Ruling, execution and audit-log steps Not Built; DPO→Admin ruling handoff has no channel.",
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Receive and open escalated deletion request from Grievance Officer"
   },
   {
    "role": "Admin",
    "task": "Identify a conflict with a statutory retention obligation",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Compile context and supporting evidence for escalation"
   },
   {
    "role": "Admin",
    "task": "Escalate the conflict to the DPO with full context attached"
   },
   {
    "role": "DPO",
    "task": "Receive an escalated conflict from Admin"
   },
   {
    "role": "DPO",
    "task": "Evaluate the conflict against the statutory retention exception",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Issue a documented ruling",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Log the escalation and resolution in the audit trail",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Communicate the ruling and required action back to Admin",
    "mod": "Notifications"
   },
   {
    "role": "Admin",
    "task": "Await a documented ruling"
   },
   {
    "role": "Admin",
    "task": "Execute the action per the DPO's ruling",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Log the escalation and its resolution in the audit trail",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Mark the request fully verified and notify the Grievance Officer"
   }
  ]
 },
 {
  "id": "WF-GR-04",
  "name": "SLA watch & stalled cases",
  "domain": "Grievance & Escalation",
  "trigger": "the daily queue review.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Grievance Officer",
    "task": "Review all open cases against statutory deadline",
    "mod": "Analytics & Reporting"
   },
   {
    "role": "Grievance Officer",
    "task": "Flag case nearing the 90-day ceiling for priority handling"
   },
   {
    "role": "Grievance Officer",
    "task": "Identify a case stalled awaiting dependent-team response"
   },
   {
    "role": "Grievance Officer",
    "task": "Escalate internally to prevent silent SLA breach"
   },
   {
    "role": "Grievance Officer",
    "task": "Confirm dependent team acts before deadline lapses"
   }
  ]
 },
 {
  "id": "WF-GR-05",
  "name": "Internal appeal",
  "domain": "Grievance & Escalation",
  "trigger": "the complainant appeals a denial.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Grievance Officer",
    "task": "Receive internal appeal on a previously denied case"
   },
   {
    "role": "Grievance Officer",
    "task": "Reassign appeal to a fresh reviewer perspective"
   },
   {
    "role": "Grievance Officer",
    "task": "Re-investigate incorporating any new information"
   },
   {
    "role": "Grievance Officer",
    "task": "Determine whether original denial should be upheld or reversed"
   },
   {
    "role": "Grievance Officer",
    "task": "Document appeal outcome and reasoning"
   },
   {
    "role": "Grievance Officer",
    "task": "Issue corrected resolution if denial is reversed",
    "alt": true
   },
   {
    "role": "Grievance Officer",
    "task": "Notify complainant of appeal decision"
   }
  ]
 },
 {
  "id": "WF-GR-06",
  "name": "Board (DPB) escalation",
  "domain": "Grievance & Escalation",
  "trigger": "internal redressal is exhausted or the SLA has lapsed.",
  "gap": "Hand-off to Board and documentation-completeness check Not Built.",
  "step1note": null,
  "steps": [
   {
    "role": "Grievance Officer",
    "task": "Identify case where internal redressal is exhausted",
    "mod": "Personal Data Breach Management"
   },
   {
    "role": "Grievance Officer",
    "task": "Compile full case documentation and timeline"
   },
   {
    "role": "Grievance Officer",
    "task": "Confirm documentation completeness before submission"
   },
   {
    "role": "Grievance Officer",
    "task": "Hand off case to Board escalation process"
   },
   {
    "role": "Admin",
    "task": "Confirm automatic escalation to the Data Protection Board fires when SLA lapses without manual intervention"
   },
   {
    "role": "Grievance Officer",
    "task": "Inform complainant of escalation status"
   }
  ]
 },
 {
  "id": "WF-GR-07",
  "name": "Systemic issue detection",
  "domain": "Grievance & Escalation",
  "trigger": "the periodic case review.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Grievance Officer",
    "task": "Compile periodic case volume and resolution data"
   },
   {
    "role": "Grievance Officer",
    "task": "Review data for recurring root-cause patterns"
   },
   {
    "role": "Grievance Officer",
    "task": "Identify a systemic issue spanning multiple cases"
   },
   {
    "role": "Grievance Officer",
    "task": "Document the systemic finding with supporting case references"
   },
   {
    "role": "Grievance Officer",
    "task": "Report findings and recommendation to DPO"
   },
   {
    "role": "Grievance Officer",
    "task": "Track whether recommended fix is actioned"
   }
  ]
 },
 {
  "id": "WF-DP-01",
  "name": "DPIA lifecycle",
  "domain": "DPIA, ROPA & Regulatory Change",
  "trigger": "the system flags a high-risk processing activity.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "System auto-recommends a DPIA for a new high-risk processing activity"
   },
   {
    "role": "DPO",
    "task": "Receive and confirm the flagged activity"
   },
   {
    "role": "DPO",
    "task": "Open a new DPIA record for the activity"
   },
   {
    "role": "DPO",
    "task": "Pull existing data mapping to populate itemized data categories"
   },
   {
    "role": "DPO",
    "task": "Link relevant PII types, processors, and purposes directly while creating the assessment"
   },
   {
    "role": "DPO",
    "task": "Use a guided, questionnaire-based flow to structure the risk assessment"
   },
   {
    "role": "DPO",
    "task": "Complete the purpose and risk-management sections"
   },
   {
    "role": "DPO",
    "task": "Upload supporting documentation (architecture diagrams, policies)"
   },
   {
    "role": "DPO",
    "task": "Assign CISO as co-reviewer for the algorithmic-risk section"
   },
   {
    "role": "CISO",
    "task": "Review assigned algorithmic-risk section and return feedback",
    "gap": true
   },
   {
    "role": "DPO",
    "task": "Review and reconcile co-reviewer feedback"
   },
   {
    "role": "DPO",
    "task": "Calculate residual risk after mitigation steps are defined"
   },
   {
    "role": "DPO",
    "task": "Sign off on the DPIA before launch approval is granted"
   },
   {
    "role": "DPO",
    "task": "Notify product team of DPIA completion and any conditions"
   },
   {
    "role": "DPO",
    "task": "Add new entry for the newly launched processing activity",
    "mod": "ROPA"
   },
   {
    "role": "DPO",
    "task": "Log DPIA and ROPA updates in the compliance record"
   },
   {
    "role": "DPO",
    "task": "Export DPIA report for DPB or auditor submission"
   }
  ]
 },
 {
  "id": "WF-RC-01",
  "name": "Regulatory change → re-assessment",
  "domain": "DPIA, ROPA & Regulatory Change",
  "trigger": "the periodic regulatory digest.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Review the periodic regulatory-change digest",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Identify an upcoming binding Rule commencement date",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Assess impact of the change on current policy or product configuration",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Trigger periodic re-assessment when underlying processing or legislation changes",
    "mod": "DPIA (Risk Assessment)"
   },
   {
    "role": "DPO",
    "task": "Trace the DPIA back to its originating consented activity",
    "mod": "DPIA (Risk Assessment)"
   }
  ]
 },
 {
  "id": "WF-RP-01",
  "name": "ROPA quarterly review",
  "domain": "DPIA, ROPA & Regulatory Change",
  "trigger": "the quarterly calendar.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Open ROPA for scheduled quarterly review"
   },
   {
    "role": "DPO",
    "task": "Cross-check existing entries against live system behavior"
   },
   {
    "role": "DPO",
    "task": "Identify a stale entry for discontinued processing"
   },
   {
    "role": "DPO",
    "task": "Archive the discontinued entry"
   },
   {
    "role": "DPO",
    "task": "Log DPIA and ROPA updates in the compliance record",
    "mod": "DPIA (Risk Assessment)"
   }
  ]
 },
 {
  "id": "WF-BR-01",
  "name": "Processor-detected breach → Board notification",
  "domain": "Breach Management",
  "trigger": "the processor detects unusual access.",
  "gap": "Every step Not Built; no DPO task exists to own Board notification (72-hour clock).",
  "step1note": "Platform requirements attached: Legal/Procurement rows 'Support automatic email notifications…' through 'Real time dashboard for breach trends…'",
  "steps": [
   {
    "role": "Data Processor",
    "task": "Detect unusual access activity during security review"
   },
   {
    "role": "Data Processor",
    "task": "Assess initial scope of potential incident"
   },
   {
    "role": "Data Processor",
    "task": "Send initial breach notification to affected Fiduciary client"
   },
   {
    "role": "Data Processor",
    "task": "Continue investigation to determine full scope"
   },
   {
    "role": "Data Processor",
    "task": "Deliver detailed follow-up notification with findings",
    "mod": "Notifications"
   },
   {
    "role": "CISO",
    "task": "Receive processor's confirmation and remediation details"
   },
   {
    "role": "CISO",
    "task": "Auto-calculate incident severity based on volume, PII type, and sensitivity"
   },
   {
    "role": "CISO",
    "task": "Categorize the incident by type"
   },
   {
    "role": "CISO",
    "task": "Map affected PII fields, purposes, and processors potentially involved"
   },
   {
    "role": "CISO",
    "task": "Identify the specific closed cohort of affected Data Principals"
   },
   {
    "role": "CISO",
    "task": "Link incident to relevant DPIA and consent records for impact traceability",
    "mod": "DPIA (Risk Assessment)"
   },
   {
    "role": "CISO",
    "task": "Compile complete package and hand off to DPO for Board notification"
   },
   {
    "role": "DPO",
    "task": "Review incident package and submit Board notification within 72 hours",
    "gap": true
   },
   {
    "role": "DPO",
    "task": "Notify affected Data Principals of the breach",
    "gap": true
   },
   {
    "role": "Legal / Procurement",
    "task": "Flag a vendor for non-compliance (breach, retention lapse) when identified"
   }
  ]
 },
 {
  "id": "WF-BR-02",
  "name": "Externally reported incident (CISO-led)",
  "domain": "Breach Management",
  "trigger": "a report arrives via the public channel.",
  "gap": "Same DPO ownership gap as WF-BR-01.",
  "step1note": null,
  "steps": [
   {
    "role": "CISO",
    "task": "Receive incident report through public/external self-service channel"
   },
   {
    "role": "CISO",
    "task": "Auto-calculate incident severity based on volume, PII type, and sensitivity"
   },
   {
    "role": "CISO",
    "task": "Categorize the incident by type"
   },
   {
    "role": "CISO",
    "task": "Identify a likely processor-side source based on the pattern"
   },
   {
    "role": "CISO",
    "task": "Proactively reach out to the processor to investigate"
   },
   {
    "role": "CISO",
    "task": "Receive processor's confirmation and remediation details"
   },
   {
    "role": "CISO",
    "task": "Map affected PII fields, purposes, and processors potentially involved"
   },
   {
    "role": "CISO",
    "task": "Identify the specific closed cohort of affected Data Principals"
   },
   {
    "role": "CISO",
    "task": "Compile complete package and hand off to DPO for Board notification"
   },
   {
    "role": "DPO",
    "task": "Review incident package and submit Board notification within 72 hours",
    "gap": true
   }
  ]
 },
 {
  "id": "WF-BR-03",
  "name": "Processor retention misconfiguration",
  "domain": "Breach Management",
  "trigger": "the processor's periodic config review.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Data Processor",
    "task": "Review retention configuration across active Fiduciary clients"
   },
   {
    "role": "Data Processor",
    "task": "Identify a client running an outdated default retention setting"
   },
   {
    "role": "Data Processor",
    "task": "Cross-check against that client's current retention policy"
   },
   {
    "role": "Data Processor",
    "task": "Correct the retention configuration"
   },
   {
    "role": "Data Processor",
    "task": "Confirm alignment with client's policy"
   },
   {
    "role": "Legal / Procurement",
    "task": "Flag a vendor for non-compliance (breach, retention lapse) when identified"
   }
  ]
 },
 {
  "id": "WF-VR-01",
  "name": "Vendor onboarding & risk assessment",
  "domain": "Vendor & Processor Risk",
  "trigger": "a new vendor is proposed.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Legal / Procurement",
    "task": "Pull baseline risk rating for a prospective vendor's category"
   },
   {
    "role": "Legal / Procurement",
    "task": "Assign a customized assessment questionnaire to the vendor"
   },
   {
    "role": "Legal / Procurement",
    "task": "Vendor completes questionnaire via self-service portal"
   },
   {
    "role": "Legal / Procurement",
    "task": "Review completed assessment and finalize risk classification"
   },
   {
    "role": "Legal / Procurement",
    "task": "Map approved vendor to specific purposes and PII types handled"
   },
   {
    "role": "Admin",
    "task": "Use guided questionnaires to support new data-mapping initiatives for vendor"
   },
   {
    "role": "Legal / Procurement",
    "task": "Maintain the vendor database as relationships are added or change"
   }
  ]
 },
 {
  "id": "WF-VR-02",
  "name": "Sub-processor disclosure & approval",
  "domain": "Vendor & Processor Risk",
  "trigger": "the processor needs a new sub-processor.",
  "gap": "No Fiduciary-side approval task exists; processor is held indefinitely.",
  "step1note": null,
  "steps": [
   {
    "role": "Data Processor",
    "task": "Identify need for a new sub-processor engagement"
   },
   {
    "role": "Data Processor",
    "task": "Register sub-processor disclosure"
   },
   {
    "role": "Data Processor",
    "task": "Attach sub-processor's compliance documentation"
   },
   {
    "role": "Data Processor",
    "task": "Submit disclosure for Fiduciary approval"
   },
   {
    "role": "Data Processor",
    "task": "Hold engagement pending formal approval"
   },
   {
    "role": "DPO",
    "task": "Review and approve or reject sub-processor disclosure",
    "gap": true
   },
   {
    "role": "Data Processor",
    "task": "Activate engagement once approved"
   }
  ]
 },
 {
  "id": "WF-VR-03",
  "name": "Undisclosed sub-processor transfer",
  "domain": "Vendor & Processor Risk",
  "trigger": "the flow map shows data moving to an undeclared party.",
  "gap": "No Legal task to perform DPA verification after routing.",
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Identify an undisclosed sub-processor transfer"
   },
   {
    "role": "DPO",
    "task": "Review the Data Processor contract registry"
   },
   {
    "role": "DPO",
    "task": "Route flagged flow to Legal for DPA verification"
   },
   {
    "role": "Legal / Procurement",
    "task": "Verify DPA coverage for the flagged transfer",
    "gap": true
   },
   {
    "role": "Legal / Procurement",
    "task": "Use the processor-purpose-PII visualization to trace which vendors touch a specific data category"
   },
   {
    "role": "Legal / Procurement",
    "task": "Flag a vendor for non-compliance (breach, retention lapse) when identified",
    "mod": "Personal Data Breach Management"
   }
  ]
 },
 {
  "id": "WF-VR-04",
  "name": "Vendor SLA monitoring",
  "domain": "Vendor & Processor Risk",
  "trigger": "a vendor's acknowledgment clock is running.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Legal / Procurement",
    "task": "Track deletion/access acknowledgment timelines against vendor SLA commitments"
   },
   {
    "role": "Legal / Procurement",
    "task": "Receive and act on an alert when a vendor misses a committed SLA",
    "mod": "Personal Data Breach Management"
   },
   {
    "role": "Legal / Procurement",
    "task": "Flag a vendor for non-compliance (breach, retention lapse) when identified",
    "mod": "Personal Data Breach Management"
   }
  ]
 },
 {
  "id": "WF-VR-05",
  "name": "Processor audit response",
  "domain": "Vendor & Processor Risk",
  "trigger": "the Fiduciary issues a short-notice audit request.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Data Processor",
    "task": "Receive short-notice audit request from Fiduciary",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Data Processor",
    "task": "Pull from continuously maintained evidence package",
    "mod": "Third Party Vendor Risk Management"
   },
   {
    "role": "Data Processor",
    "task": "Compile requested documentation",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Data Processor",
    "task": "Submit audit response package within contractual window",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Data Processor",
    "task": "Confirm audit response accepted without gaps",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-VR-06",
  "name": "Processor contract renewal review",
  "domain": "Vendor & Processor Risk",
  "trigger": "a processor contract comes up for renewal.",
  "gap": "No Legal review task after routing.",
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Identify a processor renewal with outdated clause language",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Route the flagged contract to Legal for review",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Legal / Procurement",
    "task": "Review and update clause language before renewal",
    "gap": true
   }
  ]
 },
 {
  "id": "WF-IA-01",
  "name": "Joiner (access provisioning)",
  "domain": "Identity & Access",
  "trigger": "a new-hire request.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Receive new-hire access request"
   },
   {
    "role": "Admin",
    "task": "Apply the role-based, least-privilege access template"
   },
   {
    "role": "Admin",
    "task": "Grant scoped access across required systems"
   },
   {
    "role": "Admin",
    "task": "Confirm the access grant is logged for audit",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-IA-02",
  "name": "Leaver (revocation)",
  "domain": "Identity & Access",
  "trigger": "an offboarding event.",
  "gap": "Revocation completion verification Not Built; partial revocation goes undetected.",
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Receive offboarding trigger for a departing employee"
   },
   {
    "role": "Admin",
    "task": "Revoke access across every connected system"
   },
   {
    "role": "Admin",
    "task": "Terminate active sessions and lingering tokens"
   },
   {
    "role": "Admin",
    "task": "Confirm full revocation is complete"
   },
   {
    "role": "Admin",
    "task": "Document the permission change for the audit trail",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-IA-03",
  "name": "Access review & drift correction",
  "domain": "Identity & Access",
  "trigger": "the periodic access review.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Review the RBAC permission matrix against the least-privilege baseline"
   },
   {
    "role": "Admin",
    "task": "Identify roles with accumulated, drifted permissions"
   },
   {
    "role": "Admin",
    "task": "Correct drifted role permissions"
   },
   {
    "role": "Admin",
    "task": "Document the permission change for the audit trail",
    "mod": "Audit & Compliance"
   }
  ]
 },
 {
  "id": "WF-IA-04",
  "name": "Dormant / orphaned account review",
  "domain": "Identity & Access",
  "trigger": "the periodic dormant-account report.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Review the periodic dormant/orphaned account report"
   },
   {
    "role": "Admin",
    "task": "Investigate a flagged account's legitimacy",
    "mod": "Audit & Compliance"
   },
   {
    "role": "Admin",
    "task": "Revoke or retain the flagged account with documented justification"
   }
  ]
 },
 {
  "id": "WF-IN-01",
  "name": "New integration approval",
  "domain": "Integrations",
  "trigger": "a team requests a new integration.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "CISO",
    "task": "Receive request to approve a new integration"
   },
   {
    "role": "CISO",
    "task": "Review integration's security posture against required criteria"
   },
   {
    "role": "CISO",
    "task": "Require remediation before approval",
    "mod": "Data Flow & Protection Rules",
    "alt": true
   },
   {
    "role": "CISO",
    "task": "Approve integration once remediated"
   },
   {
    "role": "Admin",
    "task": "Connect newly approved integration"
   },
   {
    "role": "Admin",
    "task": "Set up integration health monitoring"
   },
   {
    "role": "Admin",
    "task": "Update data flow diagram for new integration",
    "mod": "Data Discovery & Classification"
   }
  ]
 },
 {
  "id": "WF-AU-01",
  "name": "Independent audit findings → board",
  "domain": "Audit, Analytics & Board Reporting",
  "trigger": "the auditor's annual report arrives.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Receive the independent auditor's annual report"
   },
   {
    "role": "DPO",
    "task": "Review each significant finding in detail"
   },
   {
    "role": "DPO",
    "task": "Assign remediation ownership per finding"
   },
   {
    "role": "DPO",
    "task": "Set tracking checkpoints for remediation progress"
   },
   {
    "role": "DPO",
    "task": "Compile audit findings into board-appropriate language"
   },
   {
    "role": "DPO",
    "task": "Draft the board/executive summary"
   },
   {
    "role": "DPO",
    "task": "Review draft for accuracy before distribution"
   },
   {
    "role": "DPO",
    "task": "Log any leadership follow-up actions requested"
   }
  ]
 },
 {
  "id": "WF-AN-01",
  "name": "Compliance posture reporting",
  "domain": "Audit, Analytics & Board Reporting",
  "trigger": "the weekly review, building to the board meeting.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "Admin",
    "task": "Configure default surfaced metrics",
    "mod": "Analytics & Reporting"
   },
   {
    "role": "Admin",
    "task": "Connect new data source to risk analytics dashboard",
    "mod": "Analytics & Reporting"
   },
   {
    "role": "DPO",
    "task": "Open the compliance posture dashboard for weekly review"
   },
   {
    "role": "DPO",
    "task": "Review risk analytics dashboard output"
   },
   {
    "role": "DPO",
    "task": "Review DPDPA compliance score for a specific digital journey",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Investigate the specific factors contributing to a low journey-level score",
    "mod": "Audit & Compliance"
   },
   {
    "role": "DPO",
    "task": "Review DPIA metrics (time-to-complete, top risk domains, mitigation effectiveness)",
    "mod": "DPIA (Risk Assessment)"
   },
   {
    "role": "DPO",
    "task": "Compile posture trend data into the same report"
   },
   {
    "role": "DPO",
    "task": "Present findings and posture trend at the board meeting"
   }
  ]
 },
 {
  "id": "WF-AN-02",
  "name": "SDF threshold monitoring",
  "domain": "Audit, Analytics & Board Reporting",
  "trigger": "volume growth.",
  "gap": null,
  "step1note": null,
  "steps": [
   {
    "role": "DPO",
    "task": "Review current user-growth and processing-volume data"
   },
   {
    "role": "DPO",
    "task": "Check figures against SDF notification thresholds",
    "mod": "Notifications"
   },
   {
    "role": "DPO",
    "task": "Confirm status change and resulting obligation set",
    "mod": "Audit & Compliance"
   }
  ]
 }
];

export const TASK_INDEX: Record<string, TaskRec> = {"Bulk-import pre-defined assets, processing activities, and data elements":{"module":"Data Discovery & Classification","role":"Admin","feature":"Bulk import tool for assets/activities/data elements","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P2"},"Configure field mapping and sync frequency":{"module":"Data Discovery & Classification","role":"Admin","feature":"Field-mapping and sync-frequency configuration panel","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Configure new discovery scan across approved sources":{"module":"Data Discovery & Classification","role":"Admin","feature":"Configurable discovery-scan builder scoped to approved sources","capability":"Data Discovery & Classification Engine","status":"Built","priority":"P1"},"Identify ROT (redundant, obsolete, trivial) data with no ongoing business value":{"module":"Data Discovery & Classification","role":"Admin","feature":"ROT data identification engine","capability":"Data Discovery & Classification Engine","status":"Built","priority":"P1"},"Identify duplicate or near-duplicate files/documents":{"module":"Data Discovery & Classification","role":"Admin","feature":"Duplicate/near-duplicate file detector","capability":"Data Discovery & Classification Engine","status":"Partial","priority":"P1"},"Merge confirmed duplicates or keep distinct profiles separate":{"module":"Data Discovery & Classification","role":"Admin","feature":"Identity merge/split action tool","capability":"Identity & Access Engine","status":"Not Built","priority":"P2"},"Onboard newly discovered sources into inventory":{"module":"Data Discovery & Classification","role":"Admin","feature":"One-click source onboarding into data inventory","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Override an existing classification label with a corrected one":{"module":"Data Discovery & Classification","role":"Admin","feature":"Manual classification-label override tool","capability":"Data Discovery & Classification Engine","status":"Not Built","priority":"P1"},"Push classification metadata to an external data catalog":{"module":"Data Discovery & Classification","role":"Admin","feature":"Data-catalog integration/export for classification metadata","capability":"Audit Logging Engine","status":"Not Built","priority":"P2"},"Quarantine files flagged as high-risk pending review":{"module":"Data Discovery & Classification","role":"Admin","feature":"High-risk file quarantine action","capability":"Data Discovery & Classification Engine","status":"Partial","priority":"P1"},"Review flagged near-duplicate profiles":{"module":"Data Discovery & Classification","role":"Admin","feature":"Near-duplicate identity review queue","capability":"Identity & Access Engine","status":"Not Built","priority":"P2"},"Review scan results":{"module":"Data Discovery & Classification","role":"Admin","feature":"Discovery scan results viewer","capability":"Data Discovery & Classification Engine","status":"Partial","priority":"P1"},"Run identity resolution using approved matching threshold":{"module":"Data Discovery & Classification","role":"Admin","feature":"Configurable-threshold identity resolution engine","capability":"SLA / Deadline Engine","status":"Not Built","priority":""},"Schedule scan to avoid timeout on large legacy source":{"module":"Data Discovery & Classification","role":"Admin","feature":"Scan scheduler with timeout-avoidance configuration","capability":"Data Discovery & Classification Engine","status":"Partial","priority":"P1"},"Trigger scheduled reassessment of existing data mapping":{"module":"Data Discovery & Classification","role":"Admin","feature":"Scheduled data-mapping reassessment trigger","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Update data flow diagram for new integration":{"module":"Data Discovery & Classification","role":"Admin","feature":"Auto-updating data flow diagram on integration change","capability":"Data Discovery & Classification Engine","status":"Built","priority":"P1"},"Approve or reject scan scope expansion":{"module":"Data Discovery & Classification","role":"DPO","feature":"Scan-scope approval/rejection workflow","capability":"Data Discovery & Classification Engine","status":"Not Built","priority":"P1"},"Confirm whether the spike reflects real risk or a reporting artifact":{"module":"Data Discovery & Classification","role":"DPO","feature":"Anomaly classification tool (real risk vs. artifact)","capability":"Data Discovery & Classification Engine","status":"Not Built","priority":"P2"},"Receive request to add new sources to discovery scan scope":{"module":"Data Discovery & Classification","role":"DPO","feature":"Discovery-scope-change request intake","capability":"Data Discovery & Classification Engine","status":"Not Built","priority":"P2"},"Add node and connection to the flow map":{"module":"Data Flow & Protection Rules","role":"Admin","feature":"Flow-map node/connection editor","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Adjust rule scope to resolve legitimate process conflict":{"module":"Data Flow & Protection Rules","role":"Admin","feature":"Rule-scope adjustment tool for conflict resolution","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Configure rule scope to the correct data category":{"module":"Data Flow & Protection Rules","role":"Admin","feature":"Rule-scope configuration by data category","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Implement approved data protection rule":{"module":"Data Flow & Protection Rules","role":"Admin","feature":"Protection-rule technical implementation tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Investigate exception request against the rule":{"module":"Data Flow & Protection Rules","role":"Admin","feature":"Rule-exception investigation workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Map users to correct entity scope":{"module":"Data Flow & Protection Rules","role":"Admin","feature":"User-to-entity access scoping tool","capability":"Identity & Access Engine","status":"Not Built","priority":""},"Adjudicate the exception and adjust rule scope accordingly":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"Exception adjudication and rule-scope adjustment tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Define the new data protection rule and its scope":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"Protection rule definition tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Identify a gap against the risk-tier standard":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"Risk-tier gap identification tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Investigate the legitimate process the rule is blocking":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"Rule-conflict investigation workspace","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Receive a DPO-flagged risk requiring a new protection rule":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"DPO-flagged-risk intake for rule creation","capability":"Workflow / Queue Engine","status":"Not Built","priority":""},"Receive an exception request against the new rule":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"Rule exception request intake","capability":"Workflow / Queue Engine","status":"Not Built","priority":""},"Require remediation before approval":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"Remediation-required gate before approval","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Set rule strictness tier":{"module":"Data Flow & Protection Rules","role":"CISO","feature":"Rule strictness tier configuration","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Review data flow map for a processing activity":{"module":"Data Flow & Protection Rules","role":"DPO","feature":"Data flow map viewer per activity","capability":"Data Discovery & Classification Engine","status":"Not Built","priority":""},"Bulk-apply purpose tag across relevant data category":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Bulk purpose-tag application across data categories","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Configure regional/language display variants":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Region/language notice-variant configuration","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Fix a display issue found during testing":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Notice display-issue fix workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Import and reconcile existing policies already in use into the platform":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Existing-policy import and reconciliation tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Maintain and draw from a template library of standard notices/policies":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Notice/policy template library","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Maintain version history for every notice/policy change":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Notice/policy version history tracker","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Publish approved notice to the app":{"module":"Data Privacy Notice Management","role":"Admin","feature":"One-click notice publishing to live app/website","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Tag new product's data fields against approved purpose":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Purpose-tagging tool for data fields","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Test notice rendering across devices":{"module":"Data Privacy Notice Management","role":"Admin","feature":"Cross-device notice rendering test tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Approve notice for publishing":{"module":"Data Privacy Notice Management","role":"DPO","feature":"Notice approval-for-publishing workflow","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Receive 48-hour advance erasure notice":{"module":"Data Privacy Notice Management","role":"Data Principal","feature":"48-hour advance erasure notice delivery","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Review notice content and options":{"module":"Data Privacy Notice Management","role":"Data Principal","feature":"Erasure notice detail and options view","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Bulk-import pre-existing consent records from a legacy or retiring system":{"module":"Consent Management Platform","role":"Admin","feature":"Bulk consent-record import tool","capability":"Consent Engine","status":"Not Built","priority":"P3"},"Capture consent via a branch or BC-point collection flow":{"module":"Consent Management Platform","role":"Admin","feature":"Branch/BC-point consent capture interface","capability":"Consent Engine","status":"Partial","priority":"P1"},"Configure Preference Center branding and display customization":{"module":"Consent Management Platform","role":"Admin","feature":"Preference Center branding/customization panel","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Configure Universal Consent API parameters for a new data field requirement":{"module":"Consent Management Platform","role":"Admin","feature":"Configurable Universal Consent API field parameters","capability":"Consent Engine","status":"Partial","priority":"P1"},"Configure a webhook for partner/API-based consent access":{"module":"Consent Management Platform","role":"Admin","feature":"Webhook configuration for consent API access","capability":"Consent Engine","status":"Built","priority":"P1"},"Configure auto-expiry rules for consent based on retention timelines":{"module":"Consent Management Platform","role":"Admin","feature":"Configurable consent auto-expiry engine","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Configure auto-generation of consent notices across required Indian languages":{"module":"Consent Management Platform","role":"Admin","feature":"Multi-language (Schedule 8) auto-generated consent notices","capability":"Consent Engine","status":"Partial","priority":"P1"},"Confirm assisted-channel submissions feed into the same central system as digital ones":{"module":"Consent Management Platform","role":"Admin","feature":"Unified request/consent record across all channels","capability":"Consent Engine","status":"Partial","priority":"P1"},"Identify and fix a script firing before consent capture":{"module":"Consent Management Platform","role":"Admin","feature":"Pre-consent script-firing detector and fix workflow","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Set up business-unit consent isolation within the organization":{"module":"Consent Management Platform","role":"Admin","feature":"Business-unit consent isolation configuration","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Submit request on behalf of the customer, tagged with assisted-channel origin":{"module":"Consent Management Platform","role":"Admin","feature":"On-behalf-of request submission with channel-origin tagging","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Support offline-capable consent capture for low-connectivity locations":{"module":"Consent Management Platform","role":"Admin","feature":"Offline-capable consent capture mode","capability":"Consent Engine","status":"Not Built","priority":"P2"},"Sync offline-collected consent once connectivity is restored":{"module":"Consent Management Platform","role":"Admin","feature":"Offline-to-online consent sync engine","capability":"Consent Engine","status":"Not Built","priority":"P2"},"Verify each language variant renders and reads correctly":{"module":"Consent Management Platform","role":"Admin","feature":"Language-variant rendering verification tool","capability":"Completion Verification Engine","status":"Partial","priority":"P1"},"Verify granular, timestamped, purpose-specific consent artifacts are retrievable via API":{"module":"Consent Management Platform","role":"Admin","feature":"API-retrievable granular consent artifact store","capability":"Consent Engine","status":"Partial","priority":"P1"},"Verify identity through in-person/assisted verification method":{"module":"Consent Management Platform","role":"Admin","feature":"In-person/assisted identity verification flow","capability":"Completion Verification Engine","status":"Not Built","priority":"P2"},"Confirm consent change has been applied":{"module":"Consent Management Platform","role":"Data Principal","feature":"Real-time consent-change confirmation","capability":"Completion Verification Engine","status":"Partial","priority":"P1"},"Identify an unfamiliar or inferred data category":{"module":"Consent Management Platform","role":"Data Principal","feature":"Inferred/derived data labeling in footprint view","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Open consent preference center":{"module":"Consent Management Platform","role":"Data Principal","feature":"Consent preference center screen","capability":"Consent Engine","status":"Partial","priority":"P1"},"Open privacy/account settings":{"module":"Consent Management Platform","role":"Data Principal","feature":"Unified privacy/account settings entry point","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Review current consent state by purpose and processor":{"module":"Consent Management Platform","role":"Data Principal","feature":"Consent state view by purpose and processor","capability":"Consent Engine","status":"Not Built","priority":"P1"},"View summary of data held and processing purposes":{"module":"Consent Management Platform","role":"Data Principal","feature":"Plain-language data footprint summary view","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Withdraw consent for a specific processor":{"module":"Consent Management Platform","role":"Data Principal","feature":"Granular per-processor consent withdrawal control","capability":"Consent Engine","status":"Built","priority":"P1"},"Auto-block the undisclosed script pending proper categorization":{"module":"Cookie Consent Management","role":"Admin","feature":"Undisclosed Script Auto-Blocker","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Configure banner to reflect approved default state":{"module":"Cookie Consent Management","role":"Admin","feature":"Cookie banner default-state configuration","capability":"Consent Engine","status":"Built","priority":"P1"},"Confirm a cookie policy version change triggers reconsent for returning visitors":{"module":"Cookie Consent Management","role":"Admin","feature":"Version-change-triggered reconsent prompt","capability":"Consent Engine","status":"Built","priority":"P1"},"Flag the gap for policy update":{"module":"Cookie Consent Management","role":"Admin","feature":"Policy-update flagging workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify a script not covered by the published cookie policy":{"module":"Cookie Consent Management","role":"Admin","feature":"Policy-vs-script gap detector","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Implement new cookie consent category technically":{"module":"Cookie Consent Management","role":"Admin","feature":"Cookie category technical implementation builder","capability":"Consent Engine","status":"Built","priority":"P1"},"Review scan results for undisclosed cookies or scripts":{"module":"Cookie Consent Management","role":"Admin","feature":"Undisclosed cookie/script results viewer","capability":"Consent Engine","status":"Built","priority":"P1"},"Run scheduled full-domain cookie/tracker scan":{"module":"Cookie Consent Management","role":"Admin","feature":"Scheduled full-domain cookie/tracker scanner","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Verify geo-detection correctly serves the appropriate compliance model by visitor location":{"module":"Cookie Consent Management","role":"Admin","feature":"Geo-based compliance-model banner logic","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Verify language auto-detection serves the correct banner variant":{"module":"Cookie Consent Management","role":"Admin","feature":"Auto-language-detection banner logic","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Define the cookie category and its default consent state":{"module":"Cookie Consent Management","role":"DPO","feature":"Cookie category and default-state definition tool","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Receive request for a new cookie consent category":{"module":"Cookie Consent Management","role":"DPO","feature":"Cookie-category request intake","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Auto-assign the request to an available reviewer by type":{"module":"Data Principal Rights Management","role":"Admin","feature":"Auto-assignment engine by request type and reviewer availability","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P2"},"Check for legal-retention exceptions before proceeding":{"module":"Data Principal Rights Management","role":"Admin","feature":"Automated retention-exception check gate before deletion execution","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Compile cross-system completion evidence":{"module":"Data Principal Rights Management","role":"Admin","feature":"Automated completion-evidence compiler across all systems","capability":"Completion Verification Engine","status":"Partial","priority":"P1"},"Create a sub-task within a complex request requiring multiple owners":{"module":"Data Principal Rights Management","role":"Admin","feature":"Sub-task creation within a parent DPRR ticket","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P2"},"Cross-check the deletion request against active retention flags":{"module":"Data Principal Rights Management","role":"Admin","feature":"Retention-flag cross-check on deletion requests","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Generate export-ready reports of DPRR queue activity for DPB or internal reporting":{"module":"Data Principal Rights Management","role":"Admin","feature":"Export-ready DPRR activity reporting","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Identify every connected system and processor holding the customer's data":{"module":"Data Principal Rights Management","role":"Admin","feature":"Data-location lookup across the full connected-system and processor inventory","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Investigate and resolve any system reporting a failed or partial deletion":{"module":"Data Principal Rights Management","role":"Admin","feature":"Failed-deletion investigation and retry workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Manually verify systems with no API-based confirmation available":{"module":"Data Principal Rights Management","role":"Admin","feature":"Manual verification checklist for non-integrated systems","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Monitor time remaining against the regulatory deadline for each open request":{"module":"Data Principal Rights Management","role":"Admin","feature":"Regulatory deadline countdown per DPRR ticket","capability":"SLA / Deadline Engine","status":"Built","priority":"P1"},"Reassign a ticket when the original reviewer is unavailable":{"module":"Data Principal Rights Management","role":"Admin","feature":"Ticket reassignment tool","capability":"Workflow / Queue Engine","status":"Built","priority":"P1"},"Receive and log a new DPRR (access/correction/deletion/nomination) into the central queue":{"module":"Data Principal Rights Management","role":"Admin","feature":"Central DPRR intake queue across all request types","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P1"},"Receive in-person or phone-based rights request from a customer":{"module":"Data Principal Rights Management","role":"Admin","feature":"Assisted-channel rights request intake form","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P2"},"Send deletion instruction to the third-party Data Processor":{"module":"Data Principal Rights Management","role":"Admin","feature":"Processor instruction dispatcher with DPA-scope validation","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Track each sub-task to completion under the parent ticket":{"module":"Data Principal Rights Management","role":"Admin","feature":"Sub-task completion tracker under parent ticket","capability":"Completion Verification Engine","status":"Not Built","priority":"P2"},"Track per-system completion status as confirmations come in":{"module":"Data Principal Rights Management","role":"Admin","feature":"Per-system completion status tracker (pending/partial/verified states)","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Trigger deletion in cloud backup/archive storage":{"module":"Data Principal Rights Management","role":"Admin","feature":"Backup/archive deletion scheduler with delayed-execution support","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Trigger deletion in the marketing platform":{"module":"Data Principal Rights Management","role":"Admin","feature":"Deletion trigger for marketing platform integration","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Trigger deletion in the primary CRM":{"module":"Data Principal Rights Management","role":"Admin","feature":"One-click deletion trigger for primary CRM integration","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Trigger deletion in the transaction ledger, respecting any statutory retention flag":{"module":"Data Principal Rights Management","role":"Admin","feature":"Ledger deletion executor with field-level retention-flag exclusion","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Validate request scope against customer identifiers":{"module":"Data Principal Rights Management","role":"Admin","feature":"Identifier-based scope validator for incoming deletion requests","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Check request status via self-service portal":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Self-service status tracking portal","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Choose identity verification method":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Verification-method selector","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Complete the scoped request form":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Minimal-friction, right-specific request form","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Complete verification (OTP)":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"OTP verification flow","capability":"Completion Verification Engine","status":"Partial","priority":"P1"},"Confirm nomination saved":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Nomination save confirmation","capability":"Completion Verification Engine","status":"Built","priority":"P1"},"Decide to act or allow erasure to proceed":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Erasure action/no-action decision control","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Enter nominee details":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Nominee details form","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Open nomination designation flow on a separate platform":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Nomination designation entry point","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Receive denial on a filed correction request":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Denial notification for correction request","capability":"Notification Engine","status":"Built","priority":"P1"},"Respond to additional verification request":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Additional-verification response form","capability":"Completion Verification Engine","status":"Not Built","priority":"P2"},"Select the right to exercise (erasure)":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Rights-selection interface (access/correction/erasure/nomination)","capability":"Identity & Access Engine","status":"Built","priority":"P1"},"Submit request and receive tracking ID":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Request submission with tracking ID","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Upload supporting attachment as part of identity verification":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"Attachment upload for identity verification","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Use two-way messaging thread to communicate with the organization about the request":{"module":"Data Principal Rights Management","role":"Data Principal","feature":"In-request two-way messaging thread","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Confirm client acceptance of submitted evidence":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Client acceptance confirmation tracker","capability":"Completion Verification Engine","status":"Not Built","priority":"P2"},"Confirm instruction is within authorized scope":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Scope-authorization confirmation control","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Execute deletion action":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Deletion execution tool","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Format evidence to match client's required schema":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Client-schema-matched evidence formatter","capability":"Completion Verification Engine","status":"Not Built","priority":""},"Generate structured completion evidence":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Structured completion-evidence generator","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Receive deletion instruction from Fiduciary client":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Instruction intake from Fiduciary client","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P1"},"Submit evidence through the designated channel":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Designated-channel evidence submission","capability":"Completion Verification Engine","status":"Built","priority":"P1"},"Validate exact records the instruction applies to":{"module":"Data Principal Rights Management","role":"Data Processor","feature":"Record-scope validation tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Link incident to relevant DPIA and consent records for impact traceability":{"module":"DPIA (Risk Assessment)","role":"CISO","feature":"Incident-to-DPIA/consent linkage tool","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Assign CISO as co-reviewer for the algorithmic-risk section":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Co-reviewer assignment for DPIA sections","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P2"},"Calculate residual risk after mitigation steps are defined":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Residual-risk calculator post-mitigation","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Complete the purpose and risk-management sections":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Purpose and risk-management section editor","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Export DPIA report for DPB or auditor submission":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"DPIA export tool for regulatory/audit submission","capability":"Audit Logging Engine","status":"Built","priority":"P1"},"Link relevant PII types, processors, and purposes directly while creating the assessment":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"PII/processor/purpose linking within DPIA builder","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Log DPIA and ROPA updates in the compliance record":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Auto-logged DPIA/ROPA compliance record","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Notify product team of DPIA completion and any conditions":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"DPIA-completion notification to requesting team","capability":"Notification Engine","status":"Not Built","priority":"P1"},"Open a new DPIA record for the activity":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"New DPIA record creation tool","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Pull existing data mapping to populate itemized data categories":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"DPIA Data-Category Auto-Populator","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Receive and confirm the flagged activity":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"High-risk activity flag confirmation workflow","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Review DPIA metrics (time-to-complete, top risk domains, mitigation effectiveness)":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"DPIA performance metrics dashboard","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Review and reconcile co-reviewer feedback":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Reviewer feedback reconciliation workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Sign off on the DPIA before launch approval is granted":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"DPIA sign-off gate before launch approval","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"System auto-recommends a DPIA for a new high-risk processing activity":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Auto-DPIA-recommendation trigger for high-risk activities","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Trace the DPIA back to its originating consented activity":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"DPIA-to-consent-record linkage tool","capability":"Consent Engine","status":"Partial","priority":"P1"},"Trigger periodic re-assessment when underlying processing or legislation changes":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Change-triggered DPIA re-assessment scheduler","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Upload supporting documentation (architecture diagrams, policies)":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"DPIA supporting-document upload feature","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Use a guided, questionnaire-based flow to structure the risk assessment":{"module":"DPIA (Risk Assessment)","role":"DPO","feature":"Guided questionnaire-based DPIA builder","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Add new entry for the newly launched processing activity":{"module":"ROPA","role":"DPO","feature":"New ROPA entry creation tool","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Archive the discontinued entry":{"module":"ROPA","role":"DPO","feature":"ROPA entry archiving tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Cross-check existing entries against live system behavior":{"module":"ROPA","role":"DPO","feature":"ROPA-vs-live-system drift checker","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify a stale entry for discontinued processing":{"module":"ROPA","role":"DPO","feature":"Stale ROPA entry detector","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Open ROPA for scheduled quarterly review":{"module":"ROPA","role":"DPO","feature":"Scheduled ROPA review cycle trigger","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Auto-calculate incident severity based on volume, PII type, and sensitivity":{"module":"Personal Data Breach Management","role":"CISO","feature":"Auto-severity calculator for incidents","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Categorize the incident by type":{"module":"Personal Data Breach Management","role":"CISO","feature":"Incident type categorization tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Compile complete package and hand off to DPO for Board notification":{"module":"Personal Data Breach Management","role":"CISO","feature":"Complete incident package handoff to DPO","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify a likely processor-side source based on the pattern":{"module":"Personal Data Breach Management","role":"CISO","feature":"Processor-source pattern identification tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Identify the specific closed cohort of affected Data Principals":{"module":"Personal Data Breach Management","role":"CISO","feature":"Closed-cohort affected-principal identifier","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Map affected PII fields, purposes, and processors potentially involved":{"module":"Personal Data Breach Management","role":"CISO","feature":"Incident-to-PII/purpose/processor mapping tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Proactively reach out to the processor to investigate":{"module":"Personal Data Breach Management","role":"CISO","feature":"Proactive processor-investigation outreach workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Receive incident report through public/external self-service channel":{"module":"Personal Data Breach Management","role":"CISO","feature":"Public/external self-service incident reporting channel","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Receive processor's confirmation and remediation details":{"module":"Personal Data Breach Management","role":"CISO","feature":"Processor remediation-response intake","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P1"},"Assess initial scope of potential incident":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Initial incident-scope assessment workspace","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Confirm alignment with client's policy":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Retention-alignment confirmation","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Continue investigation to determine full scope":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Incident investigation continuation workspace","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Correct the retention configuration":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Retention configuration correction tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Cross-check against that client's current retention policy":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Client-policy cross-check tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Detect unusual access activity during security review":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Access-anomaly detection tool","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Identify a client running an outdated default retention setting":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Outdated-retention-setting detector","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Review retention configuration across active Fiduciary clients":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Per-client retention configuration viewer","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Send initial breach notification to affected Fiduciary client":{"module":"Personal Data Breach Management","role":"Data Processor","feature":"Initial breach notification dispatcher","capability":"Notification Engine","status":"Not Built","priority":"P1"},"Identify case where internal redressal is exhausted":{"module":"Personal Data Breach Management","role":"Grievance Officer","feature":"Internal-redressal-exhausted flag","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Flag a vendor for non-compliance (breach, retention lapse) when identified":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"Vendor non-compliance flagging tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Receive and act on an alert when a vendor misses a committed SLA":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"Vendor SLA breach alert","capability":"Notification Engine","status":"Not Built","priority":"P1"},"Support automatic email notifications and workflows throughout the lifecycle of the incident":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"P1","capability":"","status":"","priority":"P1"},"Customizable, automated workflows with assignable sub-tasks for each documented incident":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"P1","capability":"","status":"","priority":"P1"},"Support assigning breach resolution tasks to internal compliance, legal, and IT teams":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"P1","capability":"","status":"","priority":"P1"},"Have workflows to reach out to processors responsible for the breach and collect remediation responses":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"P1","capability":"","status":"","priority":"P1"},"Provide visual representation of Breach-PII-Processor-Consent impact in a mind map format":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"P2","capability":"","status":"","priority":"P2"},"Track breach response and notification timelines to ensure regulatory compliance within 72 hours":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"P1","capability":"","status":"","priority":"P1"},"Real time dashboard for breach trends, response timelines":{"module":"Personal Data Breach Management","role":"Legal / Procurement","feature":"P1","capability":"","status":"","priority":"P1"},"Use guided questionnaires to support new data-mapping initiatives for vendor":{"module":"Third Party Vendor Risk Management","role":"Admin","feature":"Guided questionnaire builder for data-mapping initiatives","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify an undisclosed sub-processor transfer":{"module":"Third Party Vendor Risk Management","role":"DPO","feature":"Undisclosed-transfer detector on flow map","capability":"Data Discovery & Classification Engine","status":"Not Built","priority":"P1"},"Review the Data Processor contract registry":{"module":"Third Party Vendor Risk Management","role":"DPO","feature":"DPA registry viewer","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Route flagged flow to Legal for DPA verification":{"module":"Third Party Vendor Risk Management","role":"DPO","feature":"Flow-to-Legal routing for DPA check","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Activate engagement once approved":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"Post-approval engagement activation","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Attach sub-processor's compliance documentation":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"Compliance-documentation attachment feature","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Check instruction against current DPA scope":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"DPA-scope validation on instruction receipt","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Hold engagement pending formal approval":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"Engagement-hold gate pending approval","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify need for a new sub-processor engagement":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"Sub-processor-need identification workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Pull from continuously maintained evidence package":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"Continuously maintained evidence package store","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Register sub-processor disclosure":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"Sub-processor disclosure registration tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Submit disclosure for Fiduciary approval":{"module":"Third Party Vendor Risk Management","role":"Data Processor","feature":"Disclosure submission-for-approval workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Assign a customized assessment questionnaire to the vendor":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Customizable vendor assessment questionnaire assignment","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P1"},"Maintain the vendor database as relationships are added or change":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Central vendor database management","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Map approved vendor to specific purposes and PII types handled":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Vendor-to-purpose/PII mapping tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Pull baseline risk rating for a prospective vendor's category":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Baseline vendor risk rating lookup by category","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Review completed assessment and finalize risk classification":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Assessment review and risk classification tool","capability":"Data Discovery & Classification Engine","status":"Not Built","priority":"P1"},"Track deletion/access acknowledgment timelines against vendor SLA commitments":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Vendor SLA timeline tracker","capability":"SLA / Deadline Engine","status":"Not Built","priority":"P2"},"Use the processor-purpose-PII visualization to trace which vendors touch a specific data category":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Interactive processor-purpose-PII mind-map visualization","capability":"Bespoke / Scenario-Specific","status":"Partially Built","priority":"P1"},"Vendor completes questionnaire via self-service portal":{"module":"Third Party Vendor Risk Management","role":"Legal / Procurement","feature":"Vendor self-service assessment portal","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Await a documented ruling":{"module":"Grievance & Escalation Management","role":"Admin","feature":"Escalation status tracker pending DPO ruling","capability":"SLA / Deadline Engine","status":"Built","priority":"P1"},"Compile context and supporting evidence for escalation":{"module":"Grievance & Escalation Management","role":"Admin","feature":"Escalation context compiler with evidence attachment","capability":"SLA / Deadline Engine","status":"Not Built","priority":"P1"},"Confirm automatic escalation to the Data Protection Board fires when SLA lapses without manual intervention":{"module":"Grievance & Escalation Management","role":"Admin","feature":"Automatic DPB escalation trigger on SLA lapse","capability":"SLA / Deadline Engine","status":"Partial","priority":"P1"},"Deliver the evidence to the Grievance Officer":{"module":"Grievance & Escalation Management","role":"Admin","feature":"Evidence delivery channel to Grievance module","capability":"Completion Verification Engine","status":"Partial","priority":"P1"},"Escalate the conflict to the DPO with full context attached":{"module":"Grievance & Escalation Management","role":"Admin","feature":"One-click escalation-to-DPO with attached context package","capability":"SLA / Deadline Engine","status":"Partial","priority":"P1"},"Mark the request fully verified and notify the Grievance Officer":{"module":"Grievance & Escalation Management","role":"Admin","feature":"Verified-completion sign-off with automatic Grievance Officer notification","capability":"Notification Engine","status":"Built","priority":"P1"},"Receive an audit evidence request from the Grievance Officer":{"module":"Grievance & Escalation Management","role":"Admin","feature":"Audit-evidence request intake from Grievance module","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Receive and open escalated deletion request from Grievance Officer":{"module":"Grievance & Escalation Management","role":"Admin","feature":"Deletion request intake queue with escalation source tagging","capability":"SLA / Deadline Engine","status":"Partial","priority":"P1"},"Receive an escalated conflict from Admin":{"module":"Grievance & Escalation Management","role":"DPO","feature":"Conflict escalation intake from Admin","capability":"SLA / Deadline Engine","status":"Partial","priority":"P1"},"Confirm original request context carried into the grievance automatically":{"module":"Grievance & Escalation Management","role":"Data Principal","feature":"Request-to-Grievance Context Carryover","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Initiate grievance escalation from the denial screen":{"module":"Grievance & Escalation Management","role":"Data Principal","feature":"One-click grievance escalation from denial screen","capability":"SLA / Deadline Engine","status":"Not Built","priority":"P1"},"Track grievance status through to resolution":{"module":"Grievance & Escalation Management","role":"Data Principal","feature":"Grievance status tracking view","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Assess a separate case for legal validity":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Legal-validity assessment tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Capture complainant contact and case metadata":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Complainant metadata capture form","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Close case with remedy confirmed":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Case closure with remedy confirmation","capability":"Completion Verification Engine","status":"Built ","priority":"P1"},"Compile full case documentation and timeline":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Full case documentation compiler","capability":"Bespoke / Scenario-Specific","status":"Built ","priority":"P1"},"Compile periodic case volume and resolution data":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Case volume/resolution reporting tool","capability":"Bespoke / Scenario-Specific","status":"Built ","priority":"P1"},"Confirm dependent team acts before deadline lapses":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Dependency follow-up confirmation tracker","capability":"Completion Verification Engine","status":"Built ","priority":"P1"},"Confirm documentation completeness before submission":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Documentation completeness checklist","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Coordinate with Admin to confirm underlying facts":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Cross-role fact-verification request to Admin","capability":"Completion Verification Engine","status":"Partial","priority":"P1"},"Determine case validity":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Case validity determination tool","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Determine whether original denial should be upheld or reversed":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Appeal decision tool","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Document appeal outcome and reasoning":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Appeal outcome documentation field","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Document corrective action for a valid case":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Corrective-action documentation field","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Document the systemic finding with supporting case references":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Systemic finding documentation with case linkage","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Draft denial citing specific applicable section":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Legal-citation denial drafting template","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Escalate internally to prevent silent SLA breach":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Internal pre-breach escalation trigger","capability":"SLA / Deadline Engine","status":"Built","priority":"P1"},"Flag case nearing the 90-day ceiling for priority handling":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"90-day-ceiling priority flagging","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Hand off case to Board escalation process":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Board escalation handoff tool","capability":"SLA / Deadline Engine","status":"Not Built","priority":"P1"},"Identify a case stalled awaiting dependent-team response":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Stalled-case detector by dependency","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify a systemic issue spanning multiple cases":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Cross-case systemic issue detector","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Inform complainant of escalation status":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Escalation-status notification to complainant","capability":"Notification Engine","status":"Not Built","priority":""},"Issue corrected resolution if denial is reversed":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Corrected-resolution issuance workflow","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Log grievance with timestamp":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Auto-Timestamped Grievance Log","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Notify complainant of appeal decision":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Appeal-decision notification to complainant","capability":"Notification Engine","status":"not required","priority":""},"Open investigation into flagged case":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Case investigation workspace","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Re-investigate incorporating any new information":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Appeal re-investigation workspace","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Reassign appeal to a fresh reviewer perspective":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Appeal reassignment tool","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P2"},"Receive internal appeal on a previously denied case":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Internal appeal intake form","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P2"},"Receive new grievance submission":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Multi-channel grievance intake form","capability":"Workflow / Queue Engine","status":"Partial","priority":"P1"},"Report findings and recommendation to DPO":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Systemic finding report to DPO","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Review data for recurring root-cause patterns":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Root-cause pattern analysis tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Review full open-case queue":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Open-case queue viewer","capability":"Workflow / Queue Engine","status":"Partial","priority":"P1"},"Send denial response to complainant":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Denial delivery to complainant","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Sort queue by deadline proximity":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Deadline-proximity queue sorting","capability":"SLA / Deadline Engine","status":"Partial","priority":"P1"},"Track whether recommended fix is actioned":{"module":"Grievance & Escalation Management","role":"Grievance Officer","feature":"Recommendation action-tracking tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Apply the role-based, least-privilege access template":{"module":"Identity & Access","role":"Admin","feature":"Least-privilege role-template engine for access provisioning","capability":"Identity & Access Engine","status":"Partial","priority":"P1"},"Confirm full revocation is complete":{"module":"Identity & Access","role":"Admin","feature":"Revocation completion verification dashboard","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Correct drifted role permissions":{"module":"Identity & Access","role":"Admin","feature":"Role permission correction tool","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Grant scoped access across required systems":{"module":"Identity & Access","role":"Admin","feature":"Multi-system scoped access provisioning tool","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Identify roles with accumulated, drifted permissions":{"module":"Identity & Access","role":"Admin","feature":"Permission-drift detector across role definitions","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Receive new-hire access request":{"module":"Identity & Access","role":"Admin","feature":"New-hire access request intake form","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Receive offboarding trigger for a departing employee":{"module":"Identity & Access","role":"Admin","feature":"HR-system-integrated offboarding trigger listener","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Review the RBAC permission matrix against the least-privilege baseline":{"module":"Identity & Access","role":"Admin","feature":"RBAC drift comparison view against original baseline","capability":"Identity & Access Engine","status":"Not Built","priority":"P2"},"Review the periodic dormant/orphaned account report":{"module":"Identity & Access","role":"Admin","feature":"Scheduled dormant-account detection report","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Revoke access across every connected system":{"module":"Identity & Access","role":"Admin","feature":"Cross-system bulk access revocation tool","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Revoke or retain the flagged account with documented justification":{"module":"Identity & Access","role":"Admin","feature":"Account disposition action with mandatory justification field","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Terminate active sessions and lingering tokens":{"module":"Identity & Access","role":"Admin","feature":"Active session/token termination on revocation","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Connect newly approved integration":{"module":"Integrations","role":"Admin","feature":"Integration connector setup wizard","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Set up integration health monitoring":{"module":"Integrations","role":"Admin","feature":"Integration health monitoring with failure alerts","capability":"Notification Engine","status":"Not Built","priority":"P3"},"Approve integration once remediated":{"module":"Integrations","role":"CISO","feature":"Post-remediation integration approval","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Receive request to approve a new integration":{"module":"Integrations","role":"CISO","feature":"Integration approval request intake","capability":"Workflow / Queue Engine","status":"Partial","priority":"P2"},"Review integration's security posture against required criteria":{"module":"Integrations","role":"CISO","feature":"Integration security posture review tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Set up technical entity configuration for acquired platform":{"module":"Entity Configuration (Fiduciaries)","role":"Admin","feature":"Multi-entity technical configuration builder","capability":"Identity & Access Engine","status":"Built","priority":"P1"},"Approve a stricter matching threshold":{"module":"Entity Configuration (Fiduciaries)","role":"DPO","feature":"Matching-threshold approval control","capability":"SLA / Deadline Engine","status":"Not Built","priority":"P2"},"Flag flow for enhanced monitoring":{"module":"Entity Configuration (Fiduciaries)","role":"DPO","feature":"Flow-level enhanced-monitoring flag","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify a threshold generating false positives":{"module":"Entity Configuration (Fiduciaries)","role":"DPO","feature":"False-positive threshold identifier","capability":"SLA / Deadline Engine","status":"Not Built","priority":"P1"},"Investigate a flagged potential mismatch":{"module":"Entity Configuration (Fiduciaries)","role":"DPO","feature":"Mismatch investigation workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Review identity-resolution accuracy report":{"module":"Entity Configuration (Fiduciaries)","role":"DPO","feature":"Identity-match accuracy report","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Review newly acquired entity's SDF/compliance status separately":{"module":"Entity Configuration (Fiduciaries)","role":"DPO","feature":"Per-entity SDF/compliance status viewer","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Set entity-specific policy variation":{"module":"Entity Configuration (Fiduciaries)","role":"DPO","feature":"Entity-specific policy configuration tool","capability":"Identity & Access Engine","status":"Not Built","priority":"P1"},"Approve category policy for technical implementation":{"module":"Approved Policy","role":"DPO","feature":"Cookie-policy approval-for-build workflow","capability":"Consent Engine","status":"Not Built","priority":"P1"},"Approve purpose for use":{"module":"Approved Policy","role":"DPO","feature":"Purpose approval workflow","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Assess whether sources genuinely need to be in scope":{"module":"Approved Policy","role":"DPO","feature":"Scope-necessity assessment tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Check notice against Rule 3 itemization requirements":{"module":"Approved Policy","role":"DPO","feature":"Rule 3 itemization compliance checklist","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Define a new purpose category":{"module":"Approved Policy","role":"DPO","feature":"Purpose category definition tool","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Identify a processing activity with no matching purpose category":{"module":"Approved Policy","role":"DPO","feature":"Unmatched-purpose activity detector","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Review draft notice language for a new product":{"module":"Approved Policy","role":"DPO","feature":"Notice draft review tool","capability":"Bespoke / Scenario-Specific","status":"Built","priority":"P1"},"Audit script-firing behavior against policy":{"module":"Audit & Compliance","role":"Admin","feature":"Script-firing-vs-policy audit tool","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Confirm consent artifacts are being created as immutable, tamper-proof records":{"module":"Audit & Compliance","role":"Admin","feature":"Immutable consent artifact generator (MeitY framework aligned)","capability":"Audit Logging Engine","status":"Built","priority":"P1"},"Confirm the access grant is logged for audit":{"module":"Audit & Compliance","role":"Admin","feature":"Auto-logged access-grant audit trail","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Document the permission change for the audit trail":{"module":"Audit & Compliance","role":"Admin","feature":"Auto-logged permission-change audit entry","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Execute the action per the DPO's ruling":{"module":"Audit & Compliance","role":"Admin","feature":"Ruling-triggered action executor","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Export the evidence in the required format":{"module":"Audit & Compliance","role":"Admin","feature":"Configurable evidence export (PDF/CSV/JSON)","capability":"Completion Verification Engine","status":"Not Built","priority":"P1"},"Export the monthly scan compliance report":{"module":"Audit & Compliance","role":"Admin","feature":"Scheduled monthly compliance report export","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Extract the relevant timestamped log entries":{"module":"Audit & Compliance","role":"Admin","feature":"Timestamped log entry extraction tool","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Grant and document a deadline extension where genuinely warranted":{"module":"Audit & Compliance","role":"Admin","feature":"Deadline extension tool with justification log","capability":"Audit Logging Engine","status":"Not Built","priority":"P2"},"Identify a conflict with a statutory retention obligation":{"module":"Audit & Compliance","role":"Admin","feature":"Retention-conflict detector","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Investigate a flagged account's legitimacy":{"module":"Audit & Compliance","role":"Admin","feature":"Flagged-account investigation workflow with justification logging","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Log completion timestamp and evidence in the audit trail":{"module":"Audit & Compliance","role":"Admin","feature":"Immutable audit-log entry generator for completed deletions","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Log the escalation and its resolution in the audit trail":{"module":"Audit & Compliance","role":"Admin","feature":"Auto-logged escalation-resolution audit entry","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Receive a new deletion instruction":{"module":"Audit & Compliance","role":"Admin","feature":"Deletion instruction intake","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P1"},"Search the unified audit log by customer identifier and date range":{"module":"Audit & Compliance","role":"Admin","feature":"Unified audit log search by identifier and date range","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Verify the entries actually reflect the consent-withdrawal and data-sharing-stop events":{"module":"Audit & Compliance","role":"Admin","feature":"Event-type verification filter for extracted log entries","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Assess impact of the change on current policy or product configuration":{"module":"Audit & Compliance","role":"DPO","feature":"Regulatory-change impact assessment tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Assign remediation ownership per finding":{"module":"Audit & Compliance","role":"DPO","feature":"Remediation ownership assignment tool","capability":"Workflow / Queue Engine","status":"Not Built","priority":"P1"},"Compile audit findings into board-appropriate language":{"module":"Audit & Compliance","role":"DPO","feature":"Board-language audit summary compiler","capability":"Audit Logging Engine","status":"Not Built","priority":"P3"},"Confirm status change and resulting obligation set":{"module":"Audit & Compliance","role":"DPO","feature":"SDF status confirmation with obligation-set mapping","capability":"Completion Verification Engine","status":"Not Built","priority":"P3"},"Draft the board/executive summary":{"module":"Audit & Compliance","role":"DPO","feature":"Board/executive report drafting tool","capability":"Bespoke / Scenario-Specific","status":"PArtial","priority":"P1"},"Drill into the underlying data to determine root cause":{"module":"Audit & Compliance","role":"DPO","feature":"Metric drill-down/root-cause explorer","capability":"Bespoke / Scenario-Specific","status":"already discussed","priority":"P1"},"Evaluate the conflict against the statutory retention exception":{"module":"Audit & Compliance","role":"DPO","feature":"Retention-exception evaluation tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Identify a processor renewal with outdated clause language":{"module":"Audit & Compliance","role":"DPO","feature":"Outdated-clause detector on renewal review","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Identify an unexplained metric spike":{"module":"Audit & Compliance","role":"DPO","feature":"Metric anomaly detector","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Identify an upcoming binding Rule commencement date":{"module":"Audit & Compliance","role":"DPO","feature":"Binding-date identification and flagging tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Investigate the specific factors contributing to a low journey-level score":{"module":"Audit & Compliance","role":"DPO","feature":"Journey-score factor breakdown viewer","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Issue a documented ruling":{"module":"Audit & Compliance","role":"DPO","feature":"Documented ruling issuance tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P1"},"Log any leadership follow-up actions requested":{"module":"Audit & Compliance","role":"DPO","feature":"Leadership follow-up action logger","capability":"Audit Logging Engine","status":"Not Built","priority":"P2"},"Log the escalation and resolution in the audit trail":{"module":"Audit & Compliance","role":"DPO","feature":"Auto-logged escalation-resolution audit entry","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Receive the independent auditor's annual report":{"module":"Audit & Compliance","role":"DPO","feature":"Auditor report intake","capability":"Audit Logging Engine","status":"Built","priority":"P1"},"Review DPDPA compliance score for a specific digital journey":{"module":"Audit & Compliance","role":"DPO","feature":"Journey-level DPDPA compliance scoring","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P2"},"Review draft for accuracy before distribution":{"module":"Audit & Compliance","role":"DPO","feature":"Report accuracy review checklist","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Review each significant finding in detail":{"module":"Audit & Compliance","role":"DPO","feature":"Audit finding detail viewer","capability":"Audit Logging Engine","status":"Not Built","priority":""},"Review the periodic regulatory-change digest":{"module":"Audit & Compliance","role":"DPO","feature":"Regulatory-change digest feed","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":""},"Route the flagged contract to Legal for review":{"module":"Audit & Compliance","role":"DPO","feature":"Contract routing-to-Legal workflow","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Set tracking checkpoints for remediation progress":{"module":"Audit & Compliance","role":"DPO","feature":"Remediation progress checkpoint tracker","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Compile requested documentation":{"module":"Audit & Compliance","role":"Data Processor","feature":"Audit documentation compiler","capability":"Audit Logging Engine","status":"Not Built","priority":"P2"},"Confirm audit response accepted without gaps":{"module":"Audit & Compliance","role":"Data Processor","feature":"Audit response acceptance confirmation","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Log the action taken internally":{"module":"Audit & Compliance","role":"Data Processor","feature":"Internal action logging","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Maintain audit trail specifically tied to consent updates/revocations shared with this processor":{"module":"Audit & Compliance","role":"Data Processor","feature":"Consent-linked audit trail for processor actions","capability":"Audit Logging Engine","status":"Not Built","priority":"P1"},"Receive short-notice audit request from Fiduciary":{"module":"Audit & Compliance","role":"Data Processor","feature":"Short-notice audit request intake","capability":"Audit Logging Engine","status":"Not Built","priority":"P3"},"Submit audit response package within contractual window":{"module":"Audit & Compliance","role":"Data Processor","feature":"Time-bound audit response submission","capability":"Audit Logging Engine","status":"Not Built","priority":"P3"},"Configure default surfaced metrics":{"module":"Analytics & Reporting","role":"Admin","feature":"Default-metric configuration for analytics dashboard","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Connect new data source to risk analytics dashboard":{"module":"Analytics & Reporting","role":"Admin","feature":"Analytics data source connector","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Compile posture trend data into the same report":{"module":"Analytics & Reporting","role":"DPO","feature":"Posture-trend inclusion in board reports","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Open the compliance posture dashboard for weekly review":{"module":"Analytics & Reporting","role":"DPO","feature":"Compliance posture dashboard","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P3"},"Present findings and posture trend at the board meeting":{"module":"Analytics & Reporting","role":"DPO","feature":"Board presentation export/mode","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Review current user-growth and processing-volume data":{"module":"Analytics & Reporting","role":"DPO","feature":"User-growth/volume monitoring dashboard","capability":"Bespoke / Scenario-Specific","status":"Partial","priority":"P1"},"Review risk analytics dashboard output":{"module":"Analytics & Reporting","role":"DPO","feature":"Risk analytics dashboard viewer","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P3"},"Review all open cases against statutory deadline":{"module":"Analytics & Reporting","role":"Grievance Officer","feature":"Statutory-deadline compliance dashboard","capability":"SLA / Deadline Engine","status":"Built","priority":"P1"},"Auto-send acknowledgment on receipt":{"module":"Notifications","role":"Admin","feature":"Auto-acknowledgment on DPRR receipt","capability":"Notification Engine","status":"Built","priority":"P1"},"Notify the customer of confirmation/tracking ID through their preferred assisted channel":{"module":"Notifications","role":"Admin","feature":"Multi-channel confirmation notification (SMS/call/branch)","capability":"Notification Engine","status":"Partial","priority":"P1"},"Receive real-time alert when new sensitive PII appears in a previously scanned source":{"module":"Notifications","role":"Admin","feature":"Real-time new-PII alert for previously scanned sources","capability":"Notification Engine","status":"Partial","priority":"P1"},"Trigger proactive user notification when a policy meaningfully changes":{"module":"Notifications","role":"Admin","feature":"Policy-change user notification trigger","capability":"Notification Engine","status":"Partial","priority":"P1"},"Adjust alert threshold configuration":{"module":"Notifications","role":"DPO","feature":"Alert-threshold configuration panel","capability":"Notification Engine","status":"Partial","priority":"P1"},"Check figures against SDF notification thresholds":{"module":"Notifications","role":"DPO","feature":"SDF threshold comparison tool","capability":"SLA / Deadline Engine","status":"Not Built","priority":"P3"},"Communicate the ruling and required action back to Admin":{"module":"Notifications","role":"DPO","feature":"DPO Ruling Notification Tool","capability":"Bespoke / Scenario-Specific","status":"Not Built","priority":"P2"},"Investigate root cause of false positives":{"module":"Notifications","role":"DPO","feature":"Root-cause investigation tool for alert noise","capability":"Notification Engine","status":"Not Built","priority":"P3"},"Notify relevant internal stakeholders of the classification change":{"module":"Notifications","role":"DPO","feature":"SDF classification-change stakeholder notification","capability":"Notification Engine","status":"Not Built","priority":"P3"},"Confirm request marked resolved":{"module":"Notifications","role":"Data Principal","feature":"Resolution confirmation notification","capability":"Notification Engine","status":"Not Built","priority":"P2"},"Receive communication of an extended deadline, where genuinely warranted":{"module":"Notifications","role":"Data Principal","feature":"Extended-deadline notification","capability":"Notification Engine","status":"Not Built","priority":"P3"},"Receive prompt for additional verification":{"module":"Notifications","role":"Data Principal","feature":"Additional-verification prompt notification","capability":"Notification Engine","status":"Partial","priority":"P1"},"Deliver detailed follow-up notification with findings":{"module":"Notifications","role":"Data Processor","feature":"Follow-up detailed notification tool","capability":"Notification Engine","status":"Not Built","priority":"P2"},"Upload explicit proof-of-completion artifacts alongside the acknowledgment":{"module":"Notifications","role":"Data Processor","feature":"Proof-of-completion artifact upload","capability":"Completion Verification Engine","status":"Built","priority":"P2"},"Send acknowledgment with tracking ID":{"module":"Notifications","role":"Grievance Officer","feature":"Auto-acknowledgment with tracking ID generator","capability":"Notification Engine","status":"Partial","priority":"P3"},"Support granular cookie-category consent":{"module":"Notifications","role":"Grievance Officer","feature":"P1","capability":"","status":"","priority":""},"Integrate with tag management platforms":{"module":"Notifications","role":"Grievance Officer","feature":"P2","capability":"","status":"","priority":""},"Integrate with analytics/marketing technologies":{"module":"Notifications","role":"Grievance Officer","feature":"P2","capability":"","status":"","priority":""},"Support multiple websites/domains":{"module":"Notifications","role":"Grievance Officer","feature":"","capability":"","status":"","priority":""},"Support sub-domain configuration":{"module":"Notifications","role":"Grievance Officer","feature":"P2","capability":"","status":"","priority":""},"Provide cookie scan history":{"module":"Notifications","role":"Grievance Officer","feature":"P1","capability":"","status":"","priority":""},"Provide cookie compliance dashboard":{"module":"Notifications","role":"Grievance Officer","feature":"P1 - Partial","capability":"","status":"","priority":""},"Export cookie inventory":{"module":"Notifications","role":"Grievance Officer","feature":"P2","capability":"","status":"","priority":""},"Provide API integration for cookie consent status":{"module":"Notifications","role":"Grievance Officer","feature":"","capability":"","status":"","priority":""},"Integrate cookie consent management with data principal consent management platform":{"module":"Notifications","role":"Grievance Officer","feature":"P1 - partial","capability":"","status":"","priority":""}};

export const DATA_ISSUES: string[] = [
 "Features rows under Notifications → Grievance Officer from “Support granular cookie-category consent” through “Integrate cookie consent management with data principal consent management platform” (10 rows) are Cookie Consent capability requirements filed under the wrong module/role.",
 "Features rows under Personal Data Breach Management → Legal / Procurement starting “Support automatic email notifications…” (7 rows) are platform requirements, not user tasks. They are attached to WF-BR-01 as Notes only.",
 "“Require remediation before approval” (CISO) sits under Data Flow & Protection Rules but belongs to the Integration approval journey (WF-IN-01).",
 "Status vocabulary is inconsistent (“Built ”, “PArtial”, “Partially Built”, “already discussed”, “not required”, “None”).",
 "Personal Data Breach Management has no DPO task, so the Board notification step after the CISO handoff has no owner. This ties to the open architecture question on where the 72-hour clock starts."
];

export const TOTAL_TASKS = 350;
