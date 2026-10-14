const POLL_MS = 30000;
const TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 32768;
const HEADER_NAMES = new Set(['user-agent', 'accept', 'accept-language', 'sec-ch-ua', 'sec-ch-ua-platform', 'sec-ch-ua-mobile', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'dnt', 'sec-gpc', 'referer']);
const CANCELLED = Symbol('cancelled');
const TIMED_OUT = Symbol('timed out');
const SOURCE = 'https://www.w3.org/TR/fingerprinting-guidance/';

function boundedText(value, limit) {
  return typeof value === 'string' && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}
function parseAddress(raw) {
  const value = boundedText(raw, 64);
  if (!value) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    const parts = value.split('.').map(Number);
    if (parts.every(part => part <= 255)) return { address: parts.join('.'), family: 'IPv4' };
  }
  if (value.includes(':') && /^[\da-f:.]+$/i.test(value)) {
    try {
      const host = new URL(`http://[${value}]/`).hostname;
      if (host.startsWith('[') && host.endsWith(']')) return { address: host.slice(1, -1).toLowerCase(), family: 'IPv6' };
    } catch { /* Invalid IPv6 is not a verified connection address. */ }
  }
  return null;
}
function parseLocation(raw, local) {
  if (local) return { status: 'local', note: 'A local connection has no meaningful public IP location.' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['available', 'unavailable', 'local'].includes(raw.status)) return null;
  const location = { status: raw.status };
  for (const [name, limit] of [['city', 120], ['region', 160], ['country', 160], ['countryCode', 2], ['databaseDate', 32], ['organization', 200], ['note', 500]]) {
    const value = boundedText(raw[name], limit);
    if (value !== null && value !== '') location[name] = value;
  }
  if (location.countryCode && !/^[A-Z]{2}$/i.test(location.countryCode)) delete location.countryCode;
  if (location.countryCode) location.countryCode = location.countryCode.toUpperCase();
  if (['DB-IP City Lite', 'DB-IP Country Lite'].includes(raw.source)) location.source = raw.source;
  if (Number.isInteger(raw.asn) && raw.asn > 0 && raw.asn <= 4294967295) location.asn = raw.asn;
  else if (typeof raw.asn === 'string' && /^(?:AS)?\d{1,10}$/i.test(raw.asn) && Number(raw.asn.replace(/^AS/i, '')) <= 4294967295) location.asn = Number(raw.asn.replace(/^AS/i, ''));
  if (location.status === 'available' && !location.city && !location.region && !location.country) location.status = 'unavailable';
  return location;
}
function validateContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid response');
  const parsed = parseAddress(raw.address);
  if (!parsed || typeof raw.local !== 'boolean' || typeof raw.cookiePresent !== 'boolean' || !['IPv4', 'IPv6', 'Unknown'].includes(raw.family) || (raw.family !== 'Unknown' && raw.family !== parsed.family)) throw new Error('Invalid response');
  if (!raw.headers || typeof raw.headers !== 'object' || Array.isArray(raw.headers)) throw new Error('Invalid response');
  const entries = Object.entries(raw.headers);
  if (entries.length > 24) throw new Error('Invalid response');
  const headers = {};
  for (const [name, rawValue] of entries) {
    if (!HEADER_NAMES.has(name)) continue;
    const value = boundedText(rawValue, 2048);
    if (value === null) throw new Error('Invalid response');
    headers[name] = value;
  }
  return { ...parsed, local: raw.local, cookiePresent: raw.cookiePresent, headers, location: parseLocation(raw.location, raw.local) };
}
async function readContext(response, signal) {
  if (!response?.ok || response.redirected) throw new Error('Endpoint unavailable');
  const contentType = response.headers?.get?.('content-type');
  if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) throw new Error('Invalid response');
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('Response too large');
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    text = '';
    try {
      while (true) {
        const part = await reader.read();
        if (signal.aborted) throw new Error('Cancelled');
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error('Response too large');
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } catch (error) {
      try { await reader.cancel(); } catch { /* Fetch abort may already close it. */ }
      throw error;
    } finally { reader.releaseLock?.(); }
  } else {
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error('Response too large');
  }
  if (signal.aborted) throw new Error('Cancelled');
  return validateContext(JSON.parse(text));
}

