const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPostgresUuid(value: unknown): value is string {
  return typeof value === "string" && POSTGRES_UUID_PATTERN.test(value);
}

export function canonicalPostgresUuid(value: unknown) {
  return isPostgresUuid(value) ? value.toLowerCase() : null;
}

export function isCanonicalPostgresUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.toLowerCase() &&
    POSTGRES_UUID_PATTERN.test(value)
  );
}
