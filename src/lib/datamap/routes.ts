/**
 * The four Data map page routes, in ONE place. Components and the nav link through
 * these constants, so moving to the /data-map/* roots (with redirects from the old
 * paths) is a single-file change here plus the redirect stubs — not a hunt across
 * call sites. Spec target roots noted beside each.
 */
export const DATAMAP_ROUTES = {
  inventory: "/data-map/inventory",
  activities: "/data-map/processing-activities", // → /data-map/activities
  flow: "/data-flow/map",                        // → /data-map/flow
  ropa: "/discovery/ropa",                       // → /data-map/ropa
} as const;

export type DataMapStage = "fields" | "activities" | "ropa";
