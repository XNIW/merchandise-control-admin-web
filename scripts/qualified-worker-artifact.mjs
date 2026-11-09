import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TARGET = "merchandise-control-admin-web-staging";
export function qualifiedPublicBuildTarget(url, publishableKey) {
  if (url !== "https://jpgoimipbothfgkokyvm.supabase.co" ||
      typeof publishableKey !== "string" ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error("Reviewed staging public build configuration is missing or changed.");
  }
  return { projectRef: "jpgoimipbothfgkokyvm", publishableKeyIncluded: true };
}
export function qualifiedWorkerConfig(source) {
  const staging = source.env?.staging;
  if (staging?.name !== TARGET || staging.services?.length !== 1 ||
      staging.services[0].binding !== "WORKER_SELF_REFERENCE" ||
      staging.services[0].service !== TARGET || source.main !== ".open-next/worker.js" ||
      source.assets?.binding !== "ASSETS" || source.assets.directory !== ".open-next/assets") {
    throw new Error("Qualified Worker staging target/configuration changed.");
  }
  // A portable, staging-only view of the same effective configuration.
  const config = { ...source, ...staging, main: "bundle/worker.js",
    assets: { ...source.assets, directory: "assets" }, find_additional_modules: true };
  delete config.$schema;
  delete config.env;
  return config;
}

function files(root, current = root) {
  const found = [];
  for (const item of readdirSync(current, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error("Artifact contains a symbolic link.");
    const name = join(current, item.name);
    if (item.isDirectory()) found.push(...files(root, name));
    else if (item.isFile()) found.push(name);
    else throw new Error("Artifact contains an unsupported file.");
  }
  return found;
}
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function buildQualifiedWorkerArtifact(root) {
  const publicBuild = qualifiedPublicBuildTarget(process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const output = join(root, "qualified-worker");
  if (existsSync(output)) throw new Error("Artifact output already exists; use a fresh build workspace.");
  const config = qualifiedWorkerConfig(JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8")));
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  if (dirty.trim()) throw new Error("Tracked source changed before artifact creation.");
  mkdirSync(output);
  const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
  const result = spawnSync(process.execPath, [wrangler, "deploy", "--dry-run", "--env", "staging",
    "--minify", "--outdir", join(output, "bundle")], { cwd: root, stdio: "inherit", timeout: 120000 });
  if (result.status !== 0) throw new Error("Qualified Worker dry-run failed.");
  if (!existsSync(join(output, "bundle/worker.js"))) throw new Error("Worker entrypoint missing.");
  const assets = join(root, ".open-next/assets");
  files(assets); // Reject links before copying only the public asset directory.
  cpSync(assets, join(output, "assets"), { recursive: true, errorOnExist: true, force: false });
  writeFileSync(join(output, "wrangler.json"), JSON.stringify(config, null, 2), { flag: "wx" });
  const entries = files(output).map((name) => ({ path: relative(output, name).replaceAll("\\", "/"),
    sha256: sha(readFileSync(name)) })).sort((a, b) => a.path.localeCompare(b.path));
  const packages = ["wrangler", "@opennextjs/cloudflare", "@opennextjs/aws", "next"];
  const versions = Object.fromEntries(packages.map((name) => [name,
    JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version]));
  const manifest = { schema: "qualified-staging-worker-v1", sourceSha, sourceTree, target: TARGET,
    node: process.version, packages: versions, lockSha256: sha(readFileSync(join(root, "package-lock.json"))),
    sourceConfigSha256: sha(readFileSync(join(root, "wrangler.jsonc"))), files: entries,
    publicBuild, remoteMutation: false, secretsIncluded: false };
  writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ status: "PASS_QUALIFIED_ARTIFACT", sourceSha, sourceTree,
    files: entries.length, target: TARGET, remoteMutation: false }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildQualifiedWorkerArtifact(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
}
