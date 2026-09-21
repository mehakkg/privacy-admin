/**
 * DPRR shared constants — pure, no server-only imports, so both the engine and
 * client components can use them without pulling node:crypto into the browser
 * bundle. (The engine in lib/engines/dprr.ts holds the logic.)
 */

export const SUBTASK_TEAMS = ["fulfilment", "legal", "it"] as const;
export type SubtaskTeam = (typeof SUBTASK_TEAMS)[number];

export const SUBTASK_STATUSES = ["open", "in_progress", "done"] as const;

export const SUBTASK_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};
