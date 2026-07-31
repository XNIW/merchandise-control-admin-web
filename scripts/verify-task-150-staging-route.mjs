import { pathToFileURL } from "node:url";

const allowedOrigin =
  "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev";

export async function verifyTask150StagingRoute({
  baseUrl,
  fetchImpl = fetch,
  maximumAttempts = 18,
  delayMilliseconds = 5_000,
  requestTimeoutMilliseconds = 10_000,
  delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  log = (status) => console.log(JSON.stringify(status)),
}) {
  const base = new URL(baseUrl || "");
  if (base.origin !== allowedOrigin || base.pathname !== "/") {
    throw new Error("task150_staging_origin_invalid");
  }
  const route = new URL("/api/qa/win7pos-product-image", base);
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let status = {
      attempt,
      httpStatus: null,
      contentType: null,
      code: null,
      noStore: false,
      fetchError: null,
    };
    try {
      const response = await fetchImpl(route, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "configuration_probe" }),
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
      const contentType = response.headers.get("content-type") || "";
      let body = null;
      if (contentType.toLowerCase().startsWith("application/json")) {
        body = await response.json();
      } else {
        await response.body?.cancel();
      }
      status = {
        ...status,
        httpStatus: response.status,
        contentType,
        code: body?.code || null,
        noStore:
          response.headers.get("cache-control") === "no-store, max-age=0",
      };
    } catch (error) {
      status.fetchError = error?.name || "Error";
    }
    log(status);
    if (
      status.httpStatus === 400 &&
      status.code === "validation_failed" &&
      status.noStore
    ) {
      return status;
    }
    if (attempt < maximumAttempts) await delay(delayMilliseconds);
  }
  throw new Error("task150_staging_route_unavailable");
}

async function runCli() {
  await verifyTask150StagingRoute({
    baseUrl: process.env.CLOUDFLARE_STAGING_URL,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error?.name || "Error");
    process.exitCode = 1;
  });
}
