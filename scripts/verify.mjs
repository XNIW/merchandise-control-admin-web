#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const binSuffix = process.platform === "win32" ? ".cmd" : "";

function run(command, args) {
  let executable = command;
  let executableArgs = args;

  if (process.platform === "win32" && command.toLowerCase().endsWith(".cmd")) {
    executable = process.env.ComSpec || "cmd.exe";
    executableArgs = ["/d", "/c", command, ...args];
  }

  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runBin(name, args) {
  const localBin = join(root, "node_modules", ".bin", `${name}${binSuffix}`);
  run(existsSync(localBin) ? localBin : name, args);
}

runBin("eslint", []);
runBin("next", ["typegen"]);
rmSync(join(root, ".next", "types"), { recursive: true, force: true });
runBin("tsc", ["--noEmit"]);
run(process.execPath, ["scripts/security-checks.mjs"]);
runBin("next", ["build"]);
