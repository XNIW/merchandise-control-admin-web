import { NextResponse } from "next/server";
import {
  publicWeChatConfiguration,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(publicWeChatConfiguration(resolveWeChatRuntimeConfig()), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
