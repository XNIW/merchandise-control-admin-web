import "server-only";

export type StaffCredentialLockStateInput = {
  credentialStatus: string | null | undefined;
  lockedUntil?: string | null;
};

function isElapsedTimestamp(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

export function isStaffCredentialLockStateUsable(
  input: StaffCredentialLockStateInput,
) {
  const { credentialStatus, lockedUntil } = input;

  if (credentialStatus === "active") {
    return !lockedUntil || isElapsedTimestamp(lockedUntil);
  }

  return credentialStatus === "locked" && isElapsedTimestamp(lockedUntil);
}
