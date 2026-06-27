/**
 * CJS require() hook — patches Module._resolveFilename to redirect
 * expo-* native modules to lightweight Node.js-compatible stubs.
 *
 * Must be loaded BEFORE tsx via --require so the patch is in place
 * when tsx's own Module._resolveFilename wrapper calls through.
 *
 * Loaded via: node --require ./tests/cjs-stubs.cjs --import tsx ...
 */
"use strict";

const Module = require("module");
const path = require("path");

const STUBS_DIR = path.join(__dirname, "__stubs__");

const STUBS = {
  "expo-crypto": path.join(STUBS_DIR, "expo-crypto.cjs"),
  "expo-modules-core": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-sqlite": path.join(STUBS_DIR, "expo-sqlite.cjs"),
  "expo-network": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-localization": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-linking": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-location": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-file-system": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-splash-screen": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-task-manager": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-background-task": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-clipboard": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-sharing": path.join(STUBS_DIR, "__empty__.cjs"),
  "expo-print": path.join(STUBS_DIR, "__empty__.cjs"),
  "react-native": path.join(STUBS_DIR, "__empty__.cjs"),
};

const _resolveFilename = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (request, parent, isMain, options) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) {
    return STUBS[request];
  }
  return _resolveFilename(request, parent, isMain, options);
};
