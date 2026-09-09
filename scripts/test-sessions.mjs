import assert from 'node:assert/strict';
import { authenticate, SESSION_SECONDS } from '../supabase/functions/_shared/session.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const secrets = { CARING_PASSCODE: 'test-passcode', CARING_SESSION_SECRET: 'test-signing-secret' };
globalThis.Deno = { env: { get: (key) => secrets[key] } };
const request = token => new Request('https://example.test', { headers: { authorization: 'Bearer ' + token } });
const now = 1800000000;
assert.equal(authenticate(request('wrong'), now), null);
const session = authenticate(request(secrets.CARING_PASSCODE), now);
assert.equal(session.expiresAt, (now + SESSION_SECONDS) * 1000);
assert.deepEqual(authenticate(request(session.token), now + SESSION_SECONDS - 1), session);
assert.equal(authenticate(request(session.token), now + SESSION_SECONDS), null);
assert.equal(authenticate(request(session.token + 'x'), now), null);
assert.equal(authenticate(request('tampered.' + session.token.split('.')[1]), now), null);
secrets.CARING_SESSION_SECRET = 'rotated';
assert.equal(authenticate(request(session.token), now), null);
const store = new Map();
function browser() {
  const elements = new Map(); const listeners = {};
  for (const id of ['auth-gate','workspace','sign-in-form','sign-in-passcode','auth-status','sign-out-button']) {
    elements.set('#'+id, { hidden: id !== 'auth-gate', value: '', querySelector(){return this.button ??= {}}, addEventListener(name,fn){this[name]=fn}, focus(){} });
  }
  let reloads = 0; let received = '';
  const window = { CARING_CONFIG: { memberDirectoryUrl: 'https://test' }, addEventListener(name,fn){listeners[name]=fn}, dispatchEvent(){}, location:{reload(){reloads++}} };
  const context = vm.createContext({ window, document: {querySelector:id=>elements.get(id)}, localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}, setInterval(){}, CustomEvent:class{}, fetch:async(url,options)=>{
    received=options.headers.Authorization;
    return {status:200,ok:true,json:async()=>({members:[],session:{token:'signed-token',expiresAt:Date.now()+86400000}})};
  }});
  vm.runInContext(readFileSync('auth.js','utf8'),context);
  return {window,elements,listeners,get received(){return received},get reloads(){return reloads}};
}
const first = browser();
first.elements.get('#sign-in-passcode').value='test-passcode';
await first.elements.get('#sign-in-form').submit({preventDefault(){}});
assert.equal(first.elements.get('#workspace').hidden,false);
assert.ok(!store.get('caring-session-v1').includes('test-passcode'));
const returning = browser(); await returning.listeners.DOMContentLoaded();
assert.equal(returning.received,'Bearer signed-token');
assert.equal(returning.elements.get('#workspace').hidden,false);
returning.elements.get('#sign-out-button').click();
assert.equal(store.size,0); assert.equal(returning.reloads,1);
store.set('caring-session-v1',JSON.stringify({token:'expired',expiresAt:1}));
const expired = browser(); await expired.listeners.DOMContentLoaded();
assert.equal(expired.received,''); assert.equal(expired.elements.get('#workspace').hidden,true);
console.log('Session tests passed: 90-day expiration, no sliding renewal, tamper rejection, key rotation, browser restoration, sign-out, and expired storage.');
