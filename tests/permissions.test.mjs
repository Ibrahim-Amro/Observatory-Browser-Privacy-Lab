import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createPermissionLab } from '../dist/permissions.js';
import { mountPermissionRows } from '../dist/permission-rows.js';

class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatch(type, fields = {}) {
    for (const callback of [...(this.listeners.get(type) || [])]) callback({ type, ...fields });
  }
}
class Element extends Surface {
  constructor(tag, doc) {
    super();
    Object.assign(this, { tagName: tag, ownerDocument: doc, children: [], attributes: new Map(), dataset: {}, style: {}, hidden: false, disabled: false, className: '', textContent: '', parentNode: null, files: [], open: false });
    this.classList = { toggle: (name, on) => {
      const values = new Set(this.className.split(' ').filter(Boolean));
      on ? values.add(name) : values.delete(name);
      this.className = [...values].join(' ');
    } };
  }
  append(...elements) { for (const element of elements) { element.remove(); element.parentNode = this; this.children.push(element); } }
  insertBefore(element, target) {
    element.remove(); element.parentNode = this;
    const index = this.children.indexOf(target);
    if (index === -1) this.children.push(element); else this.children.splice(index, 0, element);
  }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  click() { if (this.tagName === 'input') this.ownerDocument.onFileClick?.(this); else if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}
function environment(nav = {}, overrides = {}) {
  const doc = new Surface();
  Object.assign(doc, { visibilityState: 'visible', hasFocus: () => true, createElement: tag => new Element(tag, doc) });
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc);
  const win = new Surface();
  Object.assign(win, { navigator: nav, document: doc, isSecureContext: true, crypto: webcrypto, ...overrides });
  win.self = win; win.top = win;
  globalThis.window = win;
  return { win, doc };
}
const all = element => [element, ...element.children.flatMap(all)];
const find = (element, predicate) => all(element).find(predicate);
const hasClass = name => element => element.className.split(' ').includes(name);
const rowFor = (container, id) => container.children.find(element => element.dataset.permissionId === id);
const switchFor = (container, id) => find(rowFor(container, id), element => element.getAttribute('role') === 'switch');
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
const waitFor = async predicate => {
  const deadline = Date.now() + 1000;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('Timed out waiting for a mocked browser result.'); await flush(); }
};
const grant = () => Object.assign(new Surface(), { state: 'granted' });
const tracks = () => {
  const track = Object.assign(new Surface(), { kind: 'video', label: 'Test camera', getSettings: () => ({ width: 640, height: 480 }), stopped: 0, stop() { this.stopped++; } });
  return { track, stream: { getTracks: () => [track] } };
};

// Initialization and read-only status queries must never start protected APIs.
{
  let requests = 0;
  environment({ mediaDevices: { getUserMedia: () => { requests++; } }, permissions: { query: async () => grant() } });
  const lab = createPermissionLab();
  assert.equal(requests, 0);
  await lab.readExistingPermissions();
  assert.equal(requests, 0);
  assert.equal(lab.readState('camera').priorPermission, 'granted');
  assert.equal(lab.readState('camera').active, false);
  lab.dispose();
}

// A click reaches the browser synchronously even if a presentation callback
// fails. Both mounted views observe pending/cancelled state without polling.
{
  let resolveMedia;
  const trace = [];
  const { doc } = environment({ mediaDevices: { getUserMedia: () => { trace.push('browser request'); return new Promise(resolve => { resolveMedia = resolve; }); } } });
  const lab = createPermissionLab({ onChange: () => { throw new Error('Broken presentation callback'); } });
  const first = doc.createElement('div'), second = doc.createElement('div');
  const errors = [];
  const a = mountPermissionRows({ container: first, lab, onRequest: () => { trace.push('click callback'); throw new Error('Presentation callback'); }, onError: error => errors.push(error) });
  const b = mountPermissionRows({ container: second, lab });
  const firstSwitch = switchFor(first, 'camera'), secondSwitch = switchFor(second, 'camera');
  firstSwitch.focus(); firstSwitch.click();
  assert.deepEqual(trace, ['click callback', 'browser request']);
  assert.equal(firstSwitch.getAttribute('aria-busy'), 'true');
  assert.equal(secondSwitch.getAttribute('aria-busy'), 'true');
  assert.equal(find(rowFor(second, 'camera'), hasClass('permission-switch-label')).textContent, 'Cancel');
  secondSwitch.click();
  assert.equal(firstSwitch.getAttribute('aria-busy'), 'false');
  assert.equal(firstSwitch.getAttribute('aria-checked'), 'false');
  const { track, stream } = tracks(); resolveMedia(stream); await flush();
  assert.equal(track.stopped, 1);
  assert.equal(lab.getPreview('camera'), null);
  assert.equal(lab.readState('camera').status, 'stopped');
  assert.equal(doc.activeElement, firstSwitch);
  assert.equal(errors.length, 1, 'Only the failing optional presentation callback was reported.');
  a.dispose(); b.dispose(); lab.dispose();
}

