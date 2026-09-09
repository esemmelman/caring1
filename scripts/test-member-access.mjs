import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { authenticate, SESSION_SECONDS } from '../supabase/functions/_shared/session.mjs';
const values = { CARING_PASSCODE: 'test-passcode', CARING_SESSION_SECRET: 'test-secret', SUPABASE_URL: 'https://test', SUPABASE_SERVICE_ROLE_KEY: 'server-key', GOOGLE_MAPS_API_KEY: 'maps-key' };
globalThis.Deno = {env:{get:key=>values[key]}};
let handler; let calls=[];
const source = readFileSync('supabase/functions/member-admin/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInNewContext(stripTypeScriptTypes(source), {
  authenticate, Deno:{env:Deno.env,serve:fn=>{handler=fn}}, Response, console, URLSearchParams,
  createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:'test-id',error:null}}}),
  fetch:async()=>({ok:true,json:async()=>({status:'OK',results:[{geometry:{location:{lat:34,lng:-118}}}]})}),
});
const now=Math.floor(Date.now()/1000);
const authRequest=token=>new Request('https://test',{headers:{authorization:'Bearer '+token}});
const session=authenticate(authRequest(values.CARING_PASSCODE),now);
const expired=authenticate(authRequest(values.CARING_PASSCODE),now-SESSION_SECONDS-1);
async function invoke(token,action) {
 return handler(new Request('https://test',{method:'POST',headers:token?{authorization:'Bearer '+token}:{},body:JSON.stringify({action,id:'test-id',name:'Test person',address:'Test address',email:'test@example.test',phone:'555'})}));
}
for(const token of ['', 'wrong',session.token+'x',expired.token]) {
 for(const action of ['create','update','delete']) assert.equal((await invoke(token,action)).status,401);
}
assert.equal(calls.length,0);
for(const token of [values.CARING_PASSCODE,session.token]) {
 for(const action of ['create','update','delete']) {
  const response=await invoke(token,action);assert.equal(response.status,200);
  assert.equal(calls.at(-1).name,'caring_admin_'+action+'_member');
 }
}
assert.equal(calls.length,6);
console.log('Member access tests passed: passcode and remembered sessions authorize create/update/delete; absent, incorrect, tampered and expired credentials cannot reach database operations.');
