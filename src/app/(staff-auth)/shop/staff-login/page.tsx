import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StaffManagerWebLoginPage() {
  redirect("/auth/login?next=/shop&mode=shop-code");
}