// lab.run resolves error states by design; the UI must surface those results
// instead of waiting only for a rejected promise.
{
  const { doc } = environment({ mediaDevices: { getUserMedia: async () => { throw new DOMException('Camera denied', 'NotAllowedError'); } } });
  const lab = createPermissionLab(); const container = doc.createElement('div'); const errors = [];
  const mounted = mountPermissionRows({ container, lab, onError: (error, item) => errors.push([error, item]) });
  switchFor(container, 'camera').click(); await flush();
  assert.equal(lab.readState('camera').status, 'denied');
  assert.equal(switchFor(container, 'camera').getAttribute('aria-checked'), 'false');
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0].name, 'PermissionDeniedError');
  assert.equal(errors[0][1].id, 'camera');
  assert.equal(find(rowFor(container, 'camera'), element => element.tagName === 'details').open, true);
  assert.equal(find(rowFor(container, 'camera'), hasClass('permission-retry')).hidden, false);
  mounted.dispose(); lab.dispose();
}

// One-off snapshots have a direct Run again action that opens a real request.
// Inspect and Details remain usable without issuing any browser request.
{
  let requests = 0, inspected;
  const { doc } = environment({}, { Notification: { permission: 'default', requestPermission: async () => { requests++; return 'granted'; } } });
  const lab = createPermissionLab(); const container = doc.createElement('div');
  const mounted = mountPermissionRows({ container, lab, onInspect: item => { inspected = item.id; } });
  const row = rowFor(container, 'notifications');
  find(row, hasClass('permission-inspect')).click();
  assert.equal(inspected, 'notifications'); assert.equal(requests, 0);
  const details = find(row, element => element.tagName === 'details'); const summary = find(row, element => element.tagName === 'summary');
  details.open = true; details.dispatch('toggle'); assert.equal(summary.getAttribute('aria-expanded'), 'true');
  switchFor(container, 'notifications').click(); await flush();
  assert.equal(requests, 1); assert.equal(lab.readState('notifications').status, 'granted');
  assert.equal(switchFor(container, 'notifications').getAttribute('aria-checked'), 'true');
  find(row, hasClass('permission-retry')).click();
  assert.equal(requests, 2, 'A repeat request begins before the click returns.');
  await flush();
  switchFor(container, 'notifications').click();
  assert.equal(lab.readState('notifications').status, 'stopped');
  assert.equal(details.open, true);
  mounted.dispose(); lab.dispose();
}

// Recognized host policy blocks and missing APIs are explicit unavailable
// states, while the explanation/details controls remain interactive.
{
  let requests = 0;
  const { doc } = environment({ mediaDevices: { getUserMedia: () => { requests++; } } });
  doc.featurePolicy = { features: () => ['camera'], allowsFeature: () => false };
  const lab = createPermissionLab(); const container = doc.createElement('div');
  const mounted = mountPermissionRows({ container, lab });
  const toggle = switchFor(container, 'camera');
  assert.equal(toggle.disabled, true); assert.equal(toggle.getAttribute('aria-disabled'), 'true');
  assert.equal(find(rowFor(container, 'camera'), hasClass('permission-switch-label')).textContent, 'Unavailable');
  assert.match(lab.readState('camera').detail, /Permissions Policy/);
  toggle.click(); assert.equal(requests, 0);
  find(rowFor(container, 'camera'), hasClass('permission-inspect')).click();
  assert.equal(find(rowFor(container, 'camera'), element => element.tagName === 'details').open, true);
  mounted.dispose(); lab.dispose();
}

// Native file cancel and the older blur/focus fallback both clear the pending
// chooser. Files are observed only after an explicit selection.
{
  const { win, doc } = environment();
  const lab = createPermissionLab(); let input;
  doc.onFileClick = element => { input = element; };
  const cancel = lab.run('files');
  assert.equal(lab.readState('files').status, 'requesting'); input.dispatch('cancel'); await cancel;
  assert.equal(lab.readState('files').status, 'available'); assert.equal(doc.body.children.length, 0);
  const legacy = lab.run('files'); win.dispatch('blur'); win.dispatch('focus');
  await legacy;
  assert.equal(lab.readState('files').status, 'available'); assert.equal(doc.body.children.length, 0);
  assert.equal(win.listeners.get('focus').size, 0); assert.equal(win.listeners.get('blur').size, 0);
  const pending = lab.run('files'); lab.stop('files'); await pending;
  assert.equal(lab.readState('files').status, 'stopped'); assert.equal(doc.body.children.length, 0);
  lab.dispose();
}

