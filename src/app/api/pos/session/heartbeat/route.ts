import { handlePosHeartbeat } from "@/server/pos-auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const result = await handlePosHeartbeat(await readJsonBody(request), {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return Response.json(result.body, {
    headers: {
      "Cache-Control": "no-store",
    },
    status: result.status,
  });
}
