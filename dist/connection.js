const MAX_BYTES = 32768;
const HEADERS = new Set(['user-agent','accept','accept-language','sec-ch-ua','sec-ch-ua-platform','sec-ch-ua-mobile','sec-fetch-site','sec-fetch-mode','sec-fetch-dest','dnt','sec-gpc','referer']);
const CANCELLED = Symbol('cancelled'), TIMED_OUT = Symbol('timed out');
const SOURCE = 'https://www.w3.org/TR/fingerprinting-guidance/';
class ConnectionError extends Error {
  constructor(code, message, httpStatus = null) { super(message); this.code = code; this.httpStatus = httpStatus; }
}
const text = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
function parseAddress(raw) {
  const value = text(raw, 64);
  if (!value) return null;
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) {
    const parts = value.split('.').map(Number);
    if (parts.every(part => part <= 255)) return { address: parts.join('.'), family: 'IPv4' };
  }
  if (value.includes(':') && /^[\da-f:.]+$/i.test(value)) {
    try {
      const host = new URL(`http://[${value}]/`).hostname;
      if (host.startsWith('[') && host.endsWith(']')) {
        const address = host.slice(1, -1).toLowerCase();
        const mapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/.exec(address);
        if (mapped) {
          const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
          return { address: [high >> 8, high & 255, low >> 8, low & 255].join('.'), family: 'IPv4' };
        }
        return { address, family: 'IPv6' };
      }
    } catch { /* Invalid IPv6 is not an observation. */ }
  }
  return null;
}
function parseLocation(raw, local) {
  if (local) return { status: 'local', note: 'A loopback connection has no meaningful public IP location.' };
  const absent = { status: 'unavailable', note: 'No usable optional IP-location metadata was returned. The connection IP is still valid.' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['available','unavailable','local'].includes(raw.status)) return absent;
  const location = { status: raw.status };
  for (const [key, limit] of [['city',120],['region',160],['country',160],['countryCode',2],['organization',200],['note',500]]) {
    const value = text(raw[key], limit); if (value) location[key] = value;
  }
  if (location.countryCode && !/^[A-Z]{2}$/i.test(location.countryCode)) delete location.countryCode;
  if (location.countryCode) location.countryCode = location.countryCode.toUpperCase();
  if (['DB-IP City Lite','DB-IP Country Lite'].includes(raw.source)) location.source = raw.source;
  if (raw.asnSource === 'DB-IP ASN Lite') location.asnSource = raw.asnSource;
  for (const key of ['databaseDate','asnDatabaseDate']) if (typeof raw[key] === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(raw[key])) location[key] = raw[key];
  const asn = typeof raw.asn === 'string' && /^(?:AS)?\d{1,10}$/i.test(raw.asn) ? Number(raw.asn.replace(/^AS/i,'')) : raw.asn;
  if (Number.isInteger(asn) && asn > 0 && asn <= 4294967295) location.asn = asn;
  if (location.status !== 'available' || (!location.city && !location.region && !location.country)) {
    location.status = location.status === 'local' ? 'local' : 'unavailable';
    for (const key of ['city','region','country','countryCode','databaseDate','source']) delete location[key];
  }
  return location;
}
function validateContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ConnectionError('invalid-response','The endpoint returned an invalid connection response.');
  const parsed = parseAddress(raw.address), mapped = typeof raw.address === 'string' && /::ffff:/i.test(raw.address);
  if (!parsed || (raw.family && !['IPv4','IPv6','Unknown'].includes(raw.family)) || (raw.family && raw.family !== 'Unknown' && raw.family !== parsed.family && !(mapped && raw.family === 'IPv6'))) throw new ConnectionError('invalid-address','The endpoint did not return a valid, consistent IP address.');
  const headers = {};
  if (raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers)) for (const [name,value] of Object.entries(raw.headers).slice(0,24)) {
    const bounded = text(value,2048); if (HEADERS.has(name) && bounded !== null) headers[name] = bounded;
  }
  const local = parsed.address === '::1' || /^127\./.test(parsed.address);
  const source = raw.source && typeof raw.source === 'object' && !Array.isArray(raw.source) ? raw.source : {};
  return { ...parsed, local, headers, cookiePresent: typeof raw.cookiePresent === 'boolean' ? raw.cookiePresent : null, sourceId: text(source.id,80) || 'same-origin-host', addressSource: ['remote-address','trusted-proxy'].includes(source.addressSource) ? source.addressSource : 'remote-address', location: parseLocation(raw.location,local) };
}
async function readContext(response, signal) {
  if (!response?.ok) throw new ConnectionError('http',`This website’s IP endpoint returned HTTP ${Number.isInteger(response?.status) ? response.status : 'error'}.`,Number.isInteger(response?.status) ? response.status : null);
  if (response.redirected) throw new ConnectionError('redirect','The connection endpoint redirected unexpectedly.');
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || '')) throw new ConnectionError('invalid-content-type','The endpoint returned a page or other content instead of JSON.');
  if (Number(response.headers?.get?.('content-length')) > MAX_BYTES) throw new ConnectionError('oversized-response','The connection response exceeded the size limit.');
  let body = '';
  if (response.body?.getReader) {
    const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (signal.aborted) throw new ConnectionError('cancelled','Check cancelled.');
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) throw new ConnectionError('oversized-response','The connection response exceeded the size limit.');
        body += decoder.decode(part.value,{stream:true});
      }
      body += decoder.decode();
    } catch (error) { try { await reader.cancel(); } catch { /* Already aborted. */ } throw error; }
    finally { reader.releaseLock?.(); }
  } else {
    body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new ConnectionError('oversized-response','The connection response exceeded the size limit.');
  }
  if (signal.aborted) throw new ConnectionError('cancelled','Check cancelled.');
  let decoded; try { decoded = JSON.parse(body); } catch { throw new ConnectionError('invalid-json','The endpoint returned malformed JSON.'); }
  return validateContext(decoded);
}

