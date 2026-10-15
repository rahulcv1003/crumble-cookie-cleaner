/**
 * Hostname normalisation and registrable-domain lookup.
 *
 * Uses the bundled tldts public suffix list with private suffixes on
 * (allowPrivateDomains: true), so a.github.io and b.github.io are separate
 * sites, the way Chrome treats them for cookies. See docs/SPIKES.md (Spike 3)
 * and docs/DECISIONS.md.
 *
 * Pure functions only: no browser API calls, no module-level state.
 */
import { parse } from "tldts";
import { normalizeHost } from "./hosts";

export { normalizeHost, toUnicodeHost } from "./hosts";

const TLDTS_OPTIONS = {
  allowPrivateDomains: true,
  extractHostname: false, // callers pass hostnames, not URLs
  detectIp: true,
  validateHostname: false,
  mixedInputs: false,
} as const;

export function isIpAddress(host: string): boolean {
  return parse(normalizeHost(host), TLDTS_OPTIONS).isIp === true;
}

/**
 * The registrable domain ("site") of a hostname, in ASCII form.
 *
 *   news.bbc.co.uk   -> bbc.co.uk
 *   a.github.io      -> a.github.io   (private suffix github.io)
 *   bücher.de        -> xn--bcher-kva.de
 *   localhost        -> localhost     (no public suffix: the host itself)
 *   127.0.0.1, ::1   -> the IP itself
 *
 * When the host is itself a public suffix or has no registrable part,
 * the normalised host is returned, so every host maps to exactly one site.
 */
export function getRegistrableDomain(host: string): string {
  const normalized = normalizeHost(host);
  if (normalized === "") return "";
  const result = parse(normalized, TLDTS_OPTIONS);
  if (result.isIp) return normalized;
  return result.domain ?? normalized;
}
