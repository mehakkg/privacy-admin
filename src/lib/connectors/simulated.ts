import type { ExecutionStatus, VerificationMethod } from "@/lib/domain";

/**
 * SIMULATED SYSTEM CONNECTORS
 *
 * There are no live integrations in this build. This module stands in for them
 * and is the ONLY place that fakes anything — every other module treats its
 * result exactly as it would a real connector response.
 *
 * Behaviour is deterministic and driven by the system's own configuration, so
 * the demo shows real branching rather than random outcomes:
 *
 *   healthy  + API   -> acknowledged, verified
 *   degraded + API   -> partial: the call succeeded but not every shard replied
 *   down     + API   -> failed, with the diagnostic the operator needs
 *   delayed          -> accepted for a future backup-rotation window
 *   no API           -> cannot be dispatched at all; manual verification only
 *
 * Replacing this file with real HTTP clients is the integration work; nothing
 * upstream of it changes.
 */

export interface ConnectorResult {
  status: ExecutionStatus;
  verificationMethod: VerificationMethod | null;
  confirmedAt: Date | null;
  failureCode: string | null;
  failureDetail: string | null;
  failureRawResponse: string | null;
}

export interface ConnectorTarget {
  name: string;
  hasApi: boolean;
  connectionStatus: string;
  executionMode: string;
}

export class NoApiError extends Error {
  constructor(systemName: string) {
    super(
      `${systemName} exposes no API. Execution cannot be dispatched; it must be ` +
        `carried out by its owning team and recorded through manual verification.`,
    );
    this.name = "NoApiError";
  }
}

export function executeAgainst(
  target: ConnectorTarget,
  now: Date = new Date(),
): ConnectorResult {
  if (!target.hasApi) throw new NoApiError(target.name);

  if (target.executionMode === "delayed") {
    // Accepted, but the data does not actually leave the backup set until the
    // rotation window passes. Reporting this as done would be the exact lie the
    // three-state model exists to prevent.
    return {
      status: "pending",
      verificationMethod: null,
      confirmedAt: null,
      failureCode: null,
      failureDetail: null,
      failureRawResponse: null,
    };
  }

  switch (target.connectionStatus) {
    case "healthy":
      return {
        status: "verified",
        verificationMethod: "api_ack",
        confirmedAt: now,
        failureCode: null,
        failureDetail: null,
        failureRawResponse: null,
      };

    case "degraded":
      return {
        status: "partial",
        verificationMethod: "api_ack",
        confirmedAt: null,
        failureCode: null,
        failureDetail:
          "Erasure applied on the primary shard. Two read replicas did not " +
          "acknowledge within the timeout and will be re-checked.",
        failureRawResponse: null,
      };

    case "down":
    default:
      return {
        status: "failed",
        verificationMethod: null,
        confirmedAt: null,
        failureCode: "ERR_CONN_REFUSED",
        failureDetail:
          `Connection to ${target.name} was refused. The service account token ` +
          `expired on the integration host, so the erasure endpoint rejected the ` +
          `request before it reached the data layer.`,
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
      };
  }
}
