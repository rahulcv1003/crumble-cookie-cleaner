import type { KeyValueStorage } from "../../src/core/settings";

/** In-memory stand-in for chrome.storage.local (JSON round-trips values like Chrome does). */
export function fakeStorage(initial: Record<string, unknown> = {}): KeyValueStorage & { dump(): Record<string, unknown> } {
  let data: Record<string, unknown> = JSON.parse(JSON.stringify(initial));
  return {
    async get(keys) {
      const list = typeof keys === "string" ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
      return out;
    },
    async set(items) {
      data = { ...data, ...JSON.parse(JSON.stringify(items)) };
    },
    dump: () => JSON.parse(JSON.stringify(data)),
  };
}
