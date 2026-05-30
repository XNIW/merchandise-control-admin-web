export const platformShopAuditEvents = {
  createAttempt: "platform.shop.create.attempt",
  createSuccess: "platform.shop.create.success",
  createFailure: "platform.shop.create.failure",
  ownerAssignAttempt: "platform.shop.owner.assign.attempt",
  ownerAssignSuccess: "platform.shop.owner.assign.success",
  ownerAssignFailure: "platform.shop.owner.assign.failure",
  suspendAttempt: "platform.shop.suspend.attempt",
  suspendSuccess: "platform.shop.suspend.success",
  suspendFailure: "platform.shop.suspend.failure",
  reactivateAttempt: "platform.shop.reactivate.attempt",
  reactivateSuccess: "platform.shop.reactivate.success",
  reactivateFailure: "platform.shop.reactivate.failure",
  softDeleteAttempt: "platform.shop.soft_delete.attempt",
  softDeleteSuccess: "platform.shop.soft_delete.success",
  softDeleteFailure: "platform.shop.soft_delete.failure",
} as const;

export type PlatformShopAuditEvent =
  (typeof platformShopAuditEvents)[keyof typeof platformShopAuditEvents];
