// Only closed, already lease-validated metadata enters the discovery poll.
export type RevisionDomain={status:"ready";value:string}|{status:"denied"|"unavailable"};
async function hash(value:string){
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function composeShopRevisionMarker(shopId:string,general:RevisionDomain,history:RevisionDomain){
 const paymentHistoryMarker=history.status==="ready"?await hash(JSON.stringify([shopId,"payment-history",history.value])):null;
 return {eventMarker:await hash(JSON.stringify([shopId,general.status,general.status==="ready"?general.value:null,history.status,paymentHistoryMarker])),paymentHistoryMarker,paymentHistoryStatus:history.status};
}
