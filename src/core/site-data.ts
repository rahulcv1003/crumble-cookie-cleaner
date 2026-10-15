/** Site data types cleaned per origin (separate from decide.ts so UI pages don't bundle the public suffix list). */
export type SiteDataType = "localStorage" | "indexedDB" | "cacheStorage" | "serviceWorkers";
export const SITE_DATA_TYPES: readonly SiteDataType[] = ["localStorage", "indexedDB", "cacheStorage", "serviceWorkers"];