// Geolocation must remain pending while a prompt/first position is outstanding,
// and a stopped watch cannot publish late position data.
{
  let success, failure, cleared = 0; const signals = [];
  environment({ geolocation: { watchPosition: (s, e) => { success = s; failure = e; return 42; }, clearWatch: id => { assert.equal(id, 42); cleared++; } } });
  const lab = createPermissionLab({ setSignal: (...args) => signals.push(args) });
  await lab.run('location'); assert.equal(lab.readState('location').status, 'requesting'); assert.equal(lab.readState('location').active, false);
  success({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: Date.now() });
  assert.equal(lab.readState('location').active, true);
  lab.stop('location'); const count = signals.length;
  success({ coords: { latitude: 4, longitude: 5, accuracy: 6 }, timestamp: Date.now() });
  assert.equal(signals.length, count); assert.equal(cleared, 1);
  await lab.run('location'); failure({ code: 1, message: 'Location denied' });
  assert.equal(lab.readState('location').status, 'denied'); assert.equal(lab.readState('location').active, false);
  lab.dispose();
}

// A focused manual clipboard failure stops sampling and reverts the switch.
// Neither the contents nor internal comparison fingerprints are exposed.
{
  let reads = 0; const signals = [], events = [];
  const { doc } = environment({ clipboard: { readText: async () => { reads++; if (reads > 1) throw new DOMException('Clipboard access denied', 'NotAllowedError'); return 'PRIVATE TEST CONTENT'; } }, permissions: { query: async () => grant() } });
  const lab = createPermissionLab({ setSignal: (...args) => signals.push(args), addEvent: (...args) => events.push(args) });
  const container = doc.createElement('div'); const mounted = mountPermissionRows({ container, lab });
  switchFor(container, 'clipboard').click(); await waitFor(() => lab.readState('clipboard').active);
  assert.equal(lab.readState('clipboard').active, true); assert.equal(reads, 1);
  find(rowFor(container, 'clipboard'), hasClass('permission-check')).click(); await flush();
  assert.equal(reads, 2); assert.equal(lab.readState('clipboard').status, 'denied'); assert.equal(lab.readState('clipboard').active, false);
  assert.equal(switchFor(container, 'clipboard').getAttribute('aria-checked'), 'false');
  assert.equal(JSON.stringify([signals, events]).includes('PRIVATE TEST CONTENT'), false);
  mounted.dispose(); lab.dispose();
}

// Legacy pointer-lock APIs that return void can fail to emit either event. A
// bounded wait must report an error instead of leaving a cosmetic pending state.
{
  const { doc } = environment(); doc.documentElement.requestPointerLock = () => {};
  doc.exitPointerLock = () => { doc.pointerLockElement = null; };
  const originalSetTimeout = globalThis.setTimeout; const originalClearTimeout = globalThis.clearTimeout;
  let timeout;
  globalThis.setTimeout = (callback, delay) => { assert.equal(delay, 15000); timeout = callback; return 1; };
  globalThis.clearTimeout = () => {};
  try {
    const lab = createPermissionLab(); const pending = lab.run('pointer-lock');
    timeout(); await pending;
    assert.equal(lab.readState('pointer-lock').status, 'error'); assert.equal(lab.readState('pointer-lock').active, false);
    lab.dispose();
  } finally { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
}

console.log('Permission controls: request activation, two-view sync, failures, cancellation, repeat actions, unsupported explanations, clipboard privacy, and cleanup passed.');

// Some Chromium contexts reject gesture-gated requests as TypeError "not
// granted" even when the API is exposed. Surface the actual refusal clearly;
// unrelated TypeErrors must remain failures rather than fabricated success.
for (const id of ['fullscreen', 'pointer-lock']) {
  const { doc } = environment();
  doc.fullscreenEnabled = true;
  doc.documentElement.requestFullscreen = async () => { throw new TypeError('not granted'); };
  doc.documentElement.requestPointerLock = async () => { throw new TypeError('not granted'); };
  doc.exitPointerLock = () => {}; doc.exitFullscreen = async () => {};
  const lab = createPermissionLab();
  await lab.run(id);
  const state = lab.readState(id);
  assert.equal(state.status, 'denied'); assert.equal(state.active, false);
  assert.match(state.detail, /The browser refused/);
  assert.match(state.detail, /Focus this page and click again/);
  assert.match(state.detail, /policy/);
  assert.match(state.detail, /TypeError: not granted/);
  lab.dispose();
}
{
  const { doc } = environment();
  doc.documentElement.requestFullscreen = async () => { throw new TypeError('Unexpected implementation error'); };
  const lab = createPermissionLab(); await lab.run('fullscreen');
  assert.equal(lab.readState('fullscreen').status, 'error');
  assert.match(lab.readState('fullscreen').detail, /Unexpected implementation error/);
  lab.dispose();
}
console.log('Fullscreen/pointer-lock native refusals: contextual guidance and honest error classification passed.');
