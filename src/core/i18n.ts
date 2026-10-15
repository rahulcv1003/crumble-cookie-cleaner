/**
 * All user-facing text comes from _locales (PRD "Later": localised UI needs this already).
 * t() looks a message up; plural() picks "<base>One" for 1 and "<base>Other" otherwise.
 */
export function t(key: string, substitutions?: string | (string | number)[]): string {
  const subs = substitutions === undefined ? undefined : (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
  const text = chrome.i18n.getMessage(key, subs);
  return text || key;
}

export function plural(base: string, count: number, extra: (string | number)[] = []): string {
  return t(`${base}${count === 1 ? "One" : "Other"}`, [formatNumber(count), ...extra]);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(chrome.i18n.getUILanguage()).format(n);
}

/** "2 minutes ago", "just now" style relative time, in the browser's language. */
export function relativeTime(then: number, now = Date.now()): string {
  const secs = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(chrome.i18n.getUILanguage(), { numeric: "auto" });
  const abs = Math.abs(secs);
  if (abs < 45) return t("timeJustNow");
  if (abs < 3600) return rtf.format(Math.round(secs / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), "hour");
  return rtf.format(Math.round(secs / 86400), "day");
}
