import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';

class DocumentSurface {
  constructor(visibilityState = 'visible') { this.visibilityState = visibilityState; this.prerendering = false; this.listeners = new Map(); }
  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Map());
    // Browser EventTargets deduplicate the same callback/type/capture tuple.
    if (!this.listeners.get(type).has(callback)) this.listeners.get(type).set(callback, options);
  }
  dispatch(type) {
    for (const [callback, options] of [...(this.listeners.get(type) || [])]) {
      if (options.once) this.listeners.get(type).delete(callback);
      callback({ type });
    }
  }
  listenerCount(type) { return this.listeners.get(type)?.size || 0; }
}
const saved = Object.fromEntries(['document', 'navigator', 'fetch', 'setTimeout', 'clearTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let caseNumber = 0;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function fixture({ visibilityState = 'visible', privacy = {}, reject = false } = {}) {
  const document = new DocumentSurface(visibilityState);
  const navigator = { globalPrivacyControl: false, doNotTrack: null, ...privacy };
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  Object.defineProperties(globalThis, {
    document: { configurable: true, writable: true, value: document },
    navigator: { configurable: true, value: navigator },
    fetch: { configurable: true, writable: true, value: (url, options) => {
      calls.push({ url: String(url), options });
      return reject ? Promise.reject(new Error('Simulated rejection')) : Promise.resolve({ ok: true });
    } },
    setTimeout: { configurable: true, writable: true, value: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; } },
    clearTimeout: { configurable: true, writable: true, value: id => timers.delete(id) },
  });
  // Each query creates a fresh module-level recorded flag, like a new document.
  const moduleUrl = new URL('../dist/visits.js', import.meta.url);
  moduleUrl.searchParams.set('case', String(++caseNumber));
  const { recordPageEntry } = await import(moduleUrl.href);
  return { recordPageEntry, document, navigator, calls, timers };
}

try {
  {
    const h = await fixture();
    h.recordPageEntry(); h.recordPageEntry(); h.recordPageEntry();
    assert.equal(h.calls.length, 1, 'Repeated calls in a visible document must POST once');
    const call = h.calls[0];
    assert.ok(new URL(call.url).pathname.endsWith('/api/visit.php'));
    assert.equal(call.options.method, 'POST'); assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.referrerPolicy, 'no-referrer', 'Counter requests must omit the referrer header');
    assert.deepEqual(JSON.parse(call.options.body), { event: 'page_open' }, 'Counter body must be the fixed event only, without evidence, cookies, or identifiers');
    assert.deepEqual(call.options.headers, { 'Content-Type': 'application/json' });
    assert.equal(call.options.signal.aborted, false);
    await flush(); assert.equal(h.timers.size, 0, 'Settled requests must clear the abort timeout');
  }
  {
    const h = await fixture({ visibilityState: 'hidden' });
    h.recordPageEntry(); h.recordPageEntry(); assert.equal(h.calls.length, 0); assert.equal(h.document.listenerCount('visibilitychange'), 1);
    h.document.dispatch('visibilitychange'); assert.equal(h.calls.length, 0, 'Another hidden event must continue deferring');
    h.document.visibilityState = 'visible'; h.document.dispatch('visibilitychange'); h.recordPageEntry(); h.document.dispatch('visibilitychange');
    assert.equal(h.calls.length, 1, 'Becoming visible should produce exactly one POST'); assert.equal(h.document.listenerCount('visibilitychange'), 0);
    await flush(); assert.equal(h.timers.size, 0);
  }
  for (const privacy of [{ globalPrivacyControl: true }, { doNotTrack: '1' }]) {
    const h = await fixture({ privacy });
    h.recordPageEntry(); h.recordPageEntry(); assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
    h.navigator.globalPrivacyControl = false; h.navigator.doNotTrack = null; h.recordPageEntry();
    assert.equal(h.calls.length, 0, 'An opted-out page entry must not be submitted by later repeated calls');
  }
  {
    const h = await fixture({ reject: true });
    const unhandled = [];
    const onUnhandled = error => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
      assert.doesNotThrow(() => h.recordPageEntry());
      await flush(); await nextTurn();
      assert.deepEqual(unhandled, [], 'Rejected counter requests must be caught silently');
      assert.equal(h.timers.size, 0); h.recordPageEntry(); assert.equal(h.calls.length, 1, 'A rejected request must not create retries on repeated invocation');
    } finally { process.off('unhandledRejection', onUnhandled); }
  }
  console.log(JSON.stringify({ status: 'pass', checks: ['one POST per visible document', 'fixed counter body and omitted credentials', 'hidden document deferred until visible', 'GPC and DNT opt-out', 'rejected request silent with no retry', 'abort timeout cleanup'] }));
} finally {
  for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
