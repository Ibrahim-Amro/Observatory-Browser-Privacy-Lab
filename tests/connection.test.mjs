import assert from 'node:assert/strict';
import { createConnectionMonitor } from '../dist/connection.js';
class Surface {
  constructor(){this.listeners=new Map();}
  addEventListener(type,callback){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(callback);}
  removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
  dispatch(type){for(const callback of this.listeners.get(type)||[])callback({type});}
  count(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
class Clock {
  constructor(){this.now=0;this.next=1;this.jobs=new Map();}
  add(callback,delay,repeat=false){const id=this.next++;this.jobs.set(id,{callback,due:this.now+delay,delay,repeat});return id;}
  clear(id){this.jobs.delete(id);}
  advance(ms){const end=this.now+ms;while(true){const next=[...this.jobs.entries()].filter(([,job])=>job.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;const[id,job]=next;this.now=job.due;if(job.repeat)job.due+=job.delay;else this.jobs.delete(id);job.callback();}this.now=end;}
}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const flush=async()=>{for(let i=0;i<28;i++)await Promise.resolve();};
const context=(address='203.0.113.10',extra={})=>({address,family:address.includes(':')?'IPv6':'IPv4',local:false,cookiePresent:false,headers:{'user-agent':'First header snapshot'},...extra});
const response=raw=>({ok:true,status:200,redirected:false,headers:{get:name=>name==='content-type'?'application/json; charset=utf-8':null},text:async()=>JSON.stringify(raw)});
const original=Object.fromEntries(['window','document','navigator','fetch','setTimeout','clearTimeout','setInterval','clearInterval'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
function harness(options={}){
  const clock=new Clock(),win=new Surface(),doc=Object.assign(new Surface(),{hidden:false}),nav={onLine:true},queue=[],calls=[],updates=[],events=[],signals=new Map();
  for(const[key,value]of Object.entries({window:win,document:doc,navigator:nav,fetch:(url,options)=>{calls.push({url:String(url),options});const next=queue.shift();if(!next)return Promise.reject(new Error('Unscheduled fetch'));return typeof next==='function'?next(options):Promise.resolve(next);},setTimeout:(fn,ms)=>clock.add(fn,ms),clearTimeout:id=>clock.clear(id),setInterval:(fn,ms)=>clock.add(fn,ms,true),clearInterval:id=>clock.clear(id)}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const monitor=createConnectionMonitor({setSignal:(group,key,value,meta)=>{assert.equal(group,'network');signals.set(key,{value,...meta});},addEvent:(title,detail,kind,meta)=>events.push({title,detail,kind,meta}),onUpdate:state=>updates.push(state),minIntervalMs:0,now:()=>clock.now,...options});
  return{monitor,clock,win,doc,nav,queue,calls,updates,events,signals};
}
try{
  {
    const h=harness({minIntervalMs:5000});h.queue.push(response(context()));const initial=await h.monitor.start();
    assert.equal(initial.address,'203.0.113.10');assert.equal(initial.status,'ready');assert.equal(initial.architecture,'same-origin');assert.equal(initial.sourceId,'same-origin-host');assert.equal(initial.pollingIntervalMs,0);
    const call=h.calls[0];assert.ok(new URL(call.url).pathname.endsWith('/api/context.php'));assert.equal(call.options.credentials,'omit');assert.equal(call.options.mode,'same-origin');assert.equal(call.options.cache,'no-store');assert.equal(call.options.redirect,'error');assert.equal(call.options.referrerPolicy,'no-referrer');
    await h.monitor.checkNow();assert.equal(h.calls.length,1);assert.equal(h.monitor.readState().throttled,true);assert.match(h.monitor.readState().detail,/No new request/);
    h.clock.advance(90000);h.win.dispatch('focus');await flush();assert.equal(h.calls.length,1,'No polling or automatic focus fetch by default.');
    h.queue.push(response(context()));await h.monitor.checkNow();assert.equal(h.calls.length,2);assert.equal(h.monitor.readState().throttled,false);
    h.monitor.stop();assert.equal(h.clock.jobs.size,0);assert.equal(h.doc.count()+h.win.count(),0);
  }
  {
    const h=harness();h.queue.push(response(context()));await h.monitor.start();const good=h.monitor.readState();
    const failures=[
      [{ok:false,status:500},'http',500],
      [{...response({}),text:async()=>'{not json'},'invalid-json',null],
      [{...response({}),headers:{get:()=> 'text/html'}},'invalid-content-type',null],
      [response(context('999.1.2.3')),'invalid-address',null],
      [()=>Promise.reject(new TypeError('Failed to fetch')),'network-or-blocked',null],
      [{...response({}),text:async()=>'x'.repeat(32769)},'oversized-response',null],
    ];
    for(const[reply,code,status]of failures){h.queue.push(reply);await h.monitor.checkNow();const state=h.monitor.readState();assert.equal(state.status,'error');assert.equal(state.errorCode,code);assert.equal(state.httpStatus,status);assert.equal(state.address,good.address);assert.equal(state.checkedAt,good.checkedAt);assert.equal(state.stale,true);assert.equal(state.changes,0);assert.match(h.signals.get('Server-visible connection IP').note,/Stale/);}
    assert.match(h.updates.find(s=>s.httpStatus===500).detail,/HTTP 500/);
    h.queue.push(response(context('198.51.100.2')));await h.monitor.checkNow();assert.equal(h.monitor.readState().stale,false);assert.equal(h.monitor.readState().changes,1);
    h.monitor.stop();
  }
  {
    const h=harness(),pending=deferred();h.queue.push(()=>pending.promise);const initial=h.monitor.start();assert.equal(h.monitor.checkNow(),initial,'Single-flight requests share a promise.');await flush();h.clock.advance(10000);await initial;
    assert.equal(h.monitor.readState().errorCode,'timeout');assert.equal(h.monitor.readState().busy,false);assert.equal(h.calls[0].options.signal.aborted,true);
    pending.resolve(response(context()));await flush();assert.equal(h.monitor.readState().address,null);
    h.queue.push(response(context('198.51.100.3')));await h.monitor.checkNow();
    h.nav.onLine=false;h.win.dispatch('offline');assert.equal(h.monitor.readState().errorCode,'offline');assert.equal(h.monitor.readState().stale,true);const count=h.calls.length;await h.monitor.checkNow();assert.equal(h.calls.length,count);
    h.nav.onLine=true;h.win.dispatch('online');h.win.dispatch('focus');await flush();assert.equal(h.calls.length,count,'Online/focus return requires a manual check in default mode.');
    const late=deferred();h.queue.push(()=>late.promise);const check=h.monitor.checkNow();await flush();h.monitor.stop();const updates=h.updates.length;await check;late.resolve(response(context('192.0.2.99')));await flush();assert.equal(h.updates.length,updates);assert.equal(h.monitor.readState().address,'198.51.100.3');await h.monitor.start();assert.equal(h.calls.length,count+1);
  }
  {
    const h=harness();const pending=deferred();h.queue.push(()=>pending.promise);const check=h.monitor.start();await flush();h.doc.hidden=true;h.doc.dispatch('visibilitychange');await check;assert.equal(h.calls[0].options.signal.aborted,true);assert.equal(h.monitor.readState().errorCode,'hidden');h.doc.hidden=false;h.doc.dispatch('visibilitychange');await flush();assert.equal(h.calls.length,1);h.queue.push(response(context('198.51.100.7')));await h.monitor.checkNow();pending.resolve(response(context('203.0.113.99')));await flush();assert.equal(h.monitor.readState().address,'198.51.100.7');assert.equal(h.monitor.readState().changes,0);h.monitor.stop();
  }
  {
    const h=harness();h.queue.push(response(context('203.0.113.1')));await h.monitor.start();
    for(const address of['2001:0DB8:0:0:0:0:0:1','203.0.113.1','2001:db8::1']){h.queue.push(response(context(address)));await h.monitor.checkNow();assert.equal(h.monitor.readState().changes,0,'IPv4/IPv6 switching itself never counts.');}
    h.queue.push(response(context('203.0.113.2')));await h.monitor.checkNow();assert.equal(h.monitor.readState().changes,1);assert.equal(h.monitor.readState().previousAddress,'203.0.113.1');
    h.queue.push(response(context('::ffff:203.0.113.2')));await h.monitor.checkNow();assert.equal(h.monitor.readState().family,'IPv4');assert.equal(h.monitor.readState().changes,1,'Mapped IPv6 equals its IPv4 address.');
    for(const source of[{id:'different-provider',addressSource:'remote-address'},{id:'same-origin-host',addressSource:'trusted-proxy'},{id:'same-origin-host',addressSource:'remote-address'}]){h.queue.push(response(context('198.51.100.50',{source})));await h.monitor.checkNow();assert.equal(h.monitor.readState().changes,1,'A source/provenance change starts a new baseline.');assert.equal(h.monitor.readState().previousAddress,null);}
    assert.equal(h.events.filter(e=>e.title==='Server-visible connection IP changed').length,1);h.monitor.stop();
  }
  {
    const h=harness();h.queue.push(response(context('198.51.100.1',{location:{status:'available',city:'Fixture City',country:'Fixture Country',countryCode:'gb',source:'DB-IP City Lite',databaseDate:'2026-10',asn:'AS64500',organization:'Fixture network',asnSource:'DB-IP ASN Lite',asnDatabaseDate:'2026-09'}})));await h.monitor.start();assert.equal(h.monitor.readState().location.countryCode,'GB');assert.equal(h.signals.get('Approximate IP location').kind,'estimate');assert.match(h.signals.get('IP network ASN').source,/ip-to-asn-lite$/);
    const copy=h.monitor.readState();copy.location.city='Mutated';assert.equal(h.monitor.readState().location.city,'Fixture City');
    for(const location of[undefined,null,'bad',{status:'broken'},{status:'available',city:'x'.repeat(121),source:'wrong-provider'}]){h.queue.push(response(context('198.51.100.2',{location,headers:null})));await h.monitor.checkNow();assert.equal(h.monitor.readState().status,'ready','Optional bad location/header metadata must not suppress valid IP.');assert.equal(h.monitor.readState().location.status,'unavailable');assert.equal(h.signals.get('IP location source').kind,'unavailable');assert.equal(h.signals.get('IP location dataset date').source,'');assert.equal(h.signals.get('IP network organization').kind,'unavailable');}
    h.queue.push(response(context('127.0.0.2')));await h.monitor.checkNow();assert.equal(h.monitor.readState().local,true);assert.equal(h.monitor.readState().location.status,'local');h.monitor.stop();
  }
  {
    const h=harness({pollIntervalMs:1000});h.queue.push(response(context()));await h.monitor.start();assert.equal(h.monitor.readState().pollingIntervalMs,30000);h.queue.push(response(context()));h.clock.advance(30000);await flush();assert.equal(h.calls.length,2);h.monitor.stop();assert.equal(h.clock.jobs.size,0);
  }
  {
    const h=harness();let cancelled=false;h.queue.push({...response({}),body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(32769)}),cancel:async()=>{cancelled=true;},releaseLock(){}})}});await h.monitor.start();assert.equal(cancelled,true);assert.equal(h.monitor.readState().errorCode,'oversized-response');h.monitor.stop();
  }
  console.log('Connection: same-origin initial/manual checks, throttling, stale values, HTTP/JSON/timeout/blocked/offline states, independent IP families/sources, optional geodata, cancellation and cleanup passed.');
}finally{for(const[key,descriptor]of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
