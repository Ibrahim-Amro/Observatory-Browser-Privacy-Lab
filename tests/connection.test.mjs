import assert from 'node:assert/strict';
import { createConnectionMonitor } from '../dist/connection.js';

class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatch(type) { for (const callback of this.listeners.get(type) || []) callback({ type }); }
  listenerCount() { return [...this.listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0); }
}
class Clock {
  constructor() { this.now = 0; this.next = 1; this.jobs = new Map(); }
  add(callback, delay, repeat = false) { const id = this.next++; this.jobs.set(id, { callback, due: this.now + delay, delay, repeat }); return id; }
  clear(id) { this.jobs.delete(id); }
  advance(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.jobs.entries()].filter(([, job]) => job.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, job] = next; this.now = job.due;
      if (job.repeat) job.due += job.delay; else this.jobs.delete(id);
      job.callback();
    }
    this.now = end;
  }
}
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const context = (address = '203.0.113.10', extra = {}) => ({ address, family: address.includes(':') ? 'IPv6' : 'IPv4', local: false, cookiePresent: false, headers: { 'user-agent': 'Browser snapshot' }, ...extra });
const response = raw => ({ ok: true, redirected: false, headers: { get: name => name === 'content-type' ? 'application/json; charset=utf-8' : null }, text: async () => JSON.stringify(raw) });
const original = Object.fromEntries(['window', 'document', 'navigator', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function harness() {
  const clock = new Clock();
  const win = new Surface();
  const doc = Object.assign(new Surface(), { hidden: false });
  const nav = { onLine: true };
  const queue = [];
  const calls = [];
  const updates = [];
  const events = [];
  const signals = new Map();
  const emitCounts = new Map();
  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: win },
    document: { configurable: true, writable: true, value: doc },
    navigator: { configurable: true, value: nav },
    fetch: { configurable: true, writable: true, value: (url, options) => {
      calls.push({ url: String(url), options });
      const next = queue.shift();
      if (!next) return Promise.reject(new Error('Unscheduled test fetch'));
      return typeof next === 'function' ? next(options) : Promise.resolve(next);
    } },
    setTimeout: { configurable: true, writable: true, value: (callback, ms) => clock.add(callback, ms) },
    clearTimeout: { configurable: true, writable: true, value: id => clock.clear(id) },
    setInterval: { configurable: true, writable: true, value: (callback, ms) => clock.add(callback, ms, true) },
    clearInterval: { configurable: true, writable: true, value: id => clock.clear(id) },
  });
  const monitor = createConnectionMonitor({
    setSignal: (group, key, value, meta) => { assert.equal(group, 'network'); signals.set(key, { value, ...meta }); emitCounts.set(key, (emitCounts.get(key) || 0) + 1); },
    addEvent: (title, detail, kind, meta) => events.push({ title, detail, kind, meta }),
    onUpdate: state => updates.push(state),
  });
  return { monitor, clock, win, doc, nav, queue, calls, updates, events, signals, emitCounts };
}

