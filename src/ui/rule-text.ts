/** Shared wording for rules, errors and import results (used by settings and welcome pages). */
import { t } from "../core/i18n";
import type { RuleError, Rule } from "../core/rules";
import type { SkipReason } from "../core/import-export";
import { SITE_DATA_TYPES, type SiteDataType } from "../core/site-data";

export function ruleErrorText(err: RuleError): string {
  return t(err.code, err.substitutions);
}

export function skipReasonText(reason: SkipReason, expression: string): string {
  if (reason.code === "importSkipNotText") return t("importSkipNotText");
  if (reason.code === "importSkipUnknownList") return t("importSkipUnknownList", [reason.detail]);
  if (reason.code === "importSkipIpRange") return t("importSkipIpRange", [expression]);
  return t(reason.code, [expression, (reason as { detail?: string }).detail ?? ""]);
}

export const typeLabel = (type: SiteDataType | "httpCache"): string => t(`type_${type}`);
export const listLabel = (list: Rule["list"]): string => (list === "keep" ? t("listKeep") : t("listRestart"));

export function cookiesSummary(rule: Rule): string {
  return rule.cookies.mode === "all" ? t("cookiesAll") : t("cookiesOnly", [rule.cookies.names.join(", ")]);
}

export function siteDataSummary(rule: Rule): string {
  const cleaned = SITE_DATA_TYPES.filter((type) => rule.siteData[type] === "clean");
  return cleaned.length === 0 ? t("siteDataKeepsAll") : t("siteDataCleans", [cleaned.map(typeLabel).join(", ")]);
}
