import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "dist-test/**", "node_modules/**", "tests/harness/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker, ...globals.node, chrome: "readonly" } },
    rules: {
      // PRD "Privacy and security": no eval, no new Function, no network calls, no innerHTML.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-globals": ["error",
        { name: "fetch", message: "The extension makes no network requests (PRD: Privacy and security)." },
        { name: "XMLHttpRequest", message: "The extension makes no network requests (PRD: Privacy and security)." },
        { name: "WebSocket", message: "The extension makes no network requests (PRD: Privacy and security)." },
        { name: "EventSource", message: "The extension makes no network requests (PRD: Privacy and security)." },
      ],
      "no-restricted-properties": ["error",
        { property: "innerHTML", message: "Build DOM with textContent / createElement (PRD: no innerHTML)." },
        { property: "outerHTML", message: "Build DOM with textContent / createElement (PRD: no innerHTML)." },
        { property: "insertAdjacentHTML", message: "Build DOM with textContent / createElement (PRD: no innerHTML)." },
        { object: "document", property: "write", message: "Not allowed (PRD: Privacy and security)." },
        { property: "sync", message: "chrome.storage.sync is not used in version 1 (PRD: Storage locations)." },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    // Playwright E2E specs and the local test server run in Node and drive the browser; network rules do not apply to them.
    files: ["tests/e2e/**", "scripts/**", "*.config.*"],
    rules: {
      "no-restricted-globals": "off",
      // page.evaluate glue reads untyped globals the test pages define (readBack, crumbleTest).
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
