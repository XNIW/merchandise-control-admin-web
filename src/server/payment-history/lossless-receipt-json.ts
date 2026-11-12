// Only for immutable legacy receipts. Integer monetary literals never pass
// through IEEE754; the original text remains the authoritative provenance.
export class ReceiptNumber {constructor(readonly raw:string){}}
export type ReceiptJson=null|boolean|string|ReceiptNumber|ReceiptJson[]|{[key:string]:ReceiptJson};
export function parseReceiptJson(source:string):ReceiptJson{
 if(Buffer.byteLength(source,"utf8")>2*1024*1024)throw Error("history_receipt_limit");
 let at=0,nodes=0;
 const bad=()=>{throw Error("history_receipt_invalid");};
 const space=()=>{while(/[\x20\t\r\n]/.test(source[at]??"!"))at++;};
 const string=()=>{
  const start=at++;let escaped=false;
  while(at<source.length){const c=source[at++];if(c==='"'&&!escaped){let result:string;try{result=JSON.parse(source.slice(start,at));}catch{return bad();}for(const rune of result){const point=rune.codePointAt(0)!;if(point>=0xd800&&point<=0xdfff)bad();}return result;}if(c==="\\"&&!escaped)escaped=true;else escaped=false;}
  return bad();
 };
 function value(depth:number):ReceiptJson{
  if(depth>32||++nodes>20000)throw Error("history_receipt_limit");space();const c=source[at];
  if(c==='"')return string();
  if(c==="{"||c==="["){
   at++;space();const object:{[key:string]:ReceiptJson}=Object.create(null),array:ReceiptJson[]=[],close=c==="{"?"}":"]";
   if(source[at]===close){at++;return c==="{"?object:array;}
   while(true){space();if(c==="{"){if(source[at]!=='"')return bad();const key=string();space();if(source[at++]!==":"||Object.hasOwn(object,key))return bad();object[key]=value(depth+1);}else array.push(value(depth+1));space();const next=source[at++];if(next===close)break;if(next!==",")return bad();}
   return c==="{"?object:array;
  }
  for(const [literal,result] of [["true",true],["false",false],["null",null]] as const)if(source.startsWith(literal,at)){at+=literal.length;return result;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));if(!number)return bad();at+=number[0].length;return new ReceiptNumber(number[0]);
 }
 const result=value(0);space();if(at!==source.length)bad();return result;
}
