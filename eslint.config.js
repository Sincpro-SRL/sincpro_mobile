const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const simpleImportSort = require("eslint-plugin-simple-import-sort");
const reactPlugin = require("eslint-plugin-react");

module.exports = defineConfig([
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      react: reactPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "react/jsx-sort-props": ["warn", { ignoreCase: true }],
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);
