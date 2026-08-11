import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const BUCKET = "storefront-product-images";
const PATH =
  /^shops\/[0-9a-f-]{36}\/products\/[0-9a-f-]{36}\/public\/[0-9a-f-]{36}\/(thumb|card|detail)-[0-9a-f]{16}\.webp$/;

function required(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

export function validateStagingTarget(env = process.env) {
  if (env.STOREFRONT_IMAGE_CLEANUP_ALLOW_STAGING !== "yes") {
    throw new Error("staging_cleanup_not_authorized");
  }
  const projectRef = required("STAGING_SUPABASE_PROJECT_REF", env);
  const allowed = required("ALLOWED_STAGING_SUPABASE_PROJECT_REFS", env)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL", env));
  if (
    !/^[a-z0-9]{20}$/.test(projectRef) ||
    !allowed.includes(projectRef) ||
    url.protocol !== "https:" ||
    url.hostname !== `${projectRef}.supabase.co`
  ) {
    throw new Error("staging_cleanup_target_rejected");
  }
  return { projectRef, url: url.origin };
}

export function isCanonicalStorefrontImagePath(value) {
  return typeof value === "string" && PATH.test(value) && !value.includes("..");
}

export async function runStorefrontImageCleanup({
  client,
  limit = 50,
  maxBatches = 10,
}) {
  let claimed = 0;
  let removed = 0;
  let failed = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const claim = await client.rpc("storefront_image_cleanup_claim_v2", {
      p_limit: limit,
    });
    if (
      claim.error ||
      claim.data?.ok !== true ||
      !Array.isArray(claim.data.items)
    ) {
      throw new Error("cleanup_claim_failed");
    }
    if (claim.data.items.length === 0) break;
    claimed += claim.data.items.length;
    for (const item of claim.data.items) {
      const id = typeof item?.id === "string" ? item.id : "";
      const claimToken =
        typeof item?.cleanup_claim_token === "string"
          ? item.cleanup_claim_token
          : "";
      const path =
        typeof item?.object_path === "string" ? item.object_path : "";
      let success = false;
      let errorCode = "invalid_object_path";
      if (
        /^[0-9a-f-]{36}$/.test(id) &&
        /^[0-9a-f-]{36}$/.test(claimToken) &&
        isCanonicalStorefrontImagePath(path)
      ) {
        const deletion = await client.storage.from(BUCKET).remove([path]);
        success = !deletion.error;
        errorCode = success ? "" : "storage_remove_failed";
      }
      const completion = await client.rpc(
        "storefront_image_cleanup_complete_v2",
        {
          p_claim_token: claimToken,
          p_error_code: success ? null : errorCode,
          p_removed: success,
          p_variant_id: id,
        },
      );
      if (completion.error || completion.data?.ok !== true) {
        throw new Error("cleanup_completion_failed");
      }
      if (success) removed += 1;
      else failed += 1;
    }
  }
  return { claimed, failed, removed };
}

async function main() {
  const target = validateStagingTarget();
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(target.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "storefront-v1-image-cleanup" } },
  });
  const result = await runStorefrontImageCleanup({ client });
  console.log(JSON.stringify({ ok: true, target: "staging", ...result }));
}

const direct =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "cleanup_failed");
    process.exitCode = 1;
  });
