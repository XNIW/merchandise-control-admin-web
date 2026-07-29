import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_RPC_JSON_RESPONSE_BYTES = 64 * 1024;
const RPC_NAME_PATTERN = /^[a-z][a-z0-9_]{0,95}$/;
const LOCAL_RPC_HOSTNAMES = new Set(["127.0.0.1", "[::1]", "localhost"]);

function isAllowedRpcBaseUrl(url: URL) {
  if (url.username || url.password) {
    return false;
  }

  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOCAL_RPC_HOSTNAMES.has(url.hostname))
  );
}

async function readBoundedJson(response: Response) {
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      totalBytes += value.byteLength;

      if (totalBytes > MAX_RPC_JSON_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

export function createPosRuntimeRpcClient(): SupabaseAdminClient | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!baseUrl || !serviceRoleKey) {
    return null;
  }

  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return null;
  }

  if (!isAllowedRpcBaseUrl(parsedBaseUrl)) {
    return null;
  }

  const restUrl = new URL("/rest/v1/rpc/", parsedBaseUrl);
  const rpc = async (functionName: string, args: Record<string, unknown>) => {
    if (!RPC_NAME_PATTERN.test(functionName)) {
      return {
        data: null,
        error: { code: "invalid_rpc_name" },
      };
    }

    try {
      const response = await fetch(new URL(functionName, restUrl), {
        body: JSON.stringify(args),
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          "x-client-info": "merchandise-control-admin-web/pos-runtime-rpc",
        },
        method: "POST",
        redirect: "error",
      });
      const data = await readBoundedJson(response);

      if (!response.ok || data === null) {
        return {
          data: null,
          error: { code: `http_${response.status}` },
        };
      }

      return { data, error: null };
    } catch {
      return {
        data: null,
        error: { code: "network_failure" },
      };
    }
  };

  return { rpc } as unknown as SupabaseAdminClient;
}
