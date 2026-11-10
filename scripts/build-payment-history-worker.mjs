import {build} from "esbuild";
import {resolve,isAbsolute} from "node:path";
// Use locked esbuild from the existing OpenNext toolchain. No auto-install.
const output=process.argv[2];
if(!output||!isAbsolute(output)||!resolve(output).endsWith(".cjs"))throw Error("Pass an absolute .cjs output outside the repository");
const path=resolve(output),root=process.cwd().toLowerCase();
if(path.toLowerCase().startsWith(root+"\\")||path.toLowerCase().startsWith(root+"/"))throw Error("Worker artifacts belong outside the checkout");
await build({entryPoints:["tools/PaymentHistoryWorker/main.ts"],bundle:true,platform:"node",target:"node24",format:"cjs",conditions:["react-server"],outfile:path,sourcemap:false,logLevel:"warning"});
process.stdout.write("payment_history_worker_built\n");
