import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveSupabaseServerConfig } from "@/lib/supabase/server";

export function createPlatformProvisioningRpcClient(actorAccessToken: string) {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured" || !actorAccessToken.trim()) {
    return null;
  }

  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${actorAccessToken}`,
        "X-Client-Info":
          "merchandise-control-admin-web/platform-provisioning-rpc",
      },
    },
  });
}
