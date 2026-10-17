/**
 * In-memory evidence log. Everyday and Expert mode filter the same
 * collection. Signal snapshots never increment action counters. No browser APIs,
 * persistence, networking, or timers are used by this module.
 */
const CATEGORIES = ['clicks', 'clipboard', 'screenshot', 'tabs', 'resolution', 'pointer', 'network', 'browser', 'device', 'fingerprint', 'performance', 'permissions', 'integrity', 'session', 'display', 'swipe'];
const EVERYDAY = new Set(['clicks', 'clipboard', 'screenshot', 'tabs', 'resolution', 'swipe']);
const ALIASES = {
  clicks: 'click clicks clicked clicking tap taps button mouse',
  clipboard: 'clipboard',
  screenshot: 'screenshot screenshots capture screen capture print screen printscreen snip snipping windows shift s win shift s',
  tabs: 'tab tabs switch switching switched focus focused unfocused blur hidden visible visibility app apps background foreground',
  resolution: 'resolution resize resized resizing viewport dimensions window size screen size zoom rotate orientation',
  pointer: 'pointer cursor mouse movement pressure wheel scroll scrolling touch coordinates',
  network: 'network connection online offline ip address headers request internet downlink latency rtt',
  browser: 'browser user agent language locale timezone time zone referrer history cookies automation plugins web driver webdriver',
  device: 'device hardware cpu cores memory ram battery touch preference preferences reduced motion color colour theme',
  fingerprint: 'fingerprint fingerprints fingerprinting hash hashes signature canvas graphics gpu webgl fonts rendering identity',
  performance: 'performance timing load paint heap long task tasks resources duration speed',
  permissions: 'permission permissions granted denied allow allowed blocked access capability capabilities camera microphone location geolocation notifications bluetooth usb serial hid midi files folder contacts sensor clipboard',
  integrity: 'integrity mutation mutations injected injection external control controller extension extensions automated automation',
  session: 'session startup start started reset clear cleared lifecycle pageshow pagehide freeze resume context',
  display: 'display screen monitor monitors geometry fullscreen pixel ratio color depth colour depth orientation',
  swipe: 'swipe swipes swiping touch gesture gestures finger mobile phone',
};
const CATEGORY_ALIASES = { click: 'clicks', copy: 'clipboard', cut: 'clipboard', paste: 'clipboard', 'focus-tab': 'tabs', focus: 'tabs', tab: 'tabs', visibility: 'tabs', screenshot: 'screenshot', resize: 'resolution', viewport: 'resolution', permission: 'permissions' };
const CLIPBOARD_ALIASES = { copy: 'copy copied copying ctrl c command c', cut: 'cut cutting ctrl x command x', paste: 'paste pasted pasting ctrl v command v' };
const normalize = value => String(value ?? '').toLowerCase().replace(/[\u2010-\u2015_-]/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const canonicalCategory = value => {
  const raw = String(value ?? '').toLowerCase();
  return CATEGORIES.includes(raw) ? raw : CATEGORY_ALIASES[raw];
};

function classify(title, detail = '', group = '', key = '') {
  const label = normalize(`${title} ${key}`);
  const scope = normalize(group);
  if (/permission/.test(scope)) return 'permissions';
  if (/integrity/.test(scope) || /^synthetic\b/.test(label) || /mutation|injected|external controller|external control|api reference|page script elements|page code related attributes|exposed extension|extension origin.*hint|extension scheme/.test(label)) return 'integrity';
  if (/screenshot|printscreen|print screen|capture shortcut|snipping/.test(label)) return 'screenshot';
  if (/clipboard/.test(scope) || /clipboard/.test(label) || /\b(copy|cut|paste)\b/.test(label) && !/keyboard category/.test(label)) return 'clipboard';
  if (/focus|visibility|became hidden|became visible|switch.*tab|tab.*switch/.test(label)) return 'tabs';
  if (/viewport|resolution|resiz/.test(label)) return 'resolution';
  if (scope === 'display') return 'display';
  if (/swipe/.test(label)) return 'swipe';
  if (/\bclick/.test(label)) return 'clicks';
  if (/network/.test(scope) || /network|connection|online|offline|request metadata/.test(label)) return 'network';
  if (/fingerprint/.test(scope) || /fingerprint|canvas|grouping hash|render hash|webgl|gpu hint|font width/.test(label)) return 'fingerprint';
  if (/performance/.test(scope) || /performance|long task|heap|page load|paint|resource timing/.test(label)) return 'performance';
  if (/pointer|mouse|wheel|scroll|keyboard|touch interrupted|touches in page/.test(label)) return 'pointer';
  if (/browser/.test(scope)) return 'browser';
  if (/device/.test(scope) || /device preference|battery|sensor|motion|orientation/.test(label)) return 'device';
  if (/display/.test(scope) || /fullscreen|screen dimensions|screen area|pixel ratio|color depth|colour depth/.test(label)) return 'display';
  if (/permission|camera|microphone|\blocation\b|geolocation|bluetooth|notification|wake lock|\b(usb|serial|hid|midi|contacts|accelerometer|gyroscope|magnetometer)\b|installed fonts|local fonts|audio output|choose local files|choose a folder|persistent site storage|embedded storage access|multiple screens|device idle status/.test(label)) return 'permissions';
  if (/browser|locale|user agent|time zone|referrer|cookies|history/.test(label)) return 'browser';
  return 'session';
}

function valueText(value) {
  if (value === null || value === undefined) return 'Not exposed';
  if (typeof value !== 'object') return String(value);
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, item) => {
      if (!item || typeof item !== 'object') return item;
      if (seen.has(item)) return '[Circular]';
      seen.add(item);
      if (Array.isArray(item)) return item;
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
    });
  } catch { return String(value); }
}

