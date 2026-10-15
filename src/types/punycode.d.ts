// The npm "punycode" package (not Node's deprecated built-in), imported by file path so
// bundlers and Node ESM both resolve the userland copy.
declare module "punycode/punycode.es6.js" {
  export function toASCII(domain: string): string;
  export function toUnicode(domain: string): string;
}
