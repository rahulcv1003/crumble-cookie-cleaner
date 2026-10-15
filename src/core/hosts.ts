/**
 * Hostname normalisation without the public suffix list, so UI pages can use it
 * without bundling tldts. Pure functions; no browser APIs.
 */
import { toASCII, toUnicode } from "punycode/punycode.es6.js";

/**
 * Normalises a hostname or cookie domain for comparison:
 * trims, lowercases, removes a leading "." (cookie domains), a trailing "."
 * (fully qualified names) and IPv6 brackets, and converts internationalised
 * labels to their ASCII (punycode) form, which is what Chrome reports for
 * tab URLs and cookie domains.
 */
export function normalizeHost(input: string): string {
  let host = input.trim().toLowerCase();
  if (host.startsWith(".")) host = host.slice(1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if ([...host].some((ch) => ch.charCodeAt(0) > 0x7f)) {
    try {
      host = toASCII(host);
    } catch {
      // Leave as typed if it cannot be converted; it will simply not match ASCII forms.
    }
  }
  return host;
}

/** The Unicode form of an ASCII (punycode) hostname, or the input if it has no punycode labels. */
export function toUnicodeHost(asciiHost: string): string {
  if (!asciiHost.includes("xn--")) return asciiHost;
  try {
    return toUnicode(asciiHost);
  } catch {
    return asciiHost;
  }
}
