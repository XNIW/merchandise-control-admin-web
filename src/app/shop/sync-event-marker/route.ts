import {type NextRequest,NextResponse} from "next/server";
import {resolveShopAdminDataAccess} from "@/server/shop-admin/data-access";
import {readSafeSyncEvents} from "@/server/sync-events/read-boundary";
import {readStaffMobileOperations} from "@/server/shop-admin/staff-mobile-operations-read";
import {historyRequest,HistoryRequestError} from "@/server/payment-history/request-boundary";
import {composeShopRevisionMarker,type RevisionDomain} from "@/server/payment-history/revision-marker";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const shopId=request.nextUrl.searchParams.get("shopId")?.trim()??"";
 const access=await resolveShopAdminDataAccess({requestedShopId:shopId,strictRequestedShop:true});
 const headers={"Cache-Control": "private, no-store"};
 if(access.status!=="ready"||access.selectedShop.shopId !== shopId||access.principalKind==="pos_staff_manager"&&access.principal.roleKey==="courier")
  return NextResponse.json({code:"unauthorized"},{status:401,headers});
 const general=async():Promise<RevisionDomain>=>{
  if(access.principalKind==="pos_staff_manager"){
   const result=await readStaffMobileOperations(access,"marker");
   return result.status==="ready"?{status:"ready",value:result.data!.sync.eventMarker}:{status:result.status==="unauthorized"?"denied":"unavailable"};
  }
  const result=await readSafeSyncEvents(access.supabase,{limit: 1,shopId});
  return result.error?{status:"unavailable"}:{status:"ready",value:result.data.eventMarker};
 };
 const financial=async():Promise<RevisionDomain>=>{
  try{
   const result=await historyRequest(access,"capabilities"),caps=result.capabilities as Record<string,boolean>;
   return caps.read===true?{status:"ready",value:JSON.stringify([result.runtime,caps])}:{status:"denied"};
  }catch(error){return {status:error instanceof HistoryRequestError&&error.status===403?"denied":"unavailable"};}
 };
 const [catalog,history]=await Promise.all([general(),financial()]);
 if(catalog.status!=="ready"&&history.status!=="ready")return NextResponse.json({code:"sync_event_marker_unavailable"},{status:catalog.status==="denied"&&history.status==="denied"?403:503,headers});
 return NextResponse.json(await composeShopRevisionMarker(shopId,catalog,history),{headers});
}
