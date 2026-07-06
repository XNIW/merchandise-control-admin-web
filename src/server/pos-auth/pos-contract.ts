import "server-only";

export const POS_POLICY_CONTRACT_VERSION = "pos-policy-v1" as const;
export const POS_CATALOG_SCHEMA_VERSION = 2 as const;
export const POS_CATALOG_CAPABILITY_VERSION = "catalog-v2" as const;
export const POS_CATALOG_IMPORT_SCHEMA_VERSION = "pos-catalog-import-v1" as const;
export const POS_LEGACY_SALES_SCHEMA_VERSION = "pos-sales-v1" as const;
export const POS_SALES_SCHEMA_VERSION = "pos-sales-ledger-v2" as const;

export const POS_SUPPORTED_PAYMENT_METHODS = ["cash", "card", "other"] as const;
export const POS_UNSUPPORTED_PAYMENT_METHODS = ["transfer"] as const;

export const POS_POLICY_LIMITATIONS = [
  "first_activation_requires_online",
  "offline_revocation_enforced_on_next_online_check",
  "staff_roster_not_synced",
  "credential_material_not_synced",
  "transfer_payments_not_enabled_in_win7pos",
  "tax_policy_not_configured_online",
] as const;

export const POS_UNSUPPORTED_CAPABILITIES = [
  "server_driven_pos_retry_polling",
  "remote_outbox_mutation",
  "online_tax_authority_integration",
  "multi_staff_offline_credential_roster",
] as const;

export type PosSalesSchemaVersion =
  | typeof POS_LEGACY_SALES_SCHEMA_VERSION
  | typeof POS_SALES_SCHEMA_VERSION;
