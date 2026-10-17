import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { startSensors } from '../dist/sensors.js';

class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatch(type, data = {}) { for (const callback of this.listeners.get(type) || []) callback({ type, ...data }); }
}
class Clock {
  constructor() { this.now = 0; this.id = 0; this.jobs = new Map(); }
  set(callback, ms, repeat = false) { const id = ++this.id; this.jobs.set(id, { callback, ms, due: this.now + ms, repeat }); return id; }
  clear(id) { this.jobs.delete(id); }
  advance(ms) { const end = this.now + ms; while (true) { const entry = [...this.jobs].filter(([, job]) => job.due <= end).sort((a, b) => a[1].due - b[1].due)[0]; if (!entry) break; const [id, job] = entry; this.now = job.due; if (job.repeat) job.due += job.ms; else this.jobs.delete(id); job.callback(); } this.now = end; }
}
const keys = ['window', 'document', 'navigator', 'screen', 'history', 'innerWidth', 'innerHeight', 'scrollX', 'scrollY', 'devicePixelRatio', 'matchMedia', 'performance', 'crypto', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'MutationObserver', 'Document', 'Element', 'location'];
const original = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const assign = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function browser({ pointer = 'fine', anyPointer = 'fine', unsupportedMedia = false } = {}) {
  const clock = new Clock();
  const hardware = { gpu: 'GPU A', extensions: ['EXT_Z', 'EXT_A'], gl: true, canvas: true, blockPixels: false, fontWidth: 100, pixel: 1, glContexts: 0, released: 0 };
  const win = Object.assign(new Surface(), { innerWidth: 1200, innerHeight: 800, outerWidth: 1220, outerHeight: 880, devicePixelRatio: 1, isSecureContext: true, fetch() {} });
  win.visualViewport = Object.assign(new Surface(), { width: 1200, height: 800, scale: 1, offsetLeft: 0, offsetTop: 0 });
  const storage = () => { const map = new Map(); return { getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
  win.localStorage = storage(); win.sessionStorage = storage();
  const rootNode = { nodeType: 1, tagName: 'HTML', scrollHeight: 1000, closest: () => null };
  const doc = Object.assign(new Surface(), { hasFocus: () => true, hidden: false, visibilityState: 'visible', referrer: '', documentElement: rootNode, body: { nodeType: 1, tagName: 'BODY', closest: () => null }, baseURI: 'https://example.test/', querySelectorAll: () => [] });
  doc.createElement = () => ({ getContext(type) {
    if (type === '2d') {
      if (!hardware.canvas) return null;
      return { fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }), fillText() {}, beginPath() {}, arc() {}, fill() {}, measureText: () => ({ width: hardware.fontWidth }), getImageData() { if (hardware.blockPixels) throw new Error('Blocked pixels'); return { data: new Uint8Array(16).fill(hardware.pixel) }; } };
    }
    if (!hardware.gl) return null;
    hardware.glContexts += 1;
    const currentGpu = hardware.gpu;
    return { VENDOR: 1, RENDERER: 2, VERSION: 3, MAX_TEXTURE_SIZE: 4, getParameter: key => ({ 1: 'Vendor', 2: currentGpu, 3: 'WebGL 1', 4: 8192, 5: 'Driver vendor', 6: currentGpu })[key], getSupportedExtensions: () => [...hardware.extensions], getExtension(name) { if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 5, UNMASKED_RENDERER_WEBGL: 6 }; if (name === 'WEBGL_lose_context') return { loseContext() { hardware.released += 1; } }; return null; } };
  } });
  const nav = { userAgent: 'Test browser', platform: 'Test platform', language: 'en-GB', languages: ['en-GB', 'en'], cookieEnabled: true, hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, onLine: true, plugins: [], webdriver: false };
  const reportScreen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, orientation: Object.assign(new Surface(), { type: 'landscape-primary', angle: 0 }) };
  const media = new Map();
  const matching = new Set([`(pointer: ${pointer})`, `(any-pointer: ${anyPointer})`, '(hover: hover)']);
  const matchMedia = query => { if (!media.has(query)) media.set(query, Object.assign(new Surface(), { media: unsupportedMedia ? 'not all' : query, matches: !unsupportedMedia && matching.has(query) })); return media.get(query); };
  const values = { window: win, document: doc, navigator: nav, screen: reportScreen, history: { length: 1 }, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1, matchMedia, performance: { now: () => clock.now, getEntriesByType: () => [] }, crypto: webcrypto, setTimeout: (fn, ms) => clock.set(fn, ms), clearTimeout: id => clock.clear(id), setInterval: (fn, ms) => clock.set(fn, ms, true), clearInterval: id => clock.clear(id), MutationObserver: undefined, Document: class { createElement() {} }, Element: class { attachShadow() {} }, location: { href: 'https://example.test/', origin: 'https://example.test' } };
  for (const [key, value] of Object.entries(values)) assign(key, value);
  const signals = new Map(); const events = [];
  const callbacks = { setSignal: (group, key, value, options) => signals.set(`${group}:${key}`, { value, ...options }), addEvent: (title, detail, kind) => events.push({ title, detail, kind }) };
  return { clock, hardware, win, doc, nav, screen: reportScreen, media, signals, events, callbacks, start: () => startSensors(callbacks) };
}

