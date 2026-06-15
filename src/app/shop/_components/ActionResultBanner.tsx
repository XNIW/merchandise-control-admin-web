import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { getI18n } from "@/i18n/get-locale";

type ActionResultBannerProps = {
  action?: string;
  result?: string;
};

export async function ActionResultBanner({ action, result }: ActionResultBannerProps) {
  if (!action || !result) {
    return null;
  }

  const { dictionary } = await getI18n();
  const isSuccess = result === "success";
  const message = dictionary.actionResults[action] ?? "Action finished.";

  return (
    <div
      className={[
        `${SHOP_ADMIN_CONTENT_FRAME_CLASS} rounded-md border px-4 py-3 text-sm`,
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
