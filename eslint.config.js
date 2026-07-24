// Flat ESLint config (ESLint 9) for the Vault frontend + Node code.
// Type-aware linting is intentionally NOT enabled to keep CI fast and
// deterministic; `tsc` provides full type checking as a separate gate.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Generated code, build output, vendored proofs and contract artifacts
    // are not linted.
    ignores: [
      "dist/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
      "src/generated/**",
      "public/**",
      "contracts/**/target/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Pragmatic rules for an existing codebase: keep correctness signal,
      // avoid failing CI on stylistic-only findings.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  // Node-only entrypoints (server + scripts) get Node globals. Standalone
  // CommonJS spike scripts intentionally use require()/__dirname, so the
  // ESM-only import rule is relaxed here without touching their behavior.
  {
    files: ["server/**/*.ts", "scripts/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Disable formatting-related rules; Prettier owns formatting.
  prettier,
);