try {
  for (const pointer of ['fine', 'coarse', 'none']) {
    const h = browser({ pointer, anyPointer: 'coarse' }); const sensors = h.start(); await sensors.fingerprint();
    assert.equal(h.signals.get('device:Primary pointer').value, pointer[0].toUpperCase() + pointer.slice(1));
    assert.equal(h.signals.get('device:Primary pointer').kind, 'observed');
    assert.equal(h.signals.get('device:Any fine pointer').value, 'No fine pointer matched'); assert.equal(h.signals.get('device:Any fine pointer').kind, 'observed');
    assert.equal(h.signals.get('device:Wide color gamut').value, 'P3 not matched'); assert.equal(h.signals.get('device:Wide color gamut').kind, 'observed');
    assert.equal(h.signals.get('activity:Text entered in this page').kind, 'context'); assert.equal(h.signals.get('boundaries:Actual screenshots').kind, 'context', 'Explanations must not count as measured readings');
    assert.ok(![...h.signals.keys()].some(key => /selected mode|chosen experience/i.test(key)), 'No user-selected device readings'); sensors.stop();
  }
  {
    const h = browser({ unsupportedMedia: true }); const sensors = h.start(); await sensors.fingerprint();
    assert.equal(h.signals.get('device:Primary pointer').kind, 'unavailable'); assert.equal(h.signals.get('device:Wide color gamut').kind, 'unavailable'); sensors.stop();
  }
  {
    const h = browser({ pointer: 'unreported', anyPointer: 'unreported' }); const sensors = h.start(); await sensors.fingerprint();
    assert.equal(h.signals.get('device:Primary pointer').kind, 'unavailable', 'All pointer values failing to match must not be labelled fine or none'); sensors.stop();
  }
  {
    const h = browser(); const sensors = h.start(); const first = await sensors.fingerprint();
    assert.equal(first.schemaVersion, 'observatory-fingerprint/2'); assert.equal(first.unique, false); assert.equal(first.stored, false);
    assert.equal(first.hashInputs.graphics.renderer, 'GPU A'); assert.deepEqual(first.hashInputs.graphics.extensions, ['EXT_A', 'EXT_Z']);
    const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(first.hashInputs)))).toString('hex').slice(0, 20);
    assert.equal(first.groupingHash, expected, 'Hash must correspond exactly to the returned versioned inputs');
    assert.ok(first.groupingFields.includes('screen.pixelRatio')); assert.ok(!JSON.stringify(first.hashInputs).includes('capturedAt')); assert.ok(!JSON.stringify(first.hashInputs).includes('innerWidth'));
    h.hardware.extensions.reverse(); const same = await sensors.fingerprint(); assert.equal(same.groupingHash, first.groupingHash, 'Extension ordering and timestamps must not change a hash');
    h.win.innerWidth = 800; h.win.innerHeight = 600; const resized = await sensors.fingerprint(); assert.equal(resized.groupingHash, first.groupingHash, 'Ordinary window dimensions are not hash inputs');
    h.hardware.gpu = 'GPU B'; const gpu = await sensors.fingerprint(); assert.notEqual(gpu.groupingHash, first.groupingHash); assert.equal(gpu.hashInputs.graphics.renderer, 'GPU B'); assert.match(h.signals.get('fingerprint:WebGL renderer').value, /GPU B/);
    h.hardware.fontWidth = 120; const font = await sensors.fingerprint(); assert.notEqual(font.groupingHash, gpu.groupingHash);
    h.nav.hardwareConcurrency = 4; const cpu = await sensors.fingerprint(); assert.notEqual(cpu.groupingHash, font.groupingHash);
    const clone = sensors.getSummary().fingerprint; clone.hashInputs.graphics.renderer = 'Changed outside'; assert.equal(sensors.getSummary().fingerprint.hashInputs.graphics.renderer, 'GPU B');
    h.hardware.gl = false; h.hardware.blockPixels = true; const blocked = await sensors.fingerprint();
    assert.equal(blocked.hashInputs.graphics.status, 'unavailable'); assert.equal(blocked.hashInputs.graphics.renderer, null); assert.equal(blocked.hashInputs.graphics.extensions, null); assert.equal(blocked.canvasHash, null); assert.equal(blocked.hashInputs.fonts.status, 'available', 'Font measurements do not require pixel readback');
    for (const key of ['WebGL renderer', 'WebGL version', 'Graphics extensions', 'Maximum texture size', 'Exposed GPU hint', 'Canvas render hash']) assert.equal(h.signals.get(`fingerprint:${key}`).kind, 'unavailable', `${key} must not retain old data`);
    h.hardware.canvas = false; const noCanvas = await sensors.fingerprint(); assert.equal(noCanvas.hashInputs.fonts.widths, null); assert.equal(h.signals.get('fingerprint:Fixed font width samples').kind, 'unavailable');
    assign('crypto', {}); const noHash = await sensors.fingerprint(); assert.equal(noHash.status, 'unavailable'); assert.equal(noHash.groupingHash, null); assert.equal(h.signals.get('fingerprint:Browser grouping hash').kind, 'unavailable');
    assign('crypto', { subtle: { digest: async () => new ArrayBuffer(0) } }); const invalidHash = await sensors.fingerprint(); assert.equal(invalidHash.status, 'unavailable'); assert.equal(invalidHash.groupingHash, null, 'Malformed hashing output must not become a successful empty signature');
    assert.equal(h.hardware.glContexts, h.hardware.released, 'Every created graphics context must be released'); sensors.stop(); assert.equal(h.clock.jobs.size, 0);
  }
  {
    const h = browser(); const pending = deferred(); let calls = 0;
    assign('crypto', { subtle: { digest(...args) { calls += 1; return calls === 1 ? pending.promise : webcrypto.subtle.digest(...args); } } });
    const sensors = h.start(); const calculation = sensors.fingerprint(); h.nav.hardwareConcurrency = 2; h.hardware.gpu = 'GPU later'; h.hardware.fontWidth = 200; h.screen.width = 800;
    pending.resolve(new ArrayBuffer(32)); const result = await calculation;
    assert.equal(result.hashInputs.browser.logicalProcessors, 8); assert.equal(result.hashInputs.graphics.renderer, 'GPU A'); assert.equal(result.hashInputs.fonts.widths[0].width, 100); assert.equal(result.hashInputs.screen.width, 1920, 'Hash inputs must be one pre-await snapshot'); sensors.stop();
  }
  {
    const h = browser(); const pending = deferred(); assign('crypto', { subtle: { digest: () => pending.promise } });
    const sensors = h.start(); const calculation = sensors.fingerprint(); sensors.stop(); const signalCount = h.signals.size; const eventCount = h.events.length;
    pending.resolve(new ArrayBuffer(32)); assert.equal(await calculation, null); assert.equal(sensors.getSummary().fingerprint, null); assert.equal(h.signals.size, signalCount); assert.equal(h.events.length, eventCount); assert.equal(h.clock.jobs.size, 0, 'Disposed sessions cannot publish late results');
  }
  {
    const h = browser(); const pending = deferred(); let calls = 0;
    assign('crypto', { subtle: { digest() { calls += 1; return calls === 1 ? Promise.resolve(new ArrayBuffer(32)) : pending.promise; } } });
    const sensors = h.start(); const calculation = sensors.fingerprint(); for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(calls, 2, 'Grouping digest must be pending for this disposal case'); sensors.stop(); const signalCount = h.signals.size; const eventCount = h.events.length;
    pending.resolve(new ArrayBuffer(32)); assert.equal(await calculation, null); assert.equal(h.signals.size, signalCount); assert.equal(h.events.length, eventCount, 'Disposal during the final digest must also prevent publication');
  }
  {
    const h = browser(); const sensors = h.start(); await sensors.fingerprint(); h.events.length = 0;
    h.win.dispatch('resize'); h.win.visualViewport.dispatch('resize'); h.clock.advance(180); assert.equal(h.events.length, 0, 'Duplicate unchanged resize notifications must not become events');
    h.win.visualViewport.height = 500; h.win.visualViewport.dispatch('resize'); h.win.dispatch('resize'); h.clock.advance(180);
    assert.equal(h.events.length, 1); assert.match(h.events[0].detail, /Visual viewport: 1200 × 500/); assert.ok(!h.events[0].detail.includes('Layout viewport:'), 'Visual-only changes must not report unchanged layout dimensions');
    h.win.visualViewport.dispatch('resize'); h.clock.advance(180); assert.equal(h.events.length, 1);
    h.win.innerWidth = 900; h.win.dispatch('resize'); h.clock.advance(180); assert.equal(h.events.length, 2); assert.match(h.events[1].detail, /Layout viewport: 900 × 800/); sensors.stop();
  }
  {
    const h = browser(); const initialOrigin = 'a'.repeat(32); const otherOrigin = 'b'.repeat(32);
    const script = (origin, path) => ({ nodeType: 1, tagName: 'SCRIPT', getAttribute: name => { assert.equal(name, 'src'); return `chrome-extension://${origin}/${path}.js`; }, querySelectorAll: () => [], closest: () => null, get textContent() { throw new Error('No script text reading'); } });
    const initial = [script(initialOrigin, 'one'), script(initialOrigin, 'two'), script(initialOrigin, 'three')]; h.doc.querySelectorAll = () => initial;
    const entries = initial.map(node => ({ name: node.getAttribute('src'), startTime: 0, duration: 1, initiatorType: 'script' })); globalThis.performance.getEntriesByType = () => entries;
    let observer;
    assign('MutationObserver', class { constructor(callback) { this.callback = callback; observer = this; } observe() {} takeRecords() { return []; } disconnect() { this.disconnected = true; } });
    const { startIntegrity } = await import(`../dist/integrity.js?accuracy=${Date.now()}`);
    const integrity = startIntegrity(h.callbacks); let summary = integrity.checkNow();
    assert.equal(summary.initialExtensionScripts, 3); assert.equal(summary.resourceReferenceObservations, 3); assert.equal(summary.distinctExtensionOrigins, 1, 'Three references from one origin are not three extensions');
    entries.push({ ...entries[0] }); assert.equal(integrity.checkNow().resourceReferenceObservations, 4, 'Separate equal-timing entries must remain separate references'); assert.equal(integrity.checkNow().resourceReferenceObservations, 4, 'Repeated scans must not recount those entries');
    const added = script(otherOrigin, 'four'); observer.callback([{ type: 'childList', target: h.doc.body, addedNodes: [added] }]); summary = integrity.checkNow();
    assert.equal(summary.scriptReferenceObservations, 4); assert.equal(summary.distinctExtensionOrigins, 2);
    const before = JSON.stringify(summary.counts); observer.callback([{ type: 'childList', target: h.doc.body, addedNodes: [{ nodeType: 1, tagName: 'DIV', querySelectorAll: () => [] }] }, { type: 'attributes', target: h.doc.body, attributeName: 'class' }]); assert.equal(JSON.stringify(integrity.checkNow().counts), before, 'Ordinary UI mutations must not feed back');
    h.win.fetch = () => {}; integrity.checkNow(); assert.ok(h.events.some(event => event.title === 'Page API reference changed' && /Cause unknown/.test(event.detail)));
    const exposed = JSON.stringify({ signals: [...h.signals], events: h.events, summary: integrity.checkNow() }); assert.ok(!exposed.includes(initialOrigin)); assert.ok(!exposed.includes(otherOrigin)); assert.ok(!exposed.includes('/three.js'));
    integrity.stop(); assert.equal(observer.disconnected, true); assert.equal(h.clock.jobs.size, 0);
  }
  console.log(JSON.stringify({ status: 'pass', checks: ['no selected-device readings', 'fine/coarse/none versus unsupported media', 'negative matches are not unavailability', 'fresh deterministic versioned hash inputs', 'fresh GPU/fonts/browser on recalculation', 'window size excluded from hash', 'blocked APIs clear prior readings', 'one pre-await input snapshot', 'disposed hash guards', 'resize deduplication and visual-only details', 'extension references versus distinct origins', 'no extension IDs or paths in output', 'API-change cause unknown', 'resource/timer cleanup'] }));
} finally {
  for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
