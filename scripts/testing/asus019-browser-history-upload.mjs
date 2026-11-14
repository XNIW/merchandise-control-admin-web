// Same multipart contract as the real HistoryTransferPanel/Workbench. Synthetic
// File construction must retain the MIME type a browser file chooser supplies.
export function ownedHistoryMediaType(fileName) {
 if(typeof fileName!=='string'||/[\r\n]/.test(fileName))throw Error('history_test_owned_export_type');
 if(/^freeze-[0-9a-f]{32}\.w7history\.zip$/.test(fileName))return 'application/zip';
 if(/^new-[0-9a-f]{32}\.xlsx$/.test(fileName))return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 throw Error('history_test_owned_export_type');
}

// Self-contained: Playwright serializes this function into the real browser.
// Only a bounded status and closed Storage code cross back into the receipt.
export async function putBrowserHistorySource({signedUrl,bytes,fileName,contentType}) {
 try {
  const form=new FormData();form.append('cacheControl','3600');
  form.append('',new File([new Uint8Array(bytes)],fileName,{type:contentType}));
  const response=await fetch(signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:form});
  let storageCode=null;
  if(!response.ok) {
   let body;try{body=await response.json();}catch{}
   const allowed=['InvalidMimeType','InvalidJWT','NoSuchBucket','NoSuchKey','Duplicate',
    'AccessDenied','InvalidUploadSignature','InvalidRequest','EntityTooLarge'];
   storageCode=[body?.code,body?.error,body?.errorCode].find(v=>allowed.includes(v))??null;
  }
  return {ok:response.ok===true,httpStatus:Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null,storageCode};
 } catch {
  return {ok:false,httpStatus:null,storageCode:'transport_error'};
 }
}
