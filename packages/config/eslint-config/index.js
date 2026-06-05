/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  extends: ["plugin:@typescript-eslint/recommended"],
  plugins: ["@typescript-eslint"],
  rules: {
    // No silent any types — forces explicit typing
    "@typescript-eslint/no-explicit-any": "error",
    // Unused vars must start with _ to acknowledge intentional non-use
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    // console.log is noise in production — use warn/error/info only
    "no-console": ["warn", { "allow": ["warn", "error", "info"] }],
    // Force `import type` for pure type imports — reduces bundle size
    "@typescript-eslint/consistent-type-imports": "error",
    // var is function-scoped and hoisted — source of subtle bugs
    "no-var": "error",
    // Prefer const over let when variable is never reassigned
    "prefer-const": "error"
  }
};
