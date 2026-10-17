/**
 * Baseline observation engine. Calling startSensors is the explicit start.
 * No network, permission requests, clipboard reads, persistent IDs, or text capture.
 */
export function startSensors({ setSignal, addEvent }) {
  const cleanup = [];
  const signals = new Map();
  const counts = { clicks: 0, pointerSamples: 0, scrolls: 0, wheel: 0, keys: 0, copies: 0, cuts: 0, pastes: 0, swipes: 0, focusChanges: 0, visibilityChanges: 0, resizes: 0, screenshotSignals: 0, longTasks: 0 };
  let stopped = false;
  let eventCount = 0;
  let focused = document.hasFocus();
  let visible = !document.hidden;
  let activeMs = 0;
  let visibleMs = 0;
  let lastActivity = performance.now();
  let lastClock = performance.now();
  let touchStart = null;
  let fingerprintPromise = null;
  let fingerprintGeneration = 0;
  let latestFingerprint = null;
  const sources = {
    navigator: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator',
    screen: 'https://developer.mozilla.org/en-US/docs/Web/API/Screen',
    visibility: 'https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API',
    pointer: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events',
    keyboard: 'https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent',
    clipboard: 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API',
    performance: 'https://developer.mozilla.org/en-US/docs/Web/API/Performance_API',
    fingerprint: 'https://developer.mozilla.org/en-US/docs/Glossary/Fingerprinting',
    media: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries',
    storage: 'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API',
  };
  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const display = value => value === null || value === undefined || value === '' ? 'Not exposed by this browser' : String(value);
  const emit = (group, key, value, opts = {}) => {
    if (stopped) return;
    const options = { kind: 'observed', note: '', source: sources.navigator, ...opts };
    const id = `${group}:${key}`;
    const text = display(value);
    const before = signals.get(id);
    if (before && before.value === text && before.kind === options.kind && before.note === options.note) return;
    signals.set(id, { group, key, value: text, ...options });
    setSignal(group, key, text, options);
  };
  const unavailable = (group, key, note, source = sources.navigator) => emit(group, key, 'Unavailable', { kind: 'unavailable', note, source });
  const record = (title, detail, kind = 'observed') => {
    if (stopped) return;
    eventCount += 1;
    addEvent(title, detail, kind);
  };
  const on = (target, name, fn, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(name, fn, options);
    cleanup.push(() => target.removeEventListener(name, fn, options));
  };
  const throttle = (fn, ms = 300) => {
    let last = -Infinity;
    return (...args) => {
      const now = performance.now();
      if (now - last < ms) return;
      last = now;
      fn(...args);
    };
  };
  const activity = () => { lastActivity = performance.now(); };
  const bytes = n => Number.isFinite(n) ? `${(n / 1048576).toFixed(1)} MiB` : 'Not exposed by this browser';
  const humanTime = ms => `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
  const bool = n => n ? 'Yes' : 'No';
  const provenance = event => event.isTrusted === true ? 'Browser-dispatched · trusted flag true' : event.isTrusted === false ? 'Synthetic · trusted flag false' : 'Unknown provenance';
  const provenanceNote = 'Event.isTrusted distinguishes browser-dispatched events from dispatchEvent-created events. A trusted flag is not proof of a human, physical input, or successful action.';
  const provenanceSignal = (group, label, event) => emit(group, label, provenance(event), { note: provenanceNote, source: 'https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted' });
  const countSignals = () => {
    emit('activity', 'Clicks in this page', counts.clicks, { source: sources.pointer, note: 'Only click events delivered to this document.' });
    emit('activity', 'Keyboard events', counts.keys, { source: sources.keyboard, note: 'Count and shortcut categories only. Typed characters and input values are never recorded by this demo.' });
    emit('activity', 'Scroll samples', counts.scrolls, { source: sources.pointer, note: 'Throttled samples, not every native input event.' });
    emit('activity', 'Touch swipes', counts.swipes, { source: sources.pointer, note: 'Only gestures that start and end inside this page.' });
    emit('clipboard', 'Page copy / cut / paste', `${counts.copies} / ${counts.cuts} / ${counts.pastes}`, { source: sources.clipboard, note: 'The browser can deliver clipboard actions in this page without a permission prompt. No clipboard payload is read.' });
    emit('activity', 'Screenshot key signals', counts.screenshotSignals, { source: sources.keyboard, note: 'Synthetic events are excluded. Browser-dispatched or unknown-provenance keyboard signals are not evidence that an image was captured or saved. OS shortcuts may never reach this page.' });
  };

  // Browser-reported data, never treated as verified identity or hardware.
  emit('browser', 'User agent', navigator.userAgent, { note: 'Browser-reported string. It can be reduced, spoofed, or changed by privacy features.' });
  emit('browser', 'Reported platform', navigator.platform, { kind: 'estimate', note: 'Legacy platform hint; it does not reliably identify the actual operating system.' });
  emit('browser', 'Primary language', navigator.language);
  emit('browser', 'Language preferences', safe(() => navigator.languages.join(', ')));
  emit('browser', 'Locale / time zone', safe(() => `${Intl.DateTimeFormat().resolvedOptions().locale} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`), { note: 'Locale and zone preferences, not a GPS location.' });
  emit('browser', 'UTC offset', `${-new Date().getTimezoneOffset()} minutes`, { note: 'Current local time offset; may change with daylight saving time.' });
  emit('browser', 'Cookies enabled', bool(navigator.cookieEnabled), { note: 'A browser setting hint; this demo does not set a cookie and this does not guarantee third-party cookie access.' });
  emit('browser', 'Secure context', bool(window.isSecureContext), { note: 'Browsers generally treat localhost as a trustworthy context.' });
  emit('browser', 'Do Not Track', navigator.doNotTrack ?? 'Not sent', { note: 'An optional browser preference, not proof that tracking is blocked.' });
  emit('browser', 'Global Privacy Control', typeof navigator.globalPrivacyControl === 'boolean' ? bool(navigator.globalPrivacyControl) : 'Not exposed', { kind: typeof navigator.globalPrivacyControl === 'boolean' ? 'observed' : 'unavailable', note: 'A privacy preference, when the browser provides it.' });
  emit('browser', 'Automation flag', typeof navigator.webdriver === 'boolean' ? bool(navigator.webdriver) : 'Not exposed', { kind: typeof navigator.webdriver === 'boolean' ? 'estimate' : 'unavailable', note: 'Self-reported WebDriver flag. False does not prove that no automation or external control exists.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver' });
  emit('browser', 'PDF viewer', typeof navigator.pdfViewerEnabled === 'boolean' ? bool(navigator.pdfViewerEnabled) : 'Not exposed', { kind: typeof navigator.pdfViewerEnabled === 'boolean' ? 'observed' : 'unavailable', note: 'Built-in document viewer capability.' });
  const plugins = safe(() => Array.from(navigator.plugins || []).map(p => p.name), []);
  emit('browser', 'Browser plugin hints', plugins.length ? `${plugins.length}: ${plugins.join(', ')}` : 'No plugins exposed', { note: 'Often just standardized PDF viewer entries. This is not a list of installed browser extensions.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/plugins' });
  emit('browser', 'Referrer', document.referrer || 'None supplied', { note: 'A referring URL may be sent under the previous page’s referrer policy. Other browsing history is not readable.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Document/referrer' });
  emit('browser', 'History entry count', safe(() => history.length), { note: 'Only a count for this tab’s session history; URLs in other history entries are not exposed.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/History/length' });
  if (navigator.userAgentData) {
    emit('browser', 'Client-hint brands', safe(() => navigator.userAgentData.brands.map(b => `${b.brand} ${b.version}`).join(', ')), { note: 'Low-entropy browser hints only; high-entropy hints are not requested.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData' });
    emit('browser', 'Client-hint platform', navigator.userAgentData.platform, { kind: 'estimate', note: 'Browser-reported platform hint, not independently verified.' });
    emit('browser', 'Client-hint mobile', bool(navigator.userAgentData.mobile), { kind: 'estimate', note: 'Browser-reported mobile flag; it does not independently identify the physical device.' });
  } else unavailable('browser', 'Low-entropy client hints', 'This browser does not expose navigator.userAgentData.');

  emit('device', 'Logical processors hint', navigator.hardwareConcurrency, { kind: navigator.hardwareConcurrency ? 'estimate' : 'unavailable', note: 'Logical processors made available to the browser; may be reduced and is not the physical core count.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency' });
  emit('device', 'Memory bucket', navigator.deviceMemory ? `${navigator.deviceMemory} GiB` : 'Not exposed', { kind: navigator.deviceMemory ? 'estimate' : 'unavailable', note: 'Coarsened and capped browser hint, not measured installed RAM.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory' });
  emit('device', 'Maximum touch points', navigator.maxTouchPoints ?? 'Not exposed', { note: 'Touch input capability; it cannot reliably distinguish a phone from a touch laptop.' });

  for (const storageType of ['localStorage', 'sessionStorage']) {
    const accessible = safe(() => {
      const storage = window[storageType];
      const probe = '__observatory_storage_check__';
      const previous = storage.getItem(probe);
      storage.setItem(probe, '1');
      if (previous === null) storage.removeItem(probe); else storage.setItem(probe, previous);
      return true;
    }, false);
    emit('browser', `${storageType} availability`, accessible ? 'Available' : 'Blocked / unavailable', { kind: accessible ? 'observed' : 'unavailable', note: 'Tested with one temporary value that is immediately removed (or restored). No tracking identifier is stored.', source: sources.storage });
  }
  if (navigator.storage?.estimate) navigator.storage.estimate().then(info => {
    emit('browser', 'Origin storage estimate', `${bytes(info.usage)} used / ${bytes(info.quota)} quota`, { kind: 'estimate', note: 'Storage usage and quota for this origin only; not access to files on your device.', source: sources.storage });
  }).catch(() => unavailable('browser', 'Origin storage estimate', 'Storage estimation was unavailable or blocked.', sources.storage));

  const updateNetwork = () => {
    emit('network', 'Browser online status', navigator.onLine ? 'Online hint' : 'Offline hint', { kind: 'estimate', note: 'A network-interface hint. It cannot prove internet reachability.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine' });
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      emit('network', 'Effective connection type', connection.effectiveType ?? 'Not exposed', { kind: 'estimate', note: 'Browser estimate of recent connection performance, not the actual network technology.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API' });
      emit('network', 'Downlink estimate', Number.isFinite(connection.downlink) ? `${connection.downlink} Mbps` : 'Not exposed', { kind: Number.isFinite(connection.downlink) ? 'estimate' : 'unavailable', note: 'Rounded browser estimate; no speed test is performed.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/downlink' });
      emit('network', 'Round-trip estimate', Number.isFinite(connection.rtt) ? `${connection.rtt} ms` : 'Not exposed', { kind: Number.isFinite(connection.rtt) ? 'estimate' : 'unavailable', note: 'Rounded browser estimate, not a ping measured by this site.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/rtt' });
      emit('network', 'Data-saving preference', bool(connection.saveData), { note: 'The browser’s reduced-data preference, when exposed.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData' });
    } else unavailable('network', 'Connection quality hints', 'The Network Information API is not exposed in this browser.', 'https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API');
  };
  updateNetwork();
  on(window, 'online', () => { updateNetwork(); record('Network hint changed', 'Browser reports online. This is not an internet reachability test.', 'estimate'); });
  on(window, 'offline', () => { updateNetwork(); record('Network hint changed', 'Browser reports offline.', 'estimate'); });
  on(navigator.connection || navigator.mozConnection || navigator.webkitConnection, 'change', () => { updateNetwork(); record('Connection estimate changed', 'New browser connection hints are available.', 'estimate'); });

  const updateDisplay = () => {
    emit('display', 'Screen dimensions', `${screen.width} × ${screen.height} CSS px`, { note: 'Browser-exposed screen size in CSS pixels, which can be altered by scaling or privacy protection.', source: sources.screen });
    emit('display', 'Available screen area', `${screen.availWidth} × ${screen.availHeight} CSS px`, { note: 'Browser-reported usable area. It does not reveal what is on the taskbar or prove that a taskbar is open.', source: sources.screen });
    emit('display', 'Layout viewport', `${window.innerWidth} × ${window.innerHeight} CSS px`, { note: 'The content viewport. Resizing, mobile browser bars, keyboards, and zoom can change it.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/innerWidth' });
    emit('display', 'Window outer size', `${window.outerWidth} × ${window.outerHeight} CSS px`, { note: 'Includes browser chrome where reported. Differences are not reliable evidence that DevTools or another app is open.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/outerWidth' });
    emit('display', 'Pixel ratio', `${window.devicePixelRatio}×`, { note: 'Device-to-CSS pixel ratio; affected by browser zoom or display scaling.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio' });
    emit('display', 'Color depth', `${screen.colorDepth} bit`, { note: 'Browser-reported color depth, commonly standardized.', source: sources.screen });
    emit('display', 'Orientation', screen.orientation ? `${screen.orientation.type} · ${screen.orientation.angle}°` : 'Not exposed', { kind: screen.orientation ? 'observed' : 'unavailable', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation' });
    if (window.visualViewport) {
      const v = window.visualViewport;
      emit('display', 'Visual viewport', `${Math.round(v.width)} × ${Math.round(v.height)} CSS px · ${v.scale.toFixed(2)}× scale`, { note: 'The visible content viewport, which may change with pinch zoom or an on-screen keyboard. The cause cannot be proved.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport' });
      emit('display', 'Visual viewport offset', `${Math.round(v.offsetLeft)}, ${Math.round(v.offsetTop)} CSS px`, { source: 'https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport' });
    } else unavailable('display', 'Visual viewport', 'This browser does not expose the Visual Viewport API.', 'https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport');
    emit('display', 'Fullscreen state', document.fullscreenElement ? 'This page has a fullscreen element' : 'Not fullscreen', { note: 'Only fullscreen state for this document.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API' });
    const v = window.visualViewport;
    return {
      layout: `${window.innerWidth} × ${window.innerHeight} CSS px`,
      visual: v ? `${Math.round(v.width)} × ${Math.round(v.height)} CSS px · ${v.scale.toFixed(2)}× scale` : null,
      visualOffset: v ? `${Math.round(v.offsetLeft)}, ${Math.round(v.offsetTop)} CSS px` : null,
      screen: `${screen.width} × ${screen.height} CSS px`,
      pixelRatio: `${window.devicePixelRatio}×`,
      orientation: screen.orientation ? `${screen.orientation.type} · ${screen.orientation.angle}°` : null,
    };
  };
  let lastDisplay = updateDisplay();
  let resizeTimer = null;
  const flushDisplay = () => {
    resizeTimer = null;
    const next = updateDisplay();
    const labels = { layout: 'Layout viewport', visual: 'Visual viewport', visualOffset: 'Visual offset', screen: 'Screen report', pixelRatio: 'Pixel ratio', orientation: 'Orientation' };
    const changed = Object.keys(labels).filter(key => lastDisplay[key] !== next[key]);
    lastDisplay = next;
    if (!changed.length) return;
    counts.resizes += 1;
    record('Viewport changed', `${changed.map(key => `${labels[key]}: ${next[key] ?? 'not exposed'}`).join('; ')}. The cause is unknown.`);
  };
  const resized = () => { if (resizeTimer !== null) clearTimeout(resizeTimer); resizeTimer = setTimeout(flushDisplay, 180); };
  cleanup.push(() => { if (resizeTimer !== null) clearTimeout(resizeTimer); });
  on(window, 'resize', resized);
  on(window, 'orientationchange', resized);
  on(screen.orientation, 'change', resized);
  on(window.visualViewport, 'resize', resized);
  on(window.visualViewport, 'scroll', resized);
  on(document, 'fullscreenchange', () => { lastDisplay = updateDisplay(); record('Fullscreen state changed', document.fullscreenElement ? 'An element in this page entered fullscreen.' : 'This page left fullscreen.'); });

  const mediaQueries = [
    ['Color preference', '(prefers-color-scheme: dark)', 'Dark matched', 'Dark not matched'],
    ['Reduced-motion preference', '(prefers-reduced-motion: reduce)', 'Reduce', 'No preference'],
    ['Contrast preference', '(prefers-contrast: more)', 'More contrast', 'No more-contrast preference'],
    ['Forced colors', '(forced-colors: active)', 'Active', 'Inactive'],
    ['Wide color gamut', '(color-gamut: p3)', 'P3 or wider matched', 'P3 not matched'],
  ];
  for (const [label, query, yes, no] of mediaQueries) {
    const mql = safe(() => matchMedia(query));
    if (!mql || mql.media === 'not all' || typeof mql.matches !== 'boolean') { unavailable('device', label, 'A usable media-query result is not exposed.', sources.media); continue; }
    let previous = null;
    const update = () => {
      const value = mql.matches ? yes : no;
      const changed = previous !== null && value !== previous;
      previous = value;
      emit('device', label, value, { note: `CSS media query: ${query}. A negative match is a query result, not proof that the API is unavailable.`, source: sources.media });
      return changed;
    };
    update();
    on(mql, 'change', () => { if (update()) record('Device preference changed', label); });
  }
  const observeChoices = (label, feature, choices, multiple = false) => {
    const queries = choices.map(value => [value, safe(() => matchMedia(`(${feature}: ${value})`))]);
    let previous = null;
    const update = () => {
      const usable = queries.every(([, query]) => query && query.media !== 'not all' && typeof query.matches === 'boolean');
      const matches = usable ? queries.filter(([, query]) => query.matches).map(([value]) => value) : [];
      const conclusive = usable && matches.length > 0 && (multiple || matches.length === 1);
      const value = conclusive ? matches.map(value => value[0].toUpperCase() + value.slice(1)).join(' + ') : 'No conclusive media-query report';
      emit('device', label, value, { kind: conclusive ? 'observed' : 'unavailable', note: `Checks all ${feature} values (${choices.join(', ')}). No match or conflicting exclusive matches cannot distinguish unsupported/restricted reporting from other browser behavior.`, source: sources.media });
      if (feature === 'any-pointer') emit('device', 'Any fine pointer', conclusive ? (matches.includes('fine') ? 'Fine pointer matched' : 'No fine pointer matched') : 'No conclusive media-query report', { kind: conclusive ? 'observed' : 'unavailable', note: 'A negative fine-pointer match with another matching pointer value is an observed result, not API unavailability.', source: sources.media });
      if (previous !== null && previous !== value) record('Device preference changed', `${label}: ${value}`);
      previous = value;
    };
    update();
    for (const [, query] of queries) on(query, 'change', update);
  };
  observeChoices('Primary pointer', 'pointer', ['fine', 'coarse', 'none']);
  observeChoices('Any pointer', 'any-pointer', ['fine', 'coarse', 'none'], true);
  observeChoices('Hover capability', 'hover', ['hover', 'none']);

  if (navigator.getBattery) {
    emit('device', 'Battery information', 'Checking browser support…', { note: 'Battery Status API does not request a user permission in supporting browsers.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API' });
    navigator.getBattery().then(battery => {
      if (stopped) return;
      const update = () => {
        emit('device', 'Battery information', `${Math.round(battery.level * 100)}% · ${battery.charging ? 'charging' : 'on battery'}`, { note: 'Browser-exposed battery state. Desktop values may be generic; availability depends on browser and policy.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API' });
      };
      update();
      on(battery, 'levelchange', update);
      on(battery, 'chargingchange', update);
    }).catch(() => unavailable('device', 'Battery information', 'Battery Status API was blocked or unavailable.', 'https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API'));
  } else unavailable('device', 'Battery information', 'Battery Status API is not exposed by this browser.', 'https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API');

  // Lifecycle reveals page state, never the identity of another app or screen.
  const accrueTime = () => {
    const now = performance.now();
    const delta = Math.max(0, now - lastClock);
    if (visible) visibleMs += delta;
    if (visible && focused) activeMs += Math.max(0, Math.min(now, lastActivity + 60000) - lastClock);
    lastClock = now;
  };
  const updateLifecycle = () => {
    emit('activity', 'Page focus', focused ? 'Focused' : 'Unfocused', { note: 'This page’s focus state. It does not say which app, browser UI, or dialog has focus.', source: sources.visibility });
    emit('activity', 'Page visibility', document.visibilityState, { note: 'A hidden state may follow tab switching, minimization, or locking. It does not identify the cause.', source: sources.visibility });
    emit('activity', 'Interaction estimate', !visible ? 'Hidden — not observing user activity' : !focused ? 'Unfocused — activity elsewhere unknown' : performance.now() - lastActivity > 60000 ? 'Idle estimate (>60 seconds)' : 'Recently interacting', { kind: 'estimate', note: 'Local heuristic based on recent page events. It does not prove attention or physical presence.', source: sources.visibility });
    emit('activity', 'Visible session time', humanTime(visibleMs), { kind: 'estimate', note: 'Local elapsed time while document visibility is visible; excludes time before starting.', source: sources.visibility });
    emit('activity', 'Active session estimate', humanTime(activeMs), { kind: 'estimate', note: 'Elapsed time while focused, visible, and within 60 seconds of a page interaction. Not an attention measurement.', source: sources.visibility });
  };
  updateLifecycle();
  on(window, 'focus', () => {
    accrueTime(); focused = true; activity(); counts.focusChanges += 1; updateLifecycle();
    record('Page regained focus', 'What happened outside this page is unknown. Returning does not prove that a screenshot or copy occurred.');
  });
  on(window, 'blur', () => {
    accrueTime(); focused = false; counts.focusChanges += 1; updateLifecycle();
    record('Page lost focus', 'Another window, browser UI, permission prompt, or OS UI may have focus. The destination is unknown.');
  });
  on(document, 'visibilitychange', () => {
    accrueTime(); visible = !document.hidden; focused = document.hasFocus(); counts.visibilityChanges += 1; updateLifecycle();
    record(visible ? 'Page became visible' : 'Page became hidden', 'The browser exposes a visibility state, not another tab’s URL or the reason for the change.');
  });
  for (const name of ['pageshow', 'pagehide']) on(window, name, event => {
    accrueTime(); visible = name === 'pageshow' && !document.hidden; focused = document.hasFocus();
    emit('activity', 'Last page lifecycle', `${name}${event.persisted ? ' · back/forward cache' : ''}`, { source: sources.visibility });
    updateLifecycle();
    record(`Lifecycle: ${name}`, event.persisted ? 'Browser reports a back/forward-cache transition.' : 'Document lifecycle event.');
  });
  on(document, 'freeze', () => { accrueTime(); visible = false; emit('activity', 'Last page lifecycle', 'freeze', { source: sources.visibility }); record('Page frozen', 'The browser can suspend execution; background activity is not continuously observable.'); });
  on(document, 'resume', () => { lastClock = performance.now(); visible = !document.hidden; focused = document.hasFocus(); updateLifecycle(); record('Page resumed', 'Execution resumed after the browser suspended this page.'); });

  // Sample page interactions without retaining text, element contents, or paths.
  emit('activity', 'Text entered in this page', 'Readable by site scripts · discarded here', { kind: 'context', note: 'Capability explanation, not a captured text value. Scripts can observe key/input events and read values in their own form fields without a new browser permission. This demo retains categories and counts only; typed characters, strings, and form values are discarded.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/input_event' });
  on(window, 'pointermove', throttle(event => {
    activity();
    provenanceSignal('activity', 'Last pointer event provenance', event);
    counts.pointerSamples += 1;
    const x = Math.round(event.clientX / 8) * 8;
    const y = Math.round(event.clientY / 8) * 8;
    emit('activity', 'Pointer position', `${x}, ${y} CSS px · ${event.pointerType || 'unknown'}`, { note: 'Page-relative coordinates sampled at most 4 times per second and rounded to 8 px. Movement outside the page is not tracked.', source: sources.pointer });
    emit('activity', 'Pointer pressure', Number.isFinite(event.pressure) ? event.pressure.toFixed(2) : 'Not exposed', { note: 'Input-device pressure supplied by a pointer event; a mouse may report a generic value.', source: sources.pointer });
  }, 250), { passive: true });
  on(document, 'click', event => {
    activity(); counts.clicks += 1; countSignals();
    provenanceSignal('activity', 'Last click event provenance', event);
    const tag = event.target?.tagName?.toLowerCase() || 'element';
    emit('activity', 'Last click target', `<${tag}> · ${Math.round(event.clientX)}, ${Math.round(event.clientY)} CSS px`, { note: 'Only element type and page coordinates; no element text, form value, or identifier is stored.', source: sources.pointer });
    record(event.isTrusted === false ? 'Synthetic page click' : 'Page click', `Click ${counts.clicks} on a ${tag} element. ${provenance(event)}.`);
  });
  on(document, 'contextmenu', () => { activity(); record('Context menu requested', 'A context-menu event reached this page. It does not reveal the menu item selected afterward.'); });
  const updateScroll = () => {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    emit('activity', 'Scroll position', `${Math.round(scrollX)}, ${Math.round(scrollY)} CSS px · ${max ? Math.round(scrollY / max * 100) : 0}% depth`, { note: 'Position inside this document only.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event' });
  };
  updateScroll();
  on(window, 'scroll', throttle(() => { activity(); counts.scrolls += 1; updateScroll(); countSignals(); }, 250), { passive: true });
  on(window, 'wheel', throttle(event => {
    activity(); counts.wheel += 1;
    emit('activity', 'Last wheel direction', Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? (event.deltaY >= 0 ? 'Down' : 'Up') : (event.deltaX >= 0 ? 'Right' : 'Left'), { note: 'Wheel input delivered to this page; it may scroll or zoom depending on browser behavior.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event' });
  }, 400), { passive: true });
  on(document, 'touchstart', event => {
    activity();
    if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: performance.now() };
    else touchStart = null;
    emit('activity', 'Touches in page', event.touches.length, { note: 'Touches delivered to this document. System gestures may be intercepted before the page receives them.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Touch_events' });
  }, { passive: true });
  on(document, 'touchend', event => {
    activity();
    const start = touchStart; touchStart = null;
    if (!start || !event.changedTouches[0]) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.hypot(dx, dy) < 35 || performance.now() - start.time > 1800) return;
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'Right' : 'Left') : (dy > 0 ? 'Down' : 'Up');
    counts.swipes += 1;
    emit('activity', 'Last page swipe', direction, { kind: 'estimate', note: 'Direction inferred from a touch that began and ended in this page. This cannot identify an OS taskbar or notification-shade gesture.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Touch_events' });
    countSignals();
    record('Page swipe', `${direction} gesture inside this page.`, 'estimate');
  }, { passive: true });
  on(document, 'touchcancel', () => { touchStart = null; record('Touch interrupted', 'Browser canceled a page touch. The cause is unknown; this does not prove an OS gesture.'); }, { passive: true });

  let lastShortcutAt = -Infinity;
  let lastPrintScreenAt = -Infinity;
  let lastSyntheticScreenshotAt = -Infinity;
  const keyboard = event => {
    activity();
    provenanceSignal('activity', 'Last keyboard event provenance', event);
    if (event.type === 'keydown' && !event.repeat) counts.keys += 1;
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const screenshot = key === 'printscreen' || event.code === 'PrintScreen' || (event.shiftKey && event.metaKey && ['s', '3', '4', '5'].includes(key));
    const synthetic = event.isTrusted === false;
    const lastCaptureSignalAt = synthetic ? lastSyntheticScreenshotAt : lastPrintScreenAt;
    if (screenshot && performance.now() - lastCaptureSignalAt > 1200) {
      if (synthetic) lastSyntheticScreenshotAt = performance.now();
      else { lastPrintScreenAt = performance.now(); counts.screenshotSignals += 1; }
      emit('activity', 'Last screenshot signal', synthetic ? 'Synthetic capture shortcut · not counted' : key === 'printscreen' ? 'Print Screen key received' : 'Possible capture shortcut received', { kind: 'estimate', note: `A key signal only. Actual screenshot capture cannot be confirmed; OS-handled shortcuts may generate no page event. ${provenance(event)}; a trusted flag is not proof of physical input.`, source: sources.keyboard });
      record(synthetic ? 'Synthetic screenshot shortcut' : 'Possible screenshot shortcut', synthetic ? 'A script-generated capture shortcut was received. It is not counted as a screenshot key signal and does not confirm a screenshot.' : `A capture-related keyboard signal reached this page. It does not confirm a screenshot. ${provenance(event)}.`, 'estimate');
    }
    if (event.type !== 'keydown' || event.repeat) { countSignals(); return; }
    let category = null;
    if ((event.ctrlKey || event.metaKey) && key === 'c') category = 'Copy shortcut';
    else if ((event.ctrlKey || event.metaKey) && key === 'x') category = 'Cut shortcut';
    else if ((event.ctrlKey || event.metaKey) && key === 'v') category = 'Paste shortcut';
    else if ((event.ctrlKey || event.metaKey) && key === 'a') category = 'Select-all shortcut';
    else if ((event.ctrlKey || event.metaKey) && key === 'p') category = 'Print shortcut';
    else if (key === 'tab') category = 'Keyboard navigation';
    else if (key === 'escape') category = 'Escape / dismiss';
    else if (event.ctrlKey || event.metaKey || event.altKey) category = 'Other modifier shortcut';
    else category = 'Ordinary key event (character discarded)';
    emit('activity', 'Last keyboard category', category, { note: 'Only a category is retained; the actual typed key, string, and input value are discarded.', source: sources.keyboard });
    countSignals();
    if (!category.startsWith('Ordinary') && performance.now() - lastShortcutAt > 500) {
      lastShortcutAt = performance.now();
      record('Keyboard category', `${category}. Browser delivery does not guarantee that the action happened.`);
    }
  };
  on(document, 'keydown', keyboard, true);
  on(document, 'keyup', keyboard, true);
  for (const name of ['copy', 'cut', 'paste']) on(document, name, event => {
    activity(); counts[{ copy: 'copies', cut: 'cuts', paste: 'pastes' }[name]] += 1;
    provenanceSignal('clipboard', 'Last clipboard event provenance', event);
    const formats = safe(() => Array.from(event.clipboardData?.types || []), []);
    emit('clipboard', 'Last clipboard action', name, { note: 'A clipboard event in this document. Actions in another app or tab are not exposed.', source: sources.clipboard });
    emit('clipboard', 'Last event formats', formats.length ? formats.join(', ') : 'No formats exposed on this event', { note: 'Only MIME format labels are inspected. Text, images, files, names, and all clipboard payloads are discarded.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData' });
    countSignals();
    record(`${event.isTrusted === false ? 'Synthetic page' : 'Page'} ${name} event`, `${formats.length ? `Format labels: ${formats.join(', ')}.` : 'No format labels exposed.'} Contents were not read. ${provenance(event)}.`);
  }, true);
  emit('clipboard', 'System clipboard at baseline', 'Not read', { kind: 'context', note: 'No clipboard measurement was attempted. Baseline does not call clipboard.read/readText. Use a permission card to explicitly test clipboard access.', source: sources.clipboard });
  on(window, 'beforeprint', () => record('Print flow started', 'Browser print lifecycle event. It does not report screenshot capture.'));
  on(window, 'afterprint', () => record('Print flow ended', 'This does not prove that a print or PDF file was saved.'));
  countSignals();

  const updatePerformance = () => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      emit('performance', 'Navigation type', nav.type, { note: 'Navigation into this document, such as reload or back/forward.', source: sources.performance });
      emit('performance', 'DOM ready timing', nav.domContentLoadedEventEnd ? `${Math.round(nav.domContentLoadedEventEnd)} ms` : 'Still loading', { note: 'Elapsed time from this document’s navigation; browser precision may be reduced.', source: sources.performance });
      emit('performance', 'Page load timing', nav.loadEventEnd ? `${Math.round(nav.loadEventEnd)} ms` : 'Still loading', { note: 'Local navigation timing, not a cross-site browsing record.', source: sources.performance });
      emit('performance', 'Response timing', `${Math.round(nav.responseEnd - nav.requestStart)} ms`, { kind: 'estimate', note: 'Browser timing for this document’s response; it is not a general internet speed measurement.', source: sources.performance });
    }
    emit('performance', 'Resource timing entries', performance.getEntriesByType('resource').length, { note: 'Counts existing timing records for this page. This reading does not upload those records or initiate a probe; separate connection/provider requests follow the connection panel disclosure.', source: sources.performance });
    const paint = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
    emit('performance', 'First contentful paint', paint ? `${Math.round(paint.startTime)} ms` : 'Not exposed / not recorded', { kind: paint ? 'observed' : 'unavailable', source: sources.performance });
    if (performance.memory) emit('performance', 'JavaScript heap estimate', `${bytes(performance.memory.usedJSHeapSize)} / ${bytes(performance.memory.jsHeapSizeLimit)} limit`, { kind: 'estimate', note: 'Non-standard browser heap statistics; may include shared memory and are not system RAM.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory' });
    else unavailable('performance', 'JavaScript heap estimate', 'Non-standard heap statistics are not exposed by this browser.', 'https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory');
  };
  updatePerformance();
  on(window, 'load', updatePerformance);
  const delayedPerf = setTimeout(updatePerformance, 1200); cleanup.push(() => clearTimeout(delayedPerf));
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    const observer = new PerformanceObserver(list => {
      counts.longTasks += list.getEntries().length;
      emit('performance', 'Long tasks observed', counts.longTasks, { note: 'Main-thread tasks longer than 50 ms after starting. No script contents or user data are inspected.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming' });
    });
    safe(() => observer.observe({ type: 'longtask' }));
    cleanup.push(() => observer.disconnect());
    emit('performance', 'Long tasks observed', 0, { note: 'Main-thread tasks over 50 ms observed after starting.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming' });
  } else unavailable('performance', 'Long tasks observed', 'Long Task observation is not supported.', 'https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming');

  // v2 has fixed property order and explicit unavailable values. Timestamps,
  // viewport/window dimensions, event counts, and user configuration are excluded.
  const fingerprintSchema = 'observatory-fingerprint/2';
  const fontCandidates = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Segoe UI', 'Roboto', 'Helvetica'];
  const groupingFields = [
    'schemaVersion', 'browser.userAgent', 'browser.platform', 'browser.languages', 'browser.timeZone',
    'browser.logicalProcessors', 'browser.memoryGiBBucket', 'browser.maxTouchPoints',
    'screen.width', 'screen.height', 'screen.colorDepth', 'screen.pixelRatio',
    'graphics.status', 'graphics.vendor', 'graphics.renderer', 'graphics.version', 'graphics.extensions',
    'graphics.maxTextureSize', 'graphics.unmaskedVendor', 'graphics.unmaskedRenderer',
    'canvas.status', 'canvas.hash', 'fonts.status', 'fonts.widths[].family', 'fonts.widths[].width',
  ];
  const cloneFingerprint = value => value ? JSON.parse(JSON.stringify(value)) : null;
  const stringValue = read => safe(() => { const value = read(); return typeof value === 'string' ? value : null; });
  const numberValue = read => safe(() => { const value = read(); return Number.isFinite(value) ? value : null; });
  const collectGraphics = () => {
    const result = { status: 'unavailable', vendor: null, renderer: null, version: null, extensions: null, maxTextureSize: null, unmaskedVendor: null, unmaskedRenderer: null };
    let gl = null;
    try {
      const canvas = document.createElement('canvas');
      gl = canvas.getContext('webgl', { powerPreference: 'low-power', antialias: false }) || canvas.getContext('experimental-webgl');
      if (!gl) return result;
      result.status = 'available';
      result.vendor = stringValue(() => gl.getParameter(gl.VENDOR));
      result.renderer = stringValue(() => gl.getParameter(gl.RENDERER));
      result.version = stringValue(() => gl.getParameter(gl.VERSION));
      result.maxTextureSize = numberValue(() => gl.getParameter(gl.MAX_TEXTURE_SIZE));
      result.extensions = safe(() => {
        const values = gl.getSupportedExtensions();
        return Array.isArray(values) ? [...new Set(values.filter(value => typeof value === 'string'))].sort() : null;
      });
      const debug = safe(() => gl.getExtension('WEBGL_debug_renderer_info'));
      if (debug) {
        result.unmaskedVendor = stringValue(() => gl.getParameter(debug.UNMASKED_VENDOR_WEBGL));
        result.unmaskedRenderer = stringValue(() => gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
      }
    } catch { /* Preserve explicit nulls, not a previous snapshot's GPU values. */ }
    finally { if (gl) safe(() => gl.getExtension('WEBGL_lose_context')?.loseContext()); }
    return result;
  };
  const collectRendering = () => {
    let pixels = null;
    let widths = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 100;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { pixels, widths };
      // Font widths are measured independently of whether pixel readback works.
      widths = safe(() => fontCandidates.map(family => {
        ctx.font = `32px "${family}", monospace`;
        const width = ctx.measureText('mmmmmmmmWWWWWWii012345').width;
        if (!Number.isFinite(width)) throw new Error('Unavailable width');
        return { family, width: Number(width.toFixed(2)) };
      }));
      ctx.fillStyle = '#e8eef4'; ctx.fillRect(0, 0, 320, 100);
      const gradient = ctx.createLinearGradient(0, 0, 320, 100);
      gradient.addColorStop(0, '#264653'); gradient.addColorStop(1, '#e76f51');
      ctx.fillStyle = gradient; ctx.fillRect(4, 4, 312, 92);
      ctx.font = '19px Arial'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
      ctx.fillText('Observatory · AaBb 012345', 12, 36);
      ctx.font = '17px serif'; ctx.fillStyle = '#081225'; ctx.fillText('Canvas render sample', 13, 62);
      ctx.globalCompositeOperation = 'multiply'; ctx.beginPath(); ctx.arc(270, 50, 30, 0, Math.PI * 2); ctx.fillStyle = '#f4a261'; ctx.fill();
      pixels = new Uint8Array(ctx.getImageData(0, 0, 320, 100).data);
    } catch { /* Fonts can remain available even if drawing or pixel access fails. */ }
    return { pixels, widths };
  };
  const digest = async input => {
    if (!globalThis.crypto?.subtle) throw new Error('Hashing unavailable');
    const buffer = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(hash);
    if (bytes.byteLength !== 32) throw new Error('Invalid SHA-256 result');
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').slice(0, 20);
  };
  const publishFingerprint = result => {
    const { graphics, fonts } = result.hashInputs;
    emit('fingerprint', 'Fingerprint schema version', result.schemaVersion, { kind: 'context', note: 'Compare signatures only with the same schema and drawing/measurement recipe.', source: sources.fingerprint });
    emit('fingerprint', 'Grouping hash input fields', result.groupingFields.join(', '), { kind: 'context', note: 'These exact fields, in this order, are included in hashInputs. Timestamp and ordinary window/viewport dimensions are excluded. The screen report, color depth, and pixel ratio are included. The complete input snapshot is available in the fingerprint result/export.', source: sources.fingerprint });
    emit('fingerprint', 'WebGL capabilities', graphics.status === 'available' ? 'Fresh context collected' : 'Unavailable on this calculation', { kind: graphics.status === 'available' ? 'observed' : 'unavailable', note: 'A fresh graphics context is sampled and released on each completed calculation.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API' });
    const graphicsRows = [
      ['WebGL renderer', graphics.vendor || graphics.renderer ? [graphics.vendor, graphics.renderer].filter(Boolean).join(' · ') : null, 'Browser-reported rendering implementation; it may be generic, masked, or spoofed.'],
      ['WebGL version', graphics.version, 'Version exposed by this fresh graphics context.'],
      ['Graphics extensions', graphics.extensions ? `${graphics.extensions.length} capabilities: ${graphics.extensions.join(', ') || 'none'}` : null, 'Graphics capabilities, not installed browser extensions. Names are sorted for a deterministic snapshot.'],
      ['Maximum texture size', graphics.maxTextureSize === null ? null : `${graphics.maxTextureSize} px`, 'An exposed graphics capability, not a hardware identity.'],
      ['Exposed GPU hint', graphics.unmaskedVendor || graphics.unmaskedRenderer ? [graphics.unmaskedVendor, graphics.unmaskedRenderer].filter(Boolean).join(' · ') : null, 'Optional driver hint. It may be masked, virtualized, or spoofed; no GPU serial number is exposed.'],
    ];
    for (const [key, value, note] of graphicsRows) emit('fingerprint', key, value ?? 'Unavailable on this calculation', { kind: value === null ? 'unavailable' : key === 'Exposed GPU hint' ? 'estimate' : 'observed', note, source: 'https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_debug_renderer_info' });
    emit('fingerprint', 'Fixed font width samples', fonts.widths ? fonts.widths.map(({ family, width }) => `${family}:${width.toFixed(2)}`).join(' · ') : 'Unavailable on this calculation', { kind: fonts.widths ? 'estimate' : 'unavailable', note: 'Fresh widths for eight fixed font candidates. Fallbacks and aliases can match; these are not a verified installed-font inventory.', source: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/measureText' });
    emit('fingerprint', 'Canvas render hash', result.canvasHash ?? 'Unavailable on this calculation', { kind: result.canvasHash ? 'estimate' : 'unavailable', note: 'First 80 bits of SHA-256 for a fixed local drawing. A rendering summary, not an identity. This demo does not use the signature to track you across websites or upload it; it may be included in your local export.', source: sources.fingerprint });
    emit('fingerprint', 'Browser grouping hash', result.groupingHash ?? 'Unavailable on this calculation', { kind: result.groupingHash ? 'estimate' : 'unavailable', note: 'First 80 bits of SHA-256 over the versioned, ordered hashInputs snapshot. Similar devices can match and one device can change. Ordinary window resizing does not necessarily change it. This demo does not use these signatures to track you across websites.', source: sources.fingerprint });
  };
  const fingerprint = () => {
    if (stopped) return Promise.resolve(null);
    if (fingerprintPromise) return fingerprintPromise.then(cloneFingerprint);
    const generation = ++fingerprintGeneration;
    const capturedAt = new Date().toISOString();
    // All browser/graphics/rendering inputs are captured synchronously before
    // awaiting hashing, so a calculation never mixes earlier cached GPU values.
    const browser = {
      userAgent: stringValue(() => navigator.userAgent),
      platform: stringValue(() => navigator.platform),
      languages: safe(() => Array.isArray(navigator.languages) ? navigator.languages.filter(value => typeof value === 'string').slice() : null),
      timeZone: stringValue(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      logicalProcessors: numberValue(() => navigator.hardwareConcurrency),
      memoryGiBBucket: numberValue(() => navigator.deviceMemory),
      maxTouchPoints: numberValue(() => navigator.maxTouchPoints),
    };
    const display = { width: numberValue(() => screen.width), height: numberValue(() => screen.height), colorDepth: numberValue(() => screen.colorDepth), pixelRatio: numberValue(() => window.devicePixelRatio) };
    const graphics = collectGraphics();
    const rendering = collectRendering();
    const result = { schemaVersion: fingerprintSchema, capturedAt, status: 'unavailable', hashAlgorithm: 'SHA-256, first 80 bits', canvasHash: null, groupingHash: null, groupingFields: [...groupingFields], hashInputs: null, unique: false, stored: false };
    fingerprintPromise = (async () => {
      if (rendering.pixels) { try { result.canvasHash = await digest(rendering.pixels); } catch { /* Explicit unavailable value. */ } }
      if (stopped || generation !== fingerprintGeneration) return null;
      result.hashInputs = { schemaVersion: fingerprintSchema, browser, screen: display, graphics, canvas: { status: result.canvasHash ? 'available' : 'unavailable', hash: result.canvasHash }, fonts: { status: rendering.widths ? 'available' : 'unavailable', widths: rendering.widths } };
      try { result.groupingHash = await digest(JSON.stringify(result.hashInputs)); result.status = 'ready'; } catch { /* No previous grouping hash is reused. */ }
      if (stopped || generation !== fingerprintGeneration) return null;
      latestFingerprint = result;
      publishFingerprint(result);
      record('Local fingerprint sample ready', result.groupingHash ? 'Fresh browser, screen, graphics, canvas, and font inputs were summarized locally. The versioned input snapshot does not establish a unique identity.' : 'Fresh inputs were collected, but local hashing is unavailable. Previous hashes are not reused.', 'estimate');
      return result;
    })().finally(() => { if (generation === fingerprintGeneration) fingerprintPromise = null; });
    return fingerprintPromise.then(cloneFingerprint);
  };
  fingerprint();

  const boundaries = [
    ['Actual screenshots', 'No universal screenshot event', 'A normal website cannot reliably confirm OS screenshots, saved captures, or screenshots taken from another app. Keyboard shortcuts are only hints.', sources.keyboard],
    ['Installed browser extensions', 'No universal extension inventory', 'Web pages cannot enumerate installed browser extensions. Some extensions deliberately expose page APIs or visible changes; that does not yield a complete or reliable extension detector.', 'https://developer.chrome.com/docs/extensions/develop/concepts/messaging#external-webpage'],
    ['Taskbar / notification shade', 'Cause of focus loss is unknown', 'A mobile system gesture may change focus, visibility, or viewport, or may produce no event at all. This page cannot identify a taskbar, notification shade, app switcher, or their contents.', sources.visibility],
    ['Other tabs and browser history', 'Not readable', 'This page cannot enumerate other tabs, their URLs, or your global browser history. A tab’s session-history length and a supplied referrer are narrower signals.', 'https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy'],
    ['Unfocused keystrokes / copies', 'Not observable', 'Typing and copy events in another app or tab are not delivered to this document. Background execution can also be suspended. Clipboard access has separate permission, gesture, and focus restrictions.', sources.clipboard],
    ['External site control', 'No universal proof', 'The WebDriver flag is only a hint. A page cannot reliably identify remote-control software, OS automation, accessibility tools, or all injected extensions. Viewport differences do not prove DevTools is open.', 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver'],
    ['Private files and passwords', 'Not readable without selection or access', 'A website can read text you submit to its own fields, but cannot browse arbitrary local files, other apps, or your password manager. This demo intentionally discards typed text.', 'https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications'],
    ['Public IP and server logs', 'Depends on the receiving server', 'A server sees the connection reaching it and ordinary request metadata without a browser prompt. Connection checks, any disclosed provider lookup, aggregate visit counting, and hosting logs have separate behavior described in this site’s privacy information. IP addresses do not establish identity or precise physical location.', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview'],
    ['Camera, mic, location, screen', 'Explicit separate access', 'These capabilities have browser permission, user-selection, secure-context, and browser-support restrictions. The permission lab requests one capability only after you click it.', 'https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API'],
    ['Physical identity or attention', 'Cannot be established', 'A browser fingerprint is a collection of changeable hints. Focus, visibility, and idle estimates cannot verify who you are, what you are looking at, or whether you are present.', sources.fingerprint],
    ['Universal capability coverage', 'Browser and device dependent', 'APIs vary by browser, OS, secure context, policy, and privacy settings. No page can promise every imaginable permission or all possible data from every website.', 'https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API'],
  ];
  for (const [label, value, note, source] of boundaries) emit('boundaries', label, value, { kind: 'context', note, source });

  const clockTimer = setInterval(() => { accrueTime(); updateLifecycle(); }, 1000);
  cleanup.push(() => clearInterval(clockTimer));
  record('Baseline observation started', 'These browser observations request no new permission and remain in page memory unless exported. Connection checks, aggregate visit counting, and hosting logs are described separately in the site’s privacy information.');
  return {
    stop() {
      if (stopped) return;
      accrueTime();
      stopped = true;
      fingerprintGeneration += 1;
      latestFingerprint = null;
      for (const dispose of cleanup.splice(0)) safe(dispose);
    },
    clearCounts() {
      for (const key of Object.keys(counts)) counts[key] = 0;
      eventCount = 0; activeMs = 0; visibleMs = 0;
      lastClock = performance.now(); lastActivity = lastClock;
      countSignals(); updateLifecycle();
    },
    fingerprint,
    getSummary() {
      const records = [...signals.values()];
      return {
        totalSignals: records.length,
        observedCount: records.filter(signal => signal.kind === 'observed').length,
        estimateCount: records.filter(signal => signal.kind === 'estimate').length,
        unavailableCount: records.filter(signal => signal.kind === 'unavailable').length,
        eventCount,
        counts: { ...counts },
        activeSeconds: Math.floor(activeMs / 1000),
        visibleSeconds: Math.floor(visibleMs / 1000),
        focused,
        visible,
        stopped,
        fingerprint: cloneFingerprint(latestFingerprint),
      };
    },
  };
}
