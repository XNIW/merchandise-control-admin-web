import { getI18n } from "@/i18n/get-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveMiniDirectConfig } from "@/server/auth/wechat-mini-direct-config";
import { PairingPanel } from "./PairingPanel";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Account Profile");
}

export const dynamic = "force-dynamic";
export default async function MiniPairingPage() {
  const { locale } = await getI18n();
  const client = await createSupabaseServerClient();
  const auth = await client?.auth.getUser();
  const user = auth?.error ? null : auth?.data.user;
  const profile = user
    ? await client
        ?.from("profiles")
        .select("display_name")
        .eq("profile_id", user.id)
        .maybeSingle()
    : null;
  const config = resolveMiniDirectConfig();
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8">
      <PairingPanel
        locale={locale}
        canManage={Boolean(user)}
        accountName={profile?.data?.display_name ?? "—"}
        enabled={Boolean(
          user &&
          config.enrollmentReady &&
          config.common.miniAllowedProfileIds.includes(user.id),
        )}
      />
    </main>
  );
}
