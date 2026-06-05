#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/dev-supabase-check.mjs", "--mode=local", "--status"],
  {
    env: {
      ...process.env,
      TEST_TARGET: "local",
    },
    stdio: "inherit",
  },
);

process.exitCode = result.status ?? 1;
