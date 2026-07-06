#!/usr/bin/env node

import { spawn } from "node:child_process";

function usage() {
  console.error(
    "Usage: node scripts/run-with-env.mjs NAME=value [NAME=value ...] -- command [args ...]",
  );
}

const separatorIndex = process.argv.indexOf("--");
if (separatorIndex < 3 || separatorIndex === process.argv.length - 1) {
  usage();
  process.exit(2);
}

const assignments = process.argv.slice(2, separatorIndex);
const command = process.argv[separatorIndex + 1];
const args = process.argv.slice(separatorIndex + 2);
const env = { ...process.env };

for (const assignment of assignments) {
  const equalsIndex = assignment.indexOf("=");
  if (equalsIndex <= 0) {
    console.error(`Invalid environment assignment: ${assignment}`);
    usage();
    process.exit(2);
  }

  const name = assignment.slice(0, equalsIndex);
  const value = assignment.slice(equalsIndex + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    console.error(`Invalid environment variable name: ${name}`);
    usage();
    process.exit(2);
  }

  env[name] = value;
}

const child = spawn(command, args, {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Command terminated by signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