try {
  {
    const h = harness();
    h.queue.push(response(context()));
    const initial = await h.monitor.start();
    assert.equal(initial.address, '203.0.113.10'); assert.equal(initial.status, 'ready'); assert.equal(initial.busy, false); assert.equal(initial.changes, 0); assert.ok(initial.checkedAt);
    assert.equal(h.calls.length, 1);
    assert.ok(h.calls.every(call => new URL(call.url).pathname.endsWith('/api/context.php')));
    assert.equal(h.calls[0].options.mode, 'same-origin'); assert.equal(h.calls[0].options.credentials, 'omit'); assert.equal(h.calls[0].options.redirect, 'error'); assert.equal(h.calls[0].options.cache, 'no-store');
    assert.equal(h.events.filter(event => event.title === 'Request metadata surfaced').length, 1);
    h.queue.push(response(context('203.0.113.10', { headers: { 'user-agent': 'Later header' }, cookiePresent: true })));
    await h.monitor.checkNow();
    assert.equal(h.monitor.readState().changes, 0); assert.equal(h.signals.get('Request header · user-agent').value, 'Browser snapshot'); assert.equal(h.emitCounts.get('Cookie header presence'), 1);
    const lastSuccessfulCheck = h.monitor.readState().checkedAt;
    h.queue.push(() => Promise.reject(new Error('Temporary network error')));
    await h.monitor.checkNow();
    assert.equal(h.monitor.readState().status, 'error'); assert.equal(h.monitor.readState().address, '203.0.113.10'); assert.equal(h.monitor.readState().changes, 0); assert.equal(h.monitor.readState().checkedAt, lastSuccessfulCheck);
    h.queue.push(response(context('198.51.100.21')));
    await h.monitor.checkNow();
    assert.equal(h.monitor.readState().previousAddress, '203.0.113.10'); assert.equal(h.monitor.readState().changes, 1);
    const changes = h.events.filter(event => event.title === 'Server-visible connection IP changed');
    assert.equal(changes.length, 1); assert.equal(changes[0].meta.category, 'network'); assert.match(changes[0].detail, /not proof of identity/);
    h.monitor.stop(); assert.equal(h.clock.jobs.size, 0); assert.equal(h.win.listenerCount() + h.doc.listenerCount(), 0);
  }
  {
    const h = harness(); const pending = deferred(); h.queue.push(() => pending.promise);
    const start = h.monitor.start(); const manual = h.monitor.checkNow(); assert.equal(start, manual, 'Concurrent manual checks must share one promise');
    await flush(); assert.equal(h.calls.length, 1);
    pending.resolve(response(context())); await start;
    h.queue.push(response(context())); h.clock.advance(30000); await flush(); assert.equal(h.calls.length, 2, 'Visible page should poll after 30 seconds');
    h.doc.hidden = true; h.doc.dispatch('visibilitychange'); assert.equal(h.monitor.readState().status, 'paused');
    const before = h.calls.length; h.clock.advance(90000); await h.monitor.checkNow(); assert.equal(h.calls.length, before, 'Hidden pages must not poll or manually fetch');
    h.queue.push(response(context())); h.doc.hidden = false; h.doc.dispatch('visibilitychange'); await flush(); assert.equal(h.calls.length, before + 1);
    h.nav.onLine = false; h.win.dispatch('offline'); h.clock.advance(60000); await flush(); assert.equal(h.monitor.readState().status, 'paused'); assert.equal(h.calls.length, before + 1);
    h.queue.push(response(context())); h.nav.onLine = true; h.win.dispatch('online'); await flush(); assert.equal(h.calls.length, before + 2);
    h.queue.push(response(context())); h.win.dispatch('focus'); await flush(); assert.equal(h.calls.length, before + 3);
    h.monitor.stop();
  }
  {
    const h = harness(); const old = deferred(); h.queue.push(() => old.promise);
    const oldCheck = h.monitor.start(); await flush();
    h.doc.hidden = true; h.doc.dispatch('visibilitychange'); await oldCheck; assert.equal(h.calls[0].options.signal.aborted, true); assert.equal(h.monitor.readState().busy, false);
    h.queue.push(response(context('198.51.100.8'))); h.doc.hidden = false; h.doc.dispatch('visibilitychange'); await flush();
    old.resolve(response(context('203.0.113.99'))); await flush(); assert.equal(h.monitor.readState().address, '198.51.100.8'); assert.equal(h.monitor.readState().changes, 0, 'Cancelled late responses must not create changes');
    const late = deferred(); h.queue.push(() => late.promise); const lateCheck = h.monitor.checkNow(); await flush();
    h.monitor.stop(); const updateCount = h.updates.length; await lateCheck;
    late.resolve(response(context('192.0.2.99'))); await flush(); h.clock.advance(90000); await flush();
    assert.equal(h.updates.length, updateCount); assert.equal(h.monitor.readState().status, 'stopped'); assert.equal(h.monitor.readState().address, '198.51.100.8');
    await h.monitor.start(); assert.equal(h.calls.length, 3, 'Stopped instances must not restart accidentally');
  }
  {
    const h = harness(); h.queue.push(response(context())); await h.monitor.start();
    const pending = deferred(); h.queue.push(() => pending.promise); const check = h.monitor.checkNow(); await flush(); h.clock.advance(10000); await check;
    assert.equal(h.monitor.readState().status, 'error'); assert.equal(h.monitor.readState().busy, false); assert.match(h.monitor.readState().detail, /10 seconds/); assert.equal(h.calls.at(-1).options.signal.aborted, true);
    pending.resolve(response(context('192.0.2.100'))); await flush(); assert.equal(h.monitor.readState().changes, 0); assert.equal(h.monitor.readState().address, '203.0.113.10');
    h.queue.push(response(context('203.0.113.10'))); await h.monitor.checkNow(); assert.equal(h.monitor.readState().status, 'ready'); assert.equal(h.monitor.readState().changes, 0);
    h.monitor.stop();
  }
  {
    const h = harness(); h.queue.push(response(context('2001:0DB8:0:0:0:0:0:1'))); await h.monitor.start(); assert.equal(h.monitor.readState().address, '2001:db8::1');
    h.queue.push(response(context('2001:db8::1'))); await h.monitor.checkNow(); assert.equal(h.monitor.readState().changes, 0, 'Equivalent IPv6 representations are not address changes');
    const badBodies = [context('not-an-ip'), context('999.2.3.4'), context('2001:::bad'), context('192.0.2.2', { family: 'IPv6' }), context('192.0.2.2', { local: 'false' }), context('192.0.2.2', { headers: { 'user-agent': 'x'.repeat(2049) } })];
    for (const body of badBodies) { h.queue.push(response(body)); await h.monitor.checkNow(); assert.equal(h.monitor.readState().status, 'error'); assert.equal(h.monitor.readState().address, '2001:db8::1'); assert.equal(h.monitor.readState().changes, 0); }
    h.queue.push({ ...response({}), text: async () => 'x'.repeat(32769) }); await h.monitor.checkNow(); assert.equal(h.monitor.readState().status, 'error');
    let cancelled = false;
    h.queue.push({ ...response({}), body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(32769) }), cancel: async () => { cancelled = true; }, releaseLock() {} }) } });
    await h.monitor.checkNow(); assert.equal(cancelled, true, 'Oversized response streams must be cancelled'); assert.equal(h.monitor.readState().changes, 0);
    h.monitor.stop();
  }
  {
    const h = harness();
    h.queue.push(response(context('198.51.100.4', { location: { status: 'available', city: 'Example City', region: 'Example Region', country: 'Example Country', countryCode: 'gb', databaseDate: '2026-10', source: 'DB-IP City Lite', asn: 'AS64500', organization: 'Example network', note: 'An approximate database estimate.' } })));
    await h.monitor.start(); assert.equal(h.monitor.readState().location.source, 'DB-IP City Lite'); assert.equal(h.monitor.readState().location.countryCode, 'GB'); assert.equal(h.monitor.readState().location.asn, 64500);
    assert.equal(h.signals.get('Approximate IP location').kind, 'estimate'); assert.equal(h.signals.get('IP location dataset date').value, '2026-10'); assert.equal(h.signals.get('IP network ASN').value, 'AS64500');
    const copy = h.monitor.readState(); copy.location.city = 'Mutated'; assert.equal(h.monitor.readState().location.city, 'Example City');
    h.queue.push(response(context('198.51.100.5', { location: { status: 'available', city: 'x'.repeat(121), asn: 'bad', organization: 'x'.repeat(201) } })));
    await h.monitor.checkNow(); assert.equal(h.monitor.readState().status, 'ready'); assert.equal(h.monitor.readState().location.status, 'unavailable'); assert.equal(h.signals.get('IP network ASN').kind, 'unavailable'); assert.equal(h.signals.get('IP network organization').kind, 'unavailable');
    h.queue.push(response(context('192.0.2.4', { location: { status: 'available', country: 'Example Country', countryCode: 'gb', databaseDate: '2026-10', source: 'DB-IP Country Lite', note: 'Country-only local dataset.' } })));
    await h.monitor.checkNow(); assert.equal(h.monitor.readState().location.source, 'DB-IP Country Lite'); assert.equal(h.monitor.readState().location.city, undefined); assert.equal(h.signals.get('Approximate IP location').value, 'Example Country'); assert.equal(h.signals.get('Approximate IP location').kind, 'estimate'); assert.match(h.signals.get('Approximate IP location').source, /ip-to-country-lite$/); assert.match(h.signals.get('IP location dataset date').note, /DB-IP Lite/);
    h.queue.push(response(context('127.0.0.1', { local: true }))); await h.monitor.checkNow(); assert.equal(h.monitor.readState().location.status, 'local'); assert.equal(h.signals.get('Approximate IP location').kind, 'unavailable');
    assert.equal(h.calls.length, 4, 'Location metadata must not cause additional fetches'); h.monitor.stop();
  }
  console.log(JSON.stringify({ status: 'pass', checks: ['same-origin credential-free context only', 'initial + 30-second visible polling', 'single-flight refresh', 'hidden/offline pause and focus/online resume', 'abort + late-response generation guard', 'bounded timeout', 'validated and normalized IP changes only', 'headers captured once', 'bounded optional local-database location', 'no stale attribution after missing location metadata', 'listener/timer cleanup'] }));
} finally {
  for (const [key, descriptor] of Object.entries(original)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
