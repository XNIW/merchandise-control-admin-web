import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import {getPlatformShopsReadModel} from "@/server/platform-admin/read-model";
import {demandMasterHistoryAccess,historyRequest} from "@/server/payment-history/request-boundary";
import {PaymentHistoryWorkbench} from "@/components/shop/PaymentHistoryWorkbench";
import {HistoryQualificationPanel} from "@/components/shop/HistoryQualificationPanel";
import {getI18n} from "@/i18n/get-locale";
import {paymentHistoryCopy} from "@/i18n/payment-history";
import {historyQualificationCopy} from "@/i18n/history-qualification";

export function generateMetadata() {
  return createLocalizedPageMetadata("Global History");
}

export const dynamic = "force-dynamic";

export default async function PlatformHistoryPage({searchParams}:{searchParams:Promise<{shop_id?:string|string[]}>}) {
  const [section,model,params,{locale}]=await Promise.all([getPlatformSectionForRequest("history"),getPlatformShopsReadModel(),searchParams,getI18n()]);
  const copy=historyQualificationCopy(locale),shops=model.status==="ready"?model.shops.filter(s=>s.shop_status==="active"):[];
  const requested=Array.isArray(params.shop_id)?params.shop_id[0]:params.shop_id,selected=shops.find(s=>s.shop_id===requested);
  let capabilities:Record<string,unknown>|null=null;
  if(selected)try{capabilities=await historyRequest(await demandMasterHistoryAccess(selected.shop_id),"capabilities");}catch{}
  return <PlatformPage section={section}><section className="space-y-5 rounded-xl border border-current/20 p-4"><h2 className="text-xl font-semibold">{copy.title}</h2><p>{copy.help}</p>
   <form className="flex flex-wrap items-end gap-3"><label>{copy.shop}<select name="shop_id" defaultValue={selected?.shop_id??""} required className="ml-3 rounded-lg border border-current/30 bg-transparent p-2"><option value="" disabled>{copy.select}</option>{shops.map(s=><option key={s.shop_id} value={s.shop_id}>{s.shop_name}</option>)}</select></label><button className="rounded-lg border border-current/30 px-4 py-2">{copy.open}</button></form>
   {selected&&capabilities?<><HistoryQualificationPanel key={selected.shop_id} shopId={selected.shop_id} copy={copy}/><PaymentHistoryWorkbench key={selected.shop_id+"workbench"} shopId={selected.shop_id} copy={paymentHistoryCopy(locale)} locale={locale} initialCapabilities={capabilities} technicalMode/></>:selected?<p role="alert">{copy.denied}</p>:null}
  </section></PlatformPage>;
}
