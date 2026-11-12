// ESLint settings (the "flat" format). This is a mistake finder, not a style checker.
// Names that do not exist are the TypeScript check's job (tools/tsc-gate.js), because these scripts share their names across files.
const mistakes = {
  "constructor-super": "error", "for-direction": "error", "getter-return": "error", "no-async-promise-executor": "error",
  "no-cond-assign": ["error", "except-parens"], "no-const-assign": "error", "no-dupe-args": "error", "no-dupe-class-members": "error",
  "no-dupe-else-if": "error", "no-dupe-keys": "error", "no-duplicate-case": "error", "no-empty-character-class": "error",
  "no-func-assign": "error", "no-invalid-regexp": "error", "no-irregular-whitespace": "error", "no-obj-calls": "error",
  "no-redeclare": "error", "no-self-assign": "error", "no-setter-return": "error", "no-sparse-arrays": "error",
  "no-unreachable": "error", "no-unsafe-finally": "error", "no-unsafe-negation": "error", "no-unsafe-optional-chaining": "error",
  "no-useless-backreference": "error", "use-isnan": "error", "valid-typeof": "error",
};
module.exports = [
  { ignores: ["node_modules/**", "android/**", "www/**", "tests/e2e/**"] },
  {
    // the app: plain scripts that share their names, so top-level names are not "unused" just because another file uses them
    files: ["js/**/*.js", "boot.js", "config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script" },
    rules: Object.assign({}, mistakes, { "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }] }),
  },
  {
    // tests and tools: Node files, each its own module
    files: ["tests/**/*.js", "tools/**/*.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs" },
    rules: Object.assign({}, mistakes, { "no-unused-vars": ["warn", { vars: "all", args: "none", caughtErrors: "none" }] }),
  },
];