/** Initial + manual same-origin checks. Polling is opt-in, never an IP/VPN verdict. */
export function createConnectionMonitor({setSignal,addEvent,onUpdate=()=>{},minIntervalMs=5000,pollIntervalMs=0,timeoutMs=10000,now=()=>Date.now()}) {
  const endpoint = new URL('./api/context.php',import.meta.url);
  const minimum = Number.isFinite(minIntervalMs) ? Math.max(0,minIntervalMs) : 5000;
  const polling = Number.isFinite(pollIntervalMs) && pollIntervalMs > 0 ? Math.max(30000,pollIntervalMs) : 0;
  const timeoutDuration = Number.isFinite(timeoutMs) ? Math.max(1000,Math.min(30000,timeoutMs)) : 10000;
  const emissions = new Map(), baselines = new Map(), listeners = [];
  let running=false,disposed=false,generation=0,pollTimer=null,operation=null,metadataShown=false,lastAttempt=-Infinity,lastObservationSource=null;
  let state = {address:null,previousAddress:null,changes:0,checkedAt:null,lastAttemptAt:null,status:'idle',detail:'One initial check and a manual refresh. No continuous polling is enabled.',local:null,family:null,busy:false,location:null,stale:false,errorCode:null,httpStatus:null,nextCheckAt:null,throttled:false,sourceId:'same-origin-host',sourceLabel:'This website’s same-origin endpoint',architecture:'same-origin',addressSource:'remote-address',endpoint:endpoint.pathname,comparison:'No baseline yet.',pollingIntervalMs:polling};
  const readState = () => ({...state,location:state.location?{...state.location}:null});
  const eligible = () => !globalThis.document?.hidden && globalThis.navigator?.onLine !== false;
  const safe = (callback,...args) => { try { callback?.(...args); } catch { /* Views cannot break cleanup. */ } };
  const update = patch => { state={...state,...patch};safe(onUpdate,readState()); };
  function emit(key,value,options={}) {
    const meta={kind:'observed',source:SOURCE,...options},previous=emissions.get(key);
    if(previous?.value===value&&previous.kind===meta.kind&&previous.note===meta.note&&previous.source===meta.source)return;
    emissions.set(key,{value,...meta});safe(setSignal,'network',key,value,meta);
  }
  function publishStatus() {
    emit('Connection check status',state.status,{kind:['error','paused'].includes(state.status)?'unavailable':'observed',note:state.detail});
    emit('Connection observation source',`${state.sourceLabel} · ${state.addressSource}`,{note:'Only this website’s context endpoint is contacted. There is no external IP-provider fallback.'});
    emit('Verified connection IP changes',state.changes,{note:'Only successful checks from the same source and equivalent IP family are compared. Source switches, IPv4/IPv6 switches and failures do not themselves count as changes.'});
    emit('Server-visible connection IP',state.address||'Not observed yet',{kind:state.address?'observed':'unavailable',note:state.address?`${state.stale?'Stale: the latest attempt failed or was interrupted. ':''}Last successful check: ${state.checkedAt}. ${state.comparison} Not an identity, precise-location or VPN verdict.`:'No valid connection address was received. No external provider is contacted.'});
    emit('Connection result freshness',state.stale?'Stale — last successful value retained':state.address?'Verified at the last successful check':'No successful check',{kind:state.address?'observed':'unavailable',note:'A snapshot, not continuous connection surveillance.'});
  }
  function publishLocation() {
    const location=state.location,stale=state.stale?'Stale metadata from the last successful check. ':'';
    const source=location?.source==='DB-IP Country Lite'?'https://db-ip.com/db/download/ip-to-country-lite':location?.source==='DB-IP City Lite'?'https://db-ip.com/db/download/ip-to-city-lite':'';
    const asnSource=location?.asnSource==='DB-IP ASN Lite'?'https://db-ip.com/db/download/ip-to-asn-lite':'';
    const approximate=location?.status==='available'?[location.city,location.region,location.country].filter(Boolean).join(', '):null;
    emit('Approximate IP location',approximate||(location?.status==='local'?'Local/private address — no public location':'Unavailable'),{kind:approximate?'estimate':'unavailable',note:stale+'Optional offline database estimate for this address, not GPS. It can locate a proxy/VPN exit or shared network and can be wrong.',source});
    emit('IP location source',location?.source||'No location source returned',{kind:location?.source?'observed':'unavailable',note:stale+'Missing sources are not silently attributed to another dataset.',source});
    emit('IP location dataset date',location?.databaseDate||'Unavailable for this check',{kind:location?.databaseDate?'observed':'unavailable',note:stale+'Date of the optional offline location dataset. Missing metadata clears old attribution.',source});
    emit('IP network ASN',location?.asn?`AS${location.asn}`:'Unavailable for this address',{kind:location?.asn?'estimate':'unavailable',note:stale+'Optional network attribution, not proof of a person’s provider or identity.',source:asnSource});
    emit('IP network organization',location?.organization||'Unavailable for this address',{kind:location?.organization?'estimate':'unavailable',note:stale+'Missing network data clears earlier organization values.',source:asnSource});
    emit('IP network dataset date',location?.asnDatabaseDate||'Unavailable for this check',{kind:location?.asnDatabaseDate?'observed':'unavailable',note:stale+'ASN data can have a different source/date from geographic data.',source:asnSource});
  }
  function verified(data) {
    const source=`${data.sourceId}|${data.addressSource}`,sourceSwitched=lastObservationSource!==null&&source!==lastObservationSource;
    if(sourceSwitched)baselines.clear();
    const baseline=baselines.get(data.family),changed=!sourceSwitched&&!!baseline&&baseline.address!==data.address;
    const previousAddress=changed?baseline.address:baseline?.previousAddress||null;
    const comparison=sourceSwitched?'Observation source changed: new baseline, no IP change counted.':!baseline?`First ${data.family} observation from this source; no change inferred.`:changed?`Changed since an earlier successful ${data.family} check from this source.`:`Matches the previous successful ${data.family} check from this source.`;
    baselines.set(data.family,{address:data.address,previousAddress});lastObservationSource=source;
    update({address:data.address,previousAddress,changes:state.changes+(changed?1:0),checkedAt:new Date(now()).toISOString(),status:'ready',detail:data.local?'This host sees a loopback connection, not a public internet IP.':'Connection address reported by this website. It can be shared or belong to an intermediary; it is not a real-IP or VPN verdict.',local:data.local,family:data.family,location:data.location,stale:false,errorCode:null,httpStatus:null,throttled:false,sourceId:data.sourceId,sourceLabel:data.sourceId==='same-origin-host'?'This website’s same-origin endpoint':`This website’s endpoint (source: ${data.sourceId})`,addressSource:data.addressSource,comparison});
    emit('Server connection family',data.family,{note:'Validated from the address. IPv4 and IPv6 are separate comparable observations.'});publishStatus();publishLocation();
    if(!metadataShown){metadataShown=true;
      for(const[name,value]of Object.entries(data.headers))emit(`Request header · ${name}`,value,{note:'Header snapshot from the first successful credential-free context check.',source:'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers'});
      emit('Cookie header presence',data.cookiePresent===null?'Not reported':data.cookiePresent?'Present on metadata request':'Absent on metadata request',{kind:data.cookiePresent===null?'unavailable':'observed',note:'This request omits credentials; other requests or sites may have different cookies.'});
      safe(addEvent,'Request metadata surfaced','This website returned its connection address and optional request metadata. No external IP-provider request was made.','context',{category:'network'});
    }
    if(sourceSwitched)safe(addEvent,'Connection observation source changed','A new source baseline was started. Differences between sources are not counted as IP changes.','context',{category:'network'});
    if(changed)safe(addEvent,'Server-visible connection IP changed',`${baseline.address} → ${data.address}. Two successful ${data.family} checks from the same source differed. This is not proof of identity, a real-IP leak, or VPN status.`,'observed',{category:'network'});
  }
  function cancelCurrent(){generation++;const current=operation;operation=null;if(current){clearTimeout(current.timeout);current.cancel(CANCELLED);current.controller.abort();}}
  function pause(detail,code){if(pollTimer!==null){clearInterval(pollTimer);pollTimer=null;}cancelCurrent();update({busy:false,status:'paused',detail,errorCode:code,httpStatus:null,stale:!!state.address,throttled:false});publishStatus();publishLocation();}
  async function perform(current){
    try{
      if(operation!==current||!running)return readState();
      const timeout=new Promise(resolve=>{current.timeout=setTimeout(()=>{current.timedOut=true;resolve(TIMED_OUT);current.controller.abort();},timeoutDuration);});
      const request=Promise.resolve().then(()=>fetch(endpoint,{method:'GET',mode:'same-origin',cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:current.controller.signal})).then(response=>readContext(response,current.controller.signal));
      const data=await Promise.race([request,timeout,current.cancellation]);
      if(operation!==current||generation!==current.generation||!running||data===CANCELLED)return readState();
      if(data===TIMED_OUT)throw new ConnectionError('timeout',`The endpoint did not respond within ${timeoutDuration/1000} seconds.`);
      if(eligible())verified(data);else pause('The page became hidden or offline before this check completed. Use Check connection when ready.',globalThis.navigator?.onLine===false?'offline':'hidden');
    }catch(error){
      if(operation===current&&generation===current.generation&&running){
        const code=current.timedOut?'timeout':error.code||'network-or-blocked';
        const message=current.timedOut?`The endpoint did not respond within ${timeoutDuration/1000} seconds.`:error instanceof ConnectionError?error.message:'The request failed or was blocked by the browser/network.';
        update({status:'error',errorCode:code,httpStatus:error.httpStatus||null,stale:!!state.address,detail:`${message} ${state.address?'The last successful value is retained and marked stale.':'No connection IP has been verified.'} No address change is inferred.`});publishStatus();publishLocation();
      }
    }finally{clearTimeout(current.timeout);if(operation===current){operation=null;if(running&&state.busy)update({busy:false});}}
    return readState();
  }
  function checkNow(){
    if(!running||disposed)return Promise.resolve(readState());
    if(!eligible()){pause(globalThis.navigator?.onLine===false?'The browser reports offline. Use Check connection after reconnecting.':'Checks pause while hidden. Use Check connection after returning.',globalThis.navigator?.onLine===false?'offline':'hidden');return Promise.resolve(readState());}
    if(operation)return operation.promise;
    const at=now();
    if(at-lastAttempt<minimum){update({throttled:true,nextCheckAt:new Date(lastAttempt+minimum).toISOString(),detail:`Please wait ${Math.ceil((minimum-(at-lastAttempt))/1000)} seconds between checks. No new request was sent.`});return Promise.resolve(readState());}
    lastAttempt=at;const current={generation:++generation,controller:new AbortController(),timeout:null,timedOut:false};
    current.cancellation=new Promise(resolve=>{current.cancel=resolve;});operation=current;current.promise=Promise.resolve().then(()=>perform(current));
    update({busy:true,status:'checking',detail:'Checking this website’s same-origin endpoint. No external IP provider or GPS request is used.',errorCode:null,httpStatus:null,throttled:false,lastAttemptAt:new Date(at).toISOString(),nextCheckAt:new Date(at+minimum).toISOString()});publishStatus();return current.promise;
  }
  function availabilityChanged(){
    if(!running||disposed)return;
    if(!eligible()){pause(globalThis.navigator?.onLine===false?'The browser reports offline. Last successful values are retained.':'The page is hidden; any pending check was cancelled.',globalThis.navigator?.onLine===false?'offline':'hidden');return;}
    if(polling){if(pollTimer===null)pollTimer=setInterval(checkNow,polling);return checkNow();}
    if(state.status==='paused'){update({busy:false,detail:'The page is available again. Use Check connection for a fresh observation; no automatic return check was sent.'});publishStatus();}
  }
  function listen(target,name,callback){if(!target?.addEventListener)return;target.addEventListener(name,callback);listeners.push(()=>target.removeEventListener(name,callback));}
  return{readState,checkNow,start(){
    if(disposed)return Promise.resolve(readState());if(running)return operation?.promise||Promise.resolve(readState());running=true;
    listen(globalThis.document,'visibilitychange',availabilityChanged);for(const name of['focus','online','offline'])listen(globalThis.window,name,availabilityChanged);
    if(polling&&eligible())pollTimer=setInterval(checkNow,polling);return checkNow();
  },stop(){if(disposed)return;running=false;disposed=true;cancelCurrent();if(pollTimer!==null){clearInterval(pollTimer);pollTimer=null;}for(const cleanup of listeners.splice(0))cleanup();update({busy:false,status:'stopped',detail:'Connection checks stopped. No further requests are scheduled.',throttled:false});}};
}
