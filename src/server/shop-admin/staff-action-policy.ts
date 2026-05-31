import "server-only";

export type StaffActionKey =
  | "create_staff"
  | "reset_credential"
  | "suspend_staff"
  | "reactivate_staff"
  | "archive_staff";

export type StaffActionPolicy = {
  action: StaffActionKey;
  label: string;
  status: "blocked_schema";
  reason: string;
};

export const STAFF_ACTIONS_REQUIRE_RPC = true;

const blockedStaffActionReason =
  "Staff mutations require an audited shop-scoped RPC boundary; TASK-014 grants only credential-safe reads.";

export const staffActionPolicies: readonly StaffActionPolicy[] = [
  {
    action: "create_staff",
    label: "Create staff account",
    status: "blocked_schema",
    reason: blockedStaffActionReason,
  },
  {
    action: "reset_credential",
    label: "Reset credential",
    status: "blocked_schema",
    reason: blockedStaffActionReason,
  },
  {
    action: "suspend_staff",
    label: "Suspend staff",
    status: "blocked_schema",
    reason: blockedStaffActionReason,
  },
  {
    action: "reactivate_staff",
    label: "Reactivate staff",
    status: "blocked_schema",
    reason: blockedStaffActionReason,
  },
  {
    action: "archive_staff",
    label: "Archive staff",
    status: "blocked_schema",
    reason: blockedStaffActionReason,
  },
];

export function getStaffActionPolicies() {
  return staffActionPolicies;
}
