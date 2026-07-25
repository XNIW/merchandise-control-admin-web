import { buildCatalogWorkbookExport } from "@/server/shop-admin/import-export-workbook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The envelope stops at 45s, leaving 15s for cancellation, audit and response
// cleanup inside the deployment-visible route duration.
export const maxDuration = 60;
const MIN_REQUESTED_DEADLINE_MS = 100;
const MAX_REQUESTED_DEADLINE_MS = 45_000;

function requestedDeadlineMs(request: Request) {
  const value = request.headers.get("x-mc-workbook-deadline-ms");

  if (!value || !/^[1-9][0-9]{1,4}$/.test(value)) {
    return undefined;
  }
  const deadlineMs = Number(value);

  return deadlineMs >= MIN_REQUESTED_DEADLINE_MS &&
    deadlineMs <= MAX_REQUESTED_DEADLINE_MS
    ? deadlineMs
    : undefined;
}

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
    status,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await buildCatalogWorkbookExport(
    url.searchParams.get("shop_id") ?? undefined,
    {
      deadlineMs: requestedDeadlineMs(request),
      signal: request.signal,
    },
  );

  if (!result.ok || !result.buffer) {
    const status =
      result.code === "resource_limit_exceeded"
        ? 413
        : result.code === "resource_deadline_exceeded" ||
            result.code === "request_cancelled"
          ? 408
          : 400;
    return noStoreJson(result, status);
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Type": result.contentType ?? "application/octet-stream",
    },
  });
}