/** Observes this host's connection address; it is not an identity or VPN test. */
export function createConnectionMonitor({ setSignal, addEvent, onUpdate = () => {} }) {
  const endpoint = new URL('./api/context.php', import.meta.url);
  const emissions = new Map();
  const listeners = [];
  let running = false;
  let disposed = false;
  let generation = 0;
  let pollTimer = null;
  let operation = null;
  let metadataShown = false;
  let state = { address: null, previousAddress: null, changes: 0, checkedAt: null, status: 'idle', detail: 'Start the session to check the connection address seen by this host.', local: null, family: null, busy: false, location: null };
  const readState = () => ({ ...state, location: state.location ? { ...state.location } : null });
  const eligible = () => !globalThis.document?.hidden && globalThis.navigator?.onLine !== false;
  const safeCall = (callback, ...args) => { try { callback?.(...args); } catch { /* A UI callback cannot break monitoring cleanup. */ } };
  const update = patch => { state = { ...state, ...patch }; safeCall(onUpdate, readState()); };
  function emit(key, value, options = {}) {
    const meta = { kind: 'observed', source: SOURCE, ...options };
    const previous = emissions.get(key);
    if (previous?.value === value && previous.kind === meta.kind && previous.note === meta.note && previous.source === meta.source) return;
    emissions.set(key, { value, ...meta });
    safeCall(setSignal, 'network', key, value, meta);
  }
  function publishStatus() {
    emit('Connection check status', state.status === 'ready' ? 'Verified response received' : state.status === 'checking' ? 'Checking this host…' : state.status === 'error' ? 'Latest check unavailable' : state.status === 'paused' ? 'Checks paused' : state.status === 'stopped' ? 'Monitoring stopped' : 'Not checked', { kind: state.status === 'error' ? 'unavailable' : 'observed', note: state.detail });
    emit('Verified connection IP changes', state.changes, { note: 'Counts only changes between valid successful responses from this same host in this session. Errors, offline periods, and hidden-page pauses are not address changes.' });
    if (!state.address) emit('Server-visible connection IP', 'Not observed yet', { kind: 'unavailable', note: 'No valid connection-address response has been received. No external IP-lookup service is contacted.' });
  }
  function publishLocation() {
    const location = state.location;
    const locationSource = location?.source === 'DB-IP Country Lite' ? 'https://db-ip.com/db/download/ip-to-country-lite' : 'https://db-ip.com/db/download/ip-to-city-lite';
    const approximate = location?.status === 'available' ? [location.city, location.region, location.country].filter(Boolean).join(', ') : null;
    emit('Approximate IP location', approximate || (location?.status === 'local' ? 'Local connection — no public location' : 'Unavailable'), { kind: approximate ? 'estimate' : 'unavailable', note: 'An approximate database estimate for the server-visible connection IP, not device GPS or a verified physical location. A VPN/proxy exit or shared connection may be located elsewhere. No external geolocation request is made.', source: locationSource });
    emit('IP location dataset date', location?.databaseDate || 'Unavailable for this check', { kind: location?.databaseDate ? 'observed' : 'unavailable', note: 'Date reported for the server’s local DB-IP Lite dataset; geographic mappings can be stale or inaccurate. Missing metadata does not retain a previous address’s dataset reading.', source: locationSource });
    emit('IP network ASN', location?.asn ? `AS${location.asn}` : 'Unavailable for this address', { kind: location?.asn ? 'estimate' : 'unavailable', note: 'Database network attribution for the connection address, not proof of your internet provider, employer, or identity.', source: locationSource });
    emit('IP network organization', location?.organization || 'Unavailable for this address', { kind: location?.organization ? 'estimate' : 'unavailable', note: 'Database organization attribution for the connection address. A hosting, proxy, or shared-network operator may be shown.', source: locationSource });
  }
  function verified(data) {
    const oldAddress = state.address;
    const changed = oldAddress !== null && oldAddress !== data.address;
    update({ address: data.address, previousAddress: changed ? oldAddress : state.previousAddress, changes: state.changes + (changed ? 1 : 0), checkedAt: new Date().toISOString(), status: 'ready', detail: data.local ? 'This host sees a local loopback connection, not your public internet IP.' : 'The connection address reaching this host. It may belong to a VPN, proxy, shared network, or intermediary; it does not establish identity or precise location.', local: data.local, family: data.family, location: data.location });
    emit('Server-visible connection IP', data.address, { note: state.detail });
    emit('Server connection family', data.family, { note: 'Address family reported by the same-origin host and validated against the returned address. This is not a complete network inventory.' });
    publishStatus(); publishLocation();
    if (!metadataShown) {
      metadataShown = true;
      for (const [name, value] of Object.entries(data.headers)) emit(`Request header · ${name}`, value, { note: 'Header received by this host on the first successful context check. Browser/HTTP policy determines what is sent; this is a snapshot.', source: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers' });
      emit('Cookie header presence', data.cookiePresent ? 'Present on metadata request' : 'Absent on metadata request', { note: 'Snapshot from the first successful context check, which omits credentials. It does not prove that the browser stores no cookies or that other requests contain none.', source: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies' });
      safeCall(addEvent, 'Request metadata surfaced', 'This host returned the connection address and limited request-header metadata. No external IP-lookup service was contacted.', 'context', { category: 'network' });
    }
    if (changed) safeCall(addEvent, 'Server-visible connection IP changed', `${oldAddress} → ${data.address}. Two valid responses from this host differed. This is a connection change, not proof of identity, a true-IP leak, or a VPN state.`, 'observed', { category: 'network' });
  }
  function cancelCurrent() {
    generation += 1;
    const current = operation;
    operation = null;
    if (current) {
      clearTimeout(current.timeout);
      current.cancel(CANCELLED);
      current.controller.abort();
    }
  }
  function pause(detail) {
    if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
    cancelCurrent();
    update({ busy: false, status: 'paused', detail }); publishStatus();
  }
  async function perform(current) {
    try {
      if (operation !== current || !running) return readState();
      const timeout = new Promise(resolve => { current.timeout = setTimeout(() => { current.timedOut = true; resolve(TIMED_OUT); current.controller.abort(); }, TIMEOUT_MS); });
      const request = Promise.resolve().then(() => fetch(endpoint, { method: 'GET', mode: 'same-origin', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: current.controller.signal })).then(response => readContext(response, current.controller.signal));
      const data = await Promise.race([request, timeout, current.cancellation]);
      if (operation !== current || generation !== current.generation || !running) return readState();
      if (data === CANCELLED) return readState();
      if (data === TIMED_OUT) throw new Error('Timed out');
      if (eligible()) verified(data);
      else update({ status: 'paused', detail: 'Checks pause while the page is hidden or the browser reports offline.' });
    } catch {
      if (operation === current && generation === current.generation && running) {
        update({ status: 'error', detail: current.timedOut ? 'This host did not finish the check within 10 seconds. The last verified address is retained; no change is inferred.' : 'The latest response could not be verified. The last verified address is retained; no change is inferred.' });
        publishStatus();
      }
    } finally {
      clearTimeout(current.timeout);
      if (operation === current) { operation = null; if (running && state.busy) update({ busy: false }); }
    }
    return readState();
  }
  function checkNow() {
    if (!running || disposed) return Promise.resolve(readState());
    if (!eligible()) { pause(document?.hidden ? 'Checks pause while this page is hidden. They resume when it becomes visible.' : 'The browser reports offline. Checks resume when a connection is reported.'); return Promise.resolve(readState()); }
    if (operation) return operation.promise;
    const current = { generation: ++generation, controller: new AbortController(), timeout: null, timedOut: false };
    current.cancellation = new Promise(resolve => { current.cancel = resolve; });
    operation = current;
    current.promise = Promise.resolve().then(() => perform(current));
    update({ busy: true, status: 'checking', detail: 'Checking only this host’s same-origin context endpoint. No outside lookup is performed.' }); publishStatus();
    return current.promise;
  }
  function resume() {
    if (!running || disposed) return;
    if (!eligible()) { pause(document?.hidden ? 'Checks pause while this page is hidden.' : 'The browser reports offline.'); return; }
    if (pollTimer === null) pollTimer = setInterval(checkNow, POLL_MS);
    return checkNow();
  }
  function listen(target, name, callback) {
    if (!target?.addEventListener) return;
    target.addEventListener(name, callback);
    listeners.push(() => target.removeEventListener(name, callback));
  }
  return {
    readState,
    checkNow,
    start() {
      if (disposed) return Promise.resolve(readState());
      if (running) return operation?.promise || Promise.resolve(readState());
      running = true;
      listen(globalThis.document, 'visibilitychange', resume);
      listen(globalThis.window, 'focus', resume);
      listen(globalThis.window, 'online', resume);
      listen(globalThis.window, 'offline', () => pause('The browser reports offline. The last verified address is retained.'));
      return resume() || Promise.resolve(readState());
    },
    stop() {
      if (disposed) return;
      running = false; disposed = true;
      cancelCurrent();
      if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
      for (const dispose of listeners.splice(0)) dispose();
      update({ busy: false, status: 'stopped', detail: 'Monitoring stopped. No further context checks are scheduled.' });
    },
  };
}
