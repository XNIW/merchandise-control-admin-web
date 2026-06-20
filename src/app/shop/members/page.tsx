import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  MemberActionPanel,
  type MemberActionPanelLabels,
} from "@/app/shop/_components/MemberActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Members");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function memberActionLabels(t: (value: string) => string): MemberActionPanelLabels {
  return {
    inviteMember: t("Invite member"),
    memberRowId: t("Member row id"),
    profileId: t("Profile id"),
    reason: t("Reason"),
    removeMember: t("Remove member"),
    role: t("Role"),
    roleShopManager: t("Shop manager"),
    roleShopOwner: t("Shop owner"),
    roleViewer: t("Viewer"),
    typeRemoveConfirmation: t("Type REMOVE as confirmation"),
    typeRoleConfirmation: t("Type ROLE as confirmation"),
    updateRole: t("Update role"),
  };
}

export default async function ShopMembersPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const { dictionary } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const requestedShopId = getParam(params, "shop_id");
  const [section, memberActionContext] = await Promise.all([
    getShopSectionForRequest("members", requestedShopId),
    resolveShopActionContext(requestedShopId, "members.manage"),
  ]);
  const canManageMembers =
    memberActionContext.status === "ready";

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      {canManageMembers ? (
        <MemberActionPanel
          labels={memberActionLabels(t)}
          selectedShopId={requestedShopId}
        />
      ) : null}
    </div>
  );
}
