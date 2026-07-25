import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizePosSyncRecoveryAuditNote,
} from "../../src/server/shop-admin/pos-sync-recovery-note.ts";

test("POS recovery audit notes preserve ordinary text after bounded normalization", () => {
  assert.deepEqual(
    normalizePosSyncRecoveryAuditNote("  Controllare \n il batch  "),
    {
      kind: "accepted",
      value: "Controllare il batch",
    },
  );
});

test("POS recovery audit notes reject bearer, JWT, signed URL and token material", () => {
  const synthetic = {
    basic: Buffer.from("user:password").toString("base64"),
    github: `gh${"p"}_${"abcdefghijklmnopqrstuvwxyz0123456789"}`,
    mcpos: `mcpos_${"session"}_${"abcdefghijklmnopqrstuvwxyz"}`,
    stripe: `sk_${"live"}_${"abcdefghijklmnopqrstuvwxyz"}`,
    supabase: `sb_${"secret"}_${"abcdefghijklmnopqrstuvwxyz"}`,
  };
  const sensitiveNotes = [
    "Bearer abcdefghijklmnopqrstuvwxyz012345",
    [
      "eyJhbGciOiJIUzI1NiJ9",
      "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
      "signature12345",
    ].join("."),
    "access_token=abcdefghijklmnopqrstuvwxyz",
    "https://user:password@example.invalid/private",
    "https://example.invalid/storage/v1/object/sign/private/file.jpg?token=secretvalue",
    synthetic.supabase,
    "password=synthetic-value",
    "PIN: 123456",
    synthetic.mcpos,
    `SUPABASE_${"SERVICE_ROLE_KEY"}=synthetic-value`,
    "secret=synthetic-value",
    synthetic.github,
    synthetic.stripe,
    `Authorization: Basic ${synthetic.basic}`,
  ];

  for (const note of sensitiveNotes) {
    assert.deepEqual(
      normalizePosSyncRecoveryAuditNote(note),
      { kind: "rejected" },
    );
  }
});

test("POS recovery audit-note policy stays aligned with the additive SQL fence", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260725154500_task_139_pos_recovery_audit_note_redaction.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const marker of [
    "audit_note_is_redacted_v1",
    "authorization",
    "password",
    "mcpos",
    "service[_-]?role",
    "github_pat",
    "private key",
  ]) {
    assert.ok(migration.includes(marker), `SQL policy should include ${marker}`);
  }
});
