#!/usr/bin/env node
import { assertStagingTargetEnv } from "../testing/target-guardrails.mjs";

const env = {
  ...process.env,
  TEST_TARGET: "staging",
};

try {
  assertStagingTargetEnv(env, { requireConfirmation: false });
  console.log("[db-staging] PASS TEST_TARGET=staging");
  console.log("[db-staging] PASS Supabase URL is https://*.supabase.co");
  console.log("[db-staging] PASS project ref is allowlisted and not production");
} catch (error) {
  console.error(`[db-staging] FAIL ${error.message}`);
  process.exitCode = 2;
}
