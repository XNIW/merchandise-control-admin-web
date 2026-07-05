import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const originalReadFileSync = fs.readFileSync;

fs.readFileSync = function readFileSyncWithNormalizedText(...args) {
  const result = originalReadFileSync.apply(this, args);

  return typeof result === "string" ? result.replace(/\r\n/g, "\n") : result;
};

syncBuiltinESMExports();
