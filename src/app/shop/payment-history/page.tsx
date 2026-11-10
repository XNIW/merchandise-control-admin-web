import {PaymentHistoryWorkbench} from "@/components/shop/PaymentHistoryWorkbench";
import {getI18n} from "@/i18n/get-locale";
import {paymentHistoryCopy} from "@/i18n/payment-history";
import {resolveShopAdminDataAccess} from "@/server/shop-admin/data-access";
import {historyRequest} from "@/server/payment-history/request-boundary";
import {createLocalizedPageMetadata} from "@/i18n/metadata";
export const dynamic="force-dynamic";
export function generateMetadata(){return createLocalizedPageMetadata("Card payment history");}
export default async function PaymentHistoryPage({searchParams}:{searchParams:Promise<{shop_id?:string|string[]}>}){
 const [params,{locale}]=await Promise.all([searchParams,getI18n()]),copy=paymentHistoryCopy(locale);
 const requested=Array.isArray(params.shop_id)?params.shop_id[0]:params.shop_id;
 const access=await resolveShopAdminDataAccess({requestedShopId:requested,strictRequestedShop:true});
 if(access.status!=="ready"||access.principalKind==="pos_staff_manager"&&access.principal.roleKey==="courier")return <p role="alert" className="p-6">{copy.unavailable}</p>;
 let capabilities:Record<string,unknown>|null=null;
 try{capabilities=await historyRequest(access,"capabilities");}catch{}
 return capabilities?<PaymentHistoryWorkbench shopId={access.selectedShop.shopId} copy={copy} locale={locale} initialCapabilities={capabilities}/>:<p role="alert" className="p-6">{copy.unavailable}</p>;
}
