#!/usr/bin/env node

import { existsSync, renameSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const proxyPath = join(root, "src", "proxy.ts");
const disabledProxyPath = join(root, "src", "proxy.ts.cloudflare-build-disabled");

function assertProxyIsSafeToOmitForCloudflare() {
  if (!existsSync(proxyPath)) {
    return false;
  }

  const source = readFileSync(proxyPath, "utf8");

  if (!/NextResponse\.next\(\)/.test(source)) {
    throw new Error(
      "src/proxy.ts is not a pass-through proxy; refusing to omit it for Cloudflare build.",
    );
  }

  if (/@supabase\/ssr|updateSupabaseSession|SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(source)) {
    throw new Error(
      "src/proxy.ts contains auth or secret-sensitive code; refusing to omit it for Cloudflare build.",
    );
  }

  return true;
}

function runOpenNextBuild() {
  const command =
    process.platform === "win32" ? "opennextjs-cloudflare.cmd" : "opennextjs-cloudflare";
  const args = ["build"];

  return spawnSync(
    process.platform === "win32" ? `${command} ${args.join(" ")}` : command,
    process.platform === "win32" ? [] : args,
    {
      cwd: root,
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    },
  );
}

const shouldRestoreProxy = assertProxyIsSafeToOmitForCloudflare();

if (shouldRestoreProxy) {
  if (existsSync(disabledProxyPath)) {
    throw new Error(
      `${disabledProxyPath} already exists; restore or remove that temporary file before building.`,
    );
  }

  renameSync(proxyPath, disabledProxyPath);
}

try {
  const result = runOpenNextBuild();

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  if (shouldRestoreProxy && existsSync(disabledProxyPath)) {
    renameSync(disabledProxyPath, proxyPath);
  }
}
