import js from "@eslint/js";

export default [
  js.configs.recommended,

  // Tampermonkey userscript (IIFE, browser globals, no modules)
  {
    files: ["script.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        Audio: "readonly",
        AudioContext: "readonly",
        webkitAudioContext: "readonly",
        MutationObserver: "readonly",
        performance: "readonly",
        Float32Array: "readonly",
        DataView: "readonly",
        ArrayBuffer: "readonly",
        Uint8Array: "readonly",
        btoa: "readonly",
        Math: "readonly",
        String: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // ES module source (fsm.js)
  {
    files: ["fsm.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        performance: "readonly",
        Float32Array: "readonly",
        DataView: "readonly",
        ArrayBuffer: "readonly",
        Uint8Array: "readonly",
        btoa: "readonly",
        Math: "readonly",
        String: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Test files (vitest + jsdom environment)
  {
    files: ["*.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        performance: "readonly",
        console: "readonly",
        document: "readonly",
        atob: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Config files (Node.js, ES modules)
  {
    files: ["*.config.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },

  { ignores: ["node_modules/"] },
];
