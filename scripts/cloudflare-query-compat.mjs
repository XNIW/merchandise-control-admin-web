import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// OpenNext AWS 4.1.0's edge converter supplies decoded query values, but this
// request-URL reconstruction uses a helper requiring pre-encoded values.
// Patch only req.url: invokeQuery and all routing/auth metadata stay decoded.
const handlerHash = "d9d67f62e82d9f51c9afc22cbe74750a5933e06dfb02a748c1d4db0522bf04a7";
const original = `        req.url =
            initialURL.pathname +
                convertToQueryString(routingResult.internalEvent.query);`;
const replacement = `        const requestQuery = new URLSearchParams();
        for (const [key, value] of Object.entries(routingResult.internalEvent.query)) {
            for (const entry of Array.isArray(value) ? value : [value]) {
                requestQuery.append(key, entry);
            }
        }
        req.url = initialURL.pathname + (requestQuery.size ? "?" + requestQuery.toString() : "");`;

export function patchOpenNextRequestUrlSource(source) {
  if (createHash("sha256").update(source).digest("hex") !== handlerHash
    || source.split(original).length !== 2) {
    throw new Error("OpenNext request handler source drift; review query compatibility before building.");
  }
  return source.replace(original, replacement);
}

// Synchronous, matching the build child. A durable exclusive backup prevents
// concurrent builds and makes an interrupted process visible on the next run.
export function withOpenNextRequestUrlPatch(root, runBuild) {
  const aws = join(root, "node_modules", "@opennextjs", "aws");
  const cloudflare = join(root, "node_modules", "@opennextjs", "cloudflare");
  if (JSON.parse(readFileSync(join(aws, "package.json"), "utf8")).version !== "4.1.0"
    || JSON.parse(readFileSync(join(cloudflare, "package.json"), "utf8")).version !== "1.20.2") {
    throw new Error("OpenNext version drift; review query compatibility before building.");
  }
  const path = join(aws, "dist", "core", "requestHandler.js");
  const backup = `${path}.merchandise-control-query-backup`;
  if (existsSync(backup)) {
    throw new Error("OpenNext query backup already exists; reconcile the interrupted build before retrying.");
  }
  const source = readFileSync(path, "utf8");
  const patched = patchOpenNextRequestUrlSource(source);
  writeFileSync(backup, source, { flag: "wx", mode: 0o600 });
  try {
    writeFileSync(path, patched);
    return runBuild();
  } finally {
    writeFileSync(path, source);
    unlinkSync(backup);
  }
}