const duplicateActionReading = (group, key) => {
  if (!['activity', 'clipboard'].includes(normalize(group))) return false;
  return /^(clicks in this page|keyboard events|scroll samples|touch swipes|page copy cut paste|screenshot key signals|last click target|last clipboard action|last event formats|last screenshot signal|last page swipe|page focus|page visibility)$/.test(normalize(key));
};

function sampleInterval(group, key) {
  const scope = normalize(group);
  const label = normalize(key);
  if (/last successful check|timestamp/.test(label)) return 15000;
  if (/sensor reading|sound level/.test(label)) return 1000;
  if (/visible session time|active session estimate|elapsed|session duration/.test(label)) return 15000;
  if (scope === 'performance') return 5000;
  if (scope === 'activity' || scope === 'clipboard') return 1000;
  return 0;
}

export function createEvidenceStore({ maxEntries = 600, now = () => Date.now() } = {}) {
  const limit = Number.isFinite(maxEntries) ? Math.max(0, Math.floor(maxEntries)) : 600;
  let nextId = 1;
  let totalEvents = 0;
  let activityEvents = 0;
  let startupFinished = false;
  let startupEvents = 0;
  let frozenStartup = null;
  const counts = Object.fromEntries([...CATEGORIES, 'copy', 'cut', 'paste'].map(category => [category, 0]));
  const entries = [];
  const readings = new Map();
  const startupReadings = new Map();

  const timestamp = () => {
    const input = now();
    const value = input instanceof Date ? input.getTime() : Number(input);
    return Number.isFinite(value) ? value : 0;
  };
  const isContext = entry => entry.kind === 'context' || /^(baseline observation started|local fingerprint sample ready|observatory session started|request metadata surfaced|evidence feed cleared)$/.test(normalize(entry.title));
  const isActivity = entry => !entry.signal && !isContext(entry) && !['permission', 'unavailable'].includes(entry.kind) && entry.category !== 'permissions' && !/^synthetic\b/.test(normalize(entry.title));
  const copyEntry = entry => ({ ...entry });

  function append(title, detail, kind, meta, at) {
    const category = canonicalCategory(meta.category) || classify(title, detail, meta.group, meta.key);
    const startup = typeof meta.startup === 'boolean' ? meta.startup : meta.phase ? meta.phase === 'startup' : !startupFinished;
    const entry = {
      id: `e${nextId++}`,
      title: String(title ?? ''),
      detail: String(detail ?? ''),
      kind: String(kind || 'observed'),
      category,
      time: new Date(at).toISOString(),
      startup,
      ...(meta.signal ? { signal: true } : {}),
      ...(meta.source ? { source: String(meta.source) } : {}),
    };
    totalEvents += 1;
    if (!startupFinished && startup && !entry.signal) startupEvents += 1;
    if (isActivity(entry)) {
      activityEvents += 1;
      counts[category] += 1;
      if (category === 'clipboard') {
        const action = normalize(entry.title).match(/(?:^| )(copy|cut|paste)(?: |$)/)?.[1];
        if (action) counts[action] += 1;
      }
    }
    entries.unshift(entry);
    if (entries.length > limit) entries.length = limit;
    return copyEntry(entry);
  }

  function add(title, detail, kind = 'observed', meta = {}) {
    return append(title, detail, kind, meta || {}, timestamp());
  }

  function capture(group, key, value, options = {}) {
    const scope = String(group ?? 'browser').toLowerCase();
    const label = String(key ?? 'Reading');
    const id = `${scope}:${label}`;
    const text = valueText(value);
    const kind = String(options.kind || 'observed');
    const note = String(options.note || '');
    const signature = `${text}\u0000${kind}\u0000${note}\u0000${options.source||''}`;
    const previous = readings.get(id);
    if (previous?.signature === signature) return undefined;
    const at = timestamp();
    const startup = !startupFinished;
    const category = canonicalCategory(options.category) || classify(label, text, scope, label);
    const reading = { signature, emittedAt: previous?.emittedAt ?? -Infinity };
    readings.set(id, reading);
    if (startup && !['unavailable','context'].includes(kind) && scope !== 'boundaries') {
      startupReadings.set(id, { key: label, group: scope });
    }
    // Initial readings are useful evidence. Later action-count updates duplicate
    // explicit action entries and are kept in the live inventory instead.
    if (previous && duplicateActionReading(scope, label)) return undefined;
    const minimumInterval = sampleInterval(scope, label);
    if (previous && at - previous.emittedAt < minimumInterval) return undefined;
    reading.emittedAt = at;
    const title = `${label}${previous ? ' changed' : ' available'}`;
    const detail = `${text}${note ? ` · ${note}` : ''}`;
    return append(title, detail, kind, { category, startup, signal: true, source: options.source, group: scope, key: label }, at);
  }

  function finishStartup() {
    if (!startupFinished) {
      frozenStartup = { readings: startupReadings.size, events: startupEvents, samples: [...startupReadings.values()].slice(0, 12).map(reading => reading.key) };
      startupFinished = true;
    }
    return summary();
  }

  function query({ mode = 'normal', categories = [], kinds = [], search = '', showStartup = true, includeContext = true } = {}) {
    const requestedCategories = (Array.isArray(categories) ? categories : [categories]).filter(category => category !== undefined && category !== null && category !== '');
    const selected = new Set(requestedCategories.map(canonicalCategory).filter(Boolean));
    const selectedKinds = new Set(Array.isArray(kinds) ? kinds : [kinds]);
    const terms = normalize(search).split(' ').filter(Boolean);
    return entries.filter(entry => {
      if (!showStartup && entry.startup) return false;
      if (!includeContext && isContext(entry)) return false;
      if (!['expert','extensive'].includes(mode) && (!EVERYDAY.has(entry.category) || !isActivity(entry))) return false;
      if (selectedKinds.size && !selectedKinds.has(entry.kind)) return false;
      if (requestedCategories.length && !selected.has(entry.category)) return false;
      if (!terms.length) return true;
      const clipboardAction = entry.category === 'clipboard' ? normalize(entry.title).match(/(?:^| )(copy|cut|paste)(?: |$)/)?.[1] : undefined;
      const haystack = normalize(`${entry.title} ${entry.detail} ${entry.kind} ${entry.category} ${ALIASES[entry.category] || ''} ${CLIPBOARD_ALIASES[clipboardAction] || ''}`);
      return terms.every(term => haystack.includes(term));
    }).map(copyEntry);
  }

  function summary() {
    return {
      totalEvents,
      activityEvents,
      counts: { ...counts },
      startupReadings: frozenStartup?.readings ?? startupReadings.size,
      startupEvents: frozenStartup?.events ?? startupEvents,
      startupFinished,
      startupSamples: frozenStartup ? [...frozenStartup.samples] : [...startupReadings.values()].slice(0, 12).map(reading => reading.key),
      retained: entries.length,
    };
  }

  function clearLog() { entries.length = 0; }

  function reset() {
    entries.length = 0;
    readings.clear();
    startupReadings.clear();
    nextId = 1;
    totalEvents = 0;
    activityEvents = 0;
    startupFinished = false;
    startupEvents = 0;
    frozenStartup = null;
    for (const category of Object.keys(counts)) counts[category] = 0;
  }

  return { add, capture, query, summary, finishStartup, reset, clearLog };
}
