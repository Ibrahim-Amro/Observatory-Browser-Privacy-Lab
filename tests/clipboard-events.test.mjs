import assert from 'node:assert/strict';
import { startSensors } from '../dist/sensors.js';

class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add({ fn, options });
  }
  removeEventListener(type, fn) {
    for (const entry of this.listeners.get(type) || []) if (entry.fn === fn) this.listeners.get(type).delete(entry);
  }
  dispatch(type, fields = {}) {
    for (const entry of this.listeners.get(type) || []) entry.fn({ type, ...fields });
  }
}
const win = new Surface();
Object.assign(win, { innerWidth: 1200, innerHeight: 800, outerWidth: 1220, outerHeight: 880, devicePixelRatio: 1, isSecureContext: true });
const storage = () => {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
win.localStorage = storage(); win.sessionStorage = storage();
const doc = new Surface();
Object.assign(doc, { hasFocus: () => true, hidden: false, visibilityState: 'visible', referrer: '', documentElement: { scrollHeight: 1000 }, createElement: () => ({ getContext: () => null }) });
const forbidden = () => { throw new Error('Permission/clipboard payload access is forbidden in baseline'); };
const nav = { userAgent: 'Test', platform: 'Test', language: 'en-GB', languages: ['en-GB'], cookieEnabled: true, hardwareConcurrency: 8, maxTouchPoints: 0, onLine: true, plugins: [] };
Object.defineProperty(nav, 'clipboard', { get: forbidden });
Object.defineProperty(nav, 'permissions', { get: forbidden });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
Object.assign(globalThis, { window: win, document: doc, screen: { width: 1200, height: 800, availWidth: 1200, availHeight: 800, colorDepth: 24 }, history: { length: 1 }, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1, matchMedia: () => Object.assign(new Surface(), { matches: false }) });
const signals = new Map();
const events = [];
const sensors = startSensors({ setSignal: (g, k, value, meta) => signals.set(`${g}:${k}`, { value, ...meta }), addEvent: (title, detail, kind) => events.push({ title, detail, kind }) });
events.length = 0;
for (const type of ['copy', 'cut', 'paste']) {
  assert.equal([...doc.listeners.get(type)][0].options, true, `${type} must use a document capture listener`);
}

// A received shortcut is intent only; it must not manufacture a copy action.
doc.dispatch('keydown', { key: 'c', ctrlKey: true, isTrusted: true });
assert.equal(sensors.getSummary().counts.copies, 0);
assert.ok(events.some(event => event.title === 'Keyboard category' && event.detail.startsWith('Copy shortcut.')));
assert.ok(!events.some(event => event.title === 'Page copy event'));
events.length = 0;

let typeReads = 0;
function clipboardData(types) {
  return {
    get types() { typeReads += 1; return types; },
    getData: forbidden,
    get files() { return forbidden(); },
    get items() { return forbidden(); },
  };
}
const dispatchAction = (type, trusted, formats) => doc.dispatch(type, {
  isTrusted: trusted,
  clipboardData: clipboardData(formats),
  preventDefault() { throw new Error('Observation must not override the clipboard action'); },
});
for (const type of ['copy', 'cut', 'paste']) dispatchAction(type, true, type === 'paste' ? ['text/plain', 'image/png'] : []);
assert.deepEqual(events.map(event => event.title), ['Page copy event', 'Page cut event', 'Page paste event']);
assert.ok(events.every(event => event.detail.includes('Browser-dispatched · trusted flag true')));
assert.ok(events.every(event => event.detail.includes('Contents were not read.')));
assert.deepEqual([sensors.getSummary().counts.copies, sensors.getSummary().counts.cuts, sensors.getSummary().counts.pastes], [1, 1, 1]);
const trustedTitles = events.map(event => event.title);
events.length = 0;
for (const type of ['copy', 'cut', 'paste']) dispatchAction(type, false, ['text/plain']);
assert.deepEqual(events.map(event => event.title), ['Synthetic page copy event', 'Synthetic page cut event', 'Synthetic page paste event']);
assert.ok(events.every(event => event.detail.includes('Synthetic · trusted flag false')));
assert.deepEqual([sensors.getSummary().counts.copies, sensors.getSummary().counts.cuts, sensors.getSummary().counts.pastes], [2, 2, 2]);
assert.equal(typeReads, 6);
doc.dispatch('copy', { isTrusted: true, clipboardData: null });
assert.equal(events.at(-1).title, 'Page copy event');
assert.ok(events.at(-1).detail.includes('No format labels exposed.'));
assert.equal(sensors.getSummary().counts.copies, 3);
const syntheticTitles = events.slice(0, 3).map(event => event.title);
sensors.stop();
const eventCount = events.length;
dispatchAction('paste', true, ['text/plain']);
assert.equal(events.length, eventCount, 'Stop must remove clipboard listeners');
console.log(JSON.stringify({ status: 'pass', trustedTitles, syntheticTitles, checks: ['document capture listeners', 'shortcut is not a fabricated clipboard action', 'copy/cut/paste trusted and synthetic classification', 'empty/null clipboard metadata', 'MIME labels only and no permission access', 'default clipboard action preserved', 'listener cleanup'] }));
