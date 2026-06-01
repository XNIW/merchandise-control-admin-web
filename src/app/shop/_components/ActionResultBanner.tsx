type ActionResultBannerProps = {
  action?: string;
  result?: string;
};

const actionLabels: Record<string, string> = {
  conflict: "Duplicate active value blocked.",
  db_failure: "The database action failed without exposing internal details.",
  duplicate_staff_code: "Duplicate staff code blocked for this shop.",
  invalid_category: "The selected category is not valid for this shop.",
  invalid_state: "The target row is not in the expected state.",
  invalid_state_or_not_found: "The target row was not found or is not active.",
  invalid_supplier: "The selected supplier is not valid for this shop.",
  not_configured: "Supabase runtime is not configured.",
  not_found: "The requested row was not found.",
  preview_mismatch: "The workbook no longer matches the preview digest.",
  preview_required: "Preview and confirm the workbook before applying it.",
  reason_required: "A reason is required for that sensitive action.",
  success: "Action completed.",
  unauthorized: "This account is not authorized for that action.",
  unauthorized_or_unmapped:
    "This shop is not authorized or has no mapped inventory source.",
  validation_failed: "Check the form fields and confirmation value.",
};

export function ActionResultBanner({ action, result }: ActionResultBannerProps) {
  if (!action || !result) {
    return null;
  }

  const isSuccess = result === "success";
  const message = actionLabels[action] ?? "Action finished.";

  return (
    <div
      className={[
        "rounded-md border px-4 py-3 text-sm",
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-amber-200 bg-amber-50 text-amber-950",
      ].join(" ")}
      role="status"
    >
      {message}
    </div>
  );
}
