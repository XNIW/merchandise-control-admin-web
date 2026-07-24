import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const recovered = new Map([
  [
    "20260707183000_mac_admin_w7pos_009_pos_admin_staff_role.sql",
    "4bd1403d568ed78d5aab239689f30eaf474aeaf35e1a88f92a0f710a28810376",
  ],
  [
    "20260707200500_mac_admin_w7pos_009_pos_admin_permission_completion.sql",
    "d9b19bd0a0eb9a4761d5591ef339e852fa528574454f3cc47bb74492a5f6b6f8",
  ],
  [
    "20260708003000_mac_admin_w7pos_009_pos_admin_permission_remote_repair.sql",
    "99003edfb76a696d84b07b6b71b920c146c54b165c640badb5d5d3748b840c04",
  ],
  [
    "20260713010000_deep_audit_shop_scoped_dml_rls.sql",
    "fac79bd4455dcbbf225d1d23784b386c22532cd2b32670907a19da1a524753ee",
  ],
  [
    "20260713020000_deep_audit_atomic_staff_lockout.sql",
    "77b57355e087f3a0487ad0eb6b3594c1f2fe4c0a35954f9d21a535b6a30f6751",
  ],
  [
    "20260718120000_task_139_product_image_cleanup_runs.sql",
    "41903721ce88632ef9380f921adce12143f4ac44344ba127a7374858d73a23c6",
  ],
  [
    "20260718235345_task_140_staff_pin_reset_login.sql",
    "3f6382029aaafa132bef74dce4a3015d5f5b84e0e0ce3e6a625a841d685813c5",
  ],
  [
    "20260719090000_task_140_auth_concurrency_hardening.sql",
    "60f31949a73977b0d91aa4104021b8aec6ceb8302ee306538d6f9e28c797ff11",
  ],
]);

test("the eight recovered staging migration sources remain byte-exact", () => {
  assert.equal(recovered.size, 8);

  for (const [fileName, expectedSha256] of recovered) {
    const bytes = readFileSync(join(root, "supabase", "migrations", fileName));
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actualSha256, expectedSha256, fileName);
  }
});

test("the reconciliation plan forbids destructive ledger operations", () => {
  const plan = readFileSync(
    join(
      root,
      "docs",
      "DEPLOYMENT",
      "STAGING-MIGRATION-RECONCILIATION-20260723.md",
    ),
    "utf8",
  );

  assert.match(plan, /No `reset`, `repair`, `squash`/);
  assert.match(plan, /only expected pending migration/);
  assert.match(
    plan,
    /20260719170600_task_139_pos_catalog_v2_pagination_snapshot\.sql/,
  );
  assert.match(plan, /There is no destructive down migration/);
});
