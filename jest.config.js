const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest/presets/js-with-ts-esm",
  testEnvironment: "node", // ✅ Node environment
  transform: {
    ...tsJestTransformCfg // ✅ ts-jest handles TypeScript
  },
  extensionsToTreatAsEsm: [".ts"], // ✅ treat TS files as ESM
  moduleFileExtensions: ["ts", "js", "json", "node"], // ✅ common extensions
  transformIgnorePatterns: ["/node_modules/(?!nanoid)"]
};
