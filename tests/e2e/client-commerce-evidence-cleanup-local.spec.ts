import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

const BUCKET = "customer-after-sales-evidence";

function localAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (
    process.env.TEST_TARGET !== "local" ||
    !/^http:\/\/(?:127\.0\.0\.1|localhost):54321$/.test(url) ||
    !serviceRoleKey
  ) {
    throw new Error("BLOCKED_COMMERCE_EVIDENCE_EXPLICIT_LOCAL_SUPABASE_REQUIRED");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test("after-sales cleanup removes claimed private evidence through Storage API", async () => {
  const admin = localAdmin();
  const objectPath = `${randomUUID()}/${randomUUID()}/${randomUUID()}.jpg`;
  const uploaded = await admin.storage
    .from(BUCKET)
    .upload(objectPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
      contentType: "image/jpeg",
      upsert: false,
    });
  expect(uploaded.error).toBeNull();

  try {
    const removed = await admin.storage.from(BUCKET).remove([objectPath]);
    expect(removed.error).toBeNull();
    const missing = await admin.storage.from(BUCKET).download(objectPath);
    expect(missing.error).not.toBeNull();
  } finally {
    await admin.storage.from(BUCKET).remove([objectPath]);
  }
});
