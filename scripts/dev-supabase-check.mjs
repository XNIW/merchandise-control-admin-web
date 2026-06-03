#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const statusMode = args.has("--status");
const requiredEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
];
let failures = 0;

function log(message) {
  console.log(`[dev-db] ${message}`);
}

function fail(message) {
  failures += 1;
  log(`FAIL ${message}`);
}

function pass(message) {
  log(`PASS ${message}`);
}

function run(command, commandArgs, options = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, commandArgs, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
      }),
    };
  } catch (error) {
    const output = [
      error.stdout?.toString() ?? "",
      error.stderr?.toString() ?? "",
    ].join("");

    return { ok: false, output };
  }
}

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function parseProjectId() {
  const configPath = "supabase/config.toml";

  if (!existsSync(join(root, configPath))) {
    fail(`${configPath} missing`);
    return null;
  }

  const match = readProjectFile(configPath).match(/^project_id\s*=\s*"([^"]+)"/m);
  const projectId = match?.[1] ?? null;

  if (!projectId) {
    fail("supabase/config.toml project_id not found");
    return null;
  }

  pass(`supabase project_id=${projectId}`);
  return projectId;
}

function parseEnvFile(relativePath) {
  if (!existsSync(join(root, relativePath))) {
    return null;
  }

  const values = new Map();

  for (const rawLine of readProjectFile(relativePath).split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();

    if (requiredEnvNames.includes(key)) {
      values.set(key, value.length > 0 ? "present" : "empty");
    }
  }

  return values;
}

function classifySupabaseUrl(relativePath) {
  if (!existsSync(join(root, relativePath))) {
    return "missing_file";
  }

  const match = readProjectFile(relativePath).match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m);
  const rawValue = match?.[1]?.trim();

  if (!rawValue) {
    return "missing";
  }

  const unquoted = rawValue.replace(/^["']|["']$/g, "");

  try {
    const url = new URL(unquoted);

    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return "local";
    }

    if (url.hostname.endsWith(".supabase.co")) {
      return "supabase_cloud";
    }

    return "custom_remote";
  } catch {
    return "invalid";
  }
}

function checkEnvFiles() {
  for (const relativePath of [".env.example", ".env.local", ".env.development.local"]) {
    const env = parseEnvFile(relativePath);

    if (!env) {
      log(`${relativePath}=missing_file`);
      continue;
    }

    for (const name of requiredEnvNames) {
      log(`${relativePath}:${name}=${env.get(name) ?? "missing"}`);
    }

    const target = classifySupabaseUrl(relativePath);
    log(`${relativePath}:NEXT_PUBLIC_SUPABASE_URL_TARGET=${target}`);

    if (relativePath !== ".env.example" && ["supabase_cloud", "custom_remote"].includes(target)) {
      fail(`${relativePath} points at ${target}; local/dev checks fail closed`);
    }
  }
}

function checkSupabaseCli() {
  const version = run("supabase", ["--version"]);

  if (version.ok) {
    pass(`supabase CLI ${version.output.trim()}`);
  } else {
    fail("supabase CLI version unavailable");
  }
}

function checkDockerContainers(projectId) {
  const docker = run("docker", ["ps", "--format", "{{.Names}}"]);

  if (!docker.ok) {
    fail("docker ps unavailable");
    return;
  }

  const names = docker.output.split(/\r?\n/).filter(Boolean);
  const expectedDb = `supabase_db_${projectId}`;
  const supabaseDbNames = names.filter((name) => name.startsWith("supabase_db_"));

  if (names.includes(expectedDb)) {
    pass(`local Supabase DB container matches ${expectedDb}`);
    return;
  }

  if (supabaseDbNames.length > 0) {
    fail(
      `local Supabase DB container mismatch; expected ${expectedDb}, found ${supabaseDbNames.join(", ")}`,
    );
    return;
  }

  fail(`local Supabase DB container ${expectedDb} not running`);
}

function redactSupabaseStatus(output) {
  return output
    .split(/\r?\n/)
    .map((line) =>
      /(?:anon key|service[_ -]?role key|jwt secret|db url|api url|graphql url|s3 access key|s3 secret key)/i.test(
        line,
      )
        ? line.replace(/:.*/, ": [redacted]")
        : line,
    )
    .join("\n");
}

function printRedactedStatus() {
  const status = run("supabase", ["status"]);
  const redacted = redactSupabaseStatus(status.output.trim());

  if (redacted) {
    console.log(redacted);
  }

  if (status.ok) {
    pass("supabase status completed with redacted output");
  } else {
    fail("supabase status did not complete");
  }
}

checkSupabaseCli();
const projectId = parseProjectId();
checkEnvFiles();

if (projectId) {
  checkDockerContainers(projectId);
}

if (statusMode) {
  printRedactedStatus();
}

if (failures > 0) {
  process.exitCode = 2;
}
