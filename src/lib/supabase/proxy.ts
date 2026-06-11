import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

type SupabaseProxyConfig =
  | {
      status: "configured";
      url: string;
      publishableKey: string;
    }
  | {
      status: "not_configured";
    };

function resolveSupabaseProxyConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseProxyConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return { status: "not_configured" };
  }

  return {
    status: "configured",
    url,
    publishableKey,
  };
}

export async function updateSupabaseSession(request: NextRequest) {
  const config = resolveSupabaseProxyConfig();
  const nextResponse = () =>
    NextResponse.next({
      request: {
        headers: new Headers(request.headers),
      },
    });
  let response = nextResponse();

  if (config.status !== "configured") {
    return response;
  }

  const supabase = createServerClient<Database>(
    config.url,
    config.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = nextResponse();

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
      global: {
        headers: {
          "X-Client-Info": "merchandise-control-admin-web/proxy-ssr",
        },
      },
    },
  );

  await supabase.auth.getClaims();

  return response;
}
