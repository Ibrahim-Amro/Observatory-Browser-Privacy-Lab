/** Narrow page-change hints, not an extension scanner or a security verdict. */
const readSafely = read => { try { return { ok: true, value: read() }; } catch { return { ok: false, value: undefined }; } };
const apiDefinitions = [
  ['window.fetch', () => globalThis.window?.fetch],
  ['EventTarget.prototype.addEventListener', () => globalThis.EventTarget?.prototype?.addEventListener],
  ['Document.prototype.createElement', () => globalThis.Document?.prototype?.createElement],
  ['Element.prototype.attachShadow', () => globalThis.Element?.prototype?.attachShadow],
  ['Function.prototype.toString', () => Function.prototype.toString],
  ['JSON.stringify', () => JSON.stringify],
  ['navigator.clipboard.read', () => globalThis.navigator?.clipboard?.read],
];
// Capturing references invokes no API and requests no access. The baseline is
// this module's load time, not a pristine browser or a promise about earlier code.
const moduleApiBaseline = apiDefinitions.map(([name, read]) => ({ name, read, initial: readSafely(read) }));

export function startIntegrity({ setSignal, addEvent }) {
  const source = {
    mutation: 'https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver',
    extensions: 'https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts',
    performance: 'https://developer.mozilla.org/en-US/docs/Web/API/Performance/getEntriesByType',
    functions: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Strict_equality',
  };
  const cleanup = [];
  const emitted = new Map();
  const seenScriptNodes = new WeakSet();
  const seenTimingMarkers = new Map();
  const apiStates = new Map();
  const extensionProtocols = new Set();
  // Origin keys are held only in this closure to count distinct exposed origins.
  // Neither keys nor extension IDs are emitted, exported, persistently stored,
  // or probed. Timing-reference deduplication likewise stays in this closure.
  const extensionOrigins = new Set();
  let stopped = false;
  let flushTimer = null;
  let observer = null;
  let initialScripts = 0;
  let initialExtensionScripts = 0;
  let extensionTimingEntries = 0;
  let extensionScriptChanges = 0;
  let changedApis = 0;
  const counts = { addedScripts: 0, inlineScripts: 0, sameOriginScripts: 0, otherOriginScripts: 0, extensionScripts: 0, scriptAttributes: 0, inlineHandlers: 0, rootDataAttributes: 0 };
  let pending = emptyBatch();
  function emptyBatch() { return { addedScripts: 0, inlineScripts: 0, sameOriginScripts: 0, otherOriginScripts: 0, extensionScripts: 0, scriptAttributes: 0, inlineHandlers: 0, rootDataAttributes: 0 }; }
  function emit(key, value, options = {}) {
    if (stopped) return;
    const meta = { kind: 'observed', note: '', source: source.mutation, ...options };
    const text = String(value);
    const previous = emitted.get(key);
    if (previous?.value === text && previous.kind === meta.kind && previous.note === meta.note) return;
    emitted.set(key, { value: text, ...meta });
    setSignal('integrity', key, text, meta);
  }
  function event(title, detail, kind = 'observed') { if (!stopped) addEvent(title, detail, kind); }
  function owned(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return readSafely(() => Boolean(element?.closest?.('[data-observatory-ui]'))).value === true;
  }
  function isScript(node) { return node?.nodeType === 1 && String(node.tagName).toLowerCase() === 'script'; }
  function extensionProtocol(value) {
    const match = typeof value === 'string' && /^(chrome-extension|moz-extension|safari-extension|safari-web-extension):/i.exec(value);
    if (!match) return null;
    const protocol = `${match[1].toLowerCase()}:`;
    const parsed = readSafely(() => new URL(value));
    if (parsed.ok && parsed.value.host && !parsed.value.username && !parsed.value.password) extensionOrigins.add(`${protocol}//${parsed.value.host.toLowerCase()}`);
    return protocol;
  }
  function scriptKind(node) {
    const result = readSafely(() => node.getAttribute('src'));
    if (!result.ok) return { category: 'otherOriginScripts', label: 'Source unavailable' };
    if (!result.value) return { category: 'inlineScripts', label: 'Inline script element' };
    const protocol = extensionProtocol(result.value);
    if (protocol) { extensionProtocols.add(protocol); return { category: 'extensionScripts', label: protocol }; }
    const parsed = readSafely(() => new URL(result.value, document.baseURI || globalThis.location?.href));
    if (!parsed.ok) return { category: 'otherOriginScripts', label: 'Unparseable external source' };
    const same = parsed.value.origin === globalThis.location?.origin;
    return { category: same ? 'sameOriginScripts' : 'otherOriginScripts', label: same ? 'Same-origin external script' : 'Other-origin external script' };
  }
  function publishCounts() {
    emit('Initial script elements', initialScripts, { note: 'Script elements visible when observation started. This is not a record of all code that has run; module dependencies, removed scripts, workers, and isolated extension worlds are not fully represented.' });
    emit('Added script elements', `${counts.addedScripts} total · ${counts.inlineScripts} inline · ${counts.sameOriginScripts} same origin · ${counts.otherOriginScripts} other origin · ${counts.extensionScripts} extension scheme`, { note: 'Observed additions in the top document after starting; this app creates no script elements during a session. Source relationship only; raw URLs and script contents are not output or exported. Origin keys stay in memory for counting. An added node does not prove that its code executed.' });
    emit('Script attribute changes', counts.scriptAttributes, { note: 'Changes to script src/type/async/defer/integrity/crossorigin/referrerpolicy attributes anywhere in the document. Attribute values and code are not logged; cause and execution are unknown.' });
    emit('Inline handler attribute changes', counts.inlineHandlers, { note: 'Changes to on… HTML attributes anywhere in the document, including app UI. Handler text is never inspected. Listener functions registered with addEventListener are not enumerated.' });
    emit('Document data-attribute changes', counts.rootDataAttributes, { note: 'Only data-attribute mutations on the html/body elements, outside excluded app UI. Values are not inspected. A change may come from ordinary page code, browser tools, or an extension; its cause is unknown.' });
    emit('Extension-scheme script hints', `${initialExtensionScripts} initial references · ${counts.extensionScripts} added references · ${extensionScriptChanges} source changes`, { kind: initialExtensionScripts + counts.extensionScripts + extensionScriptChanges ? 'estimate' : 'observed', note: 'These are script-reference observations, not a count of extensions. Multiple references can share one origin. References do not establish execution, installation, or who changed the page.', source: source.extensions });
    emit('Distinct exposed extension origins', extensionOrigins.size, { note: 'Distinct parseable protocol/host pairs across already-exposed script references and resource timing entries in this session. Three references can share one origin. This is not an installed-extension count or proof of execution. Origin identifiers are held only for in-memory deduplication and are not shown or exported.', source: source.extensions });
    emit('Exposed extension schemes', extensionProtocols.size ? [...extensionProtocols].sort().join(', ') : 'None observed', { kind: extensionProtocols.size ? 'estimate' : 'observed', note: 'Only protocol names are shown; no extension IDs, hosts, paths, or contents. No observed scheme does not mean no extensions exist.', source: source.extensions });
  }
  function flush() {
    if (stopped) return;
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
    const batch = pending;
    pending = emptyBatch();
    const changed = Object.values(batch).some(n => n > 0);
    if (!changed) return;
    for (const key of Object.keys(counts)) counts[key] += batch[key];
    publishCounts();
    if (batch.addedScripts) event('Page script elements added', `${batch.addedScripts} additions: ${batch.inlineScripts} inline, ${batch.sameOriginScripts} same origin, ${batch.otherOriginScripts} other origin, ${batch.extensionScripts} extension scheme. Source and execution are not verified.`);
    if (batch.extensionScripts) event('Extension-origin resource reference observed', `${batch.extensionScripts} added script references use extension URL schemes; ${extensionOrigins.size} distinct exposed origins have been observed across this session. References are not extensions, and do not prove execution. Cause unknown.`, 'estimate');
    if (batch.scriptAttributes || batch.inlineHandlers || batch.rootDataAttributes) event('Page code-related attributes changed', `${batch.scriptAttributes} script attributes, ${batch.inlineHandlers} inline-handler attributes, ${batch.rootDataAttributes} document data attributes. Values were not logged; only script-source metadata was classified. Handler/data values were not read; cause is unknown.`);
  }
  function queueFlush() {
    if (flushTimer === null && !stopped) flushTimer = setTimeout(flush, 700);
  }
  function addedScript(node) {
    if (!isScript(node) || seenScriptNodes.has(node)) return;
    seenScriptNodes.add(node);
    const kind = scriptKind(node);
    pending.addedScripts += 1;
    pending[kind.category] += 1;
  }
  function mutations(records) {
    if (stopped) return;
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes || []) {
          addedScript(node);
          const descendants = readSafely(() => node.querySelectorAll?.('script'));
          if (descendants.ok && descendants.value) for (const script of descendants.value) addedScript(script);
        }
      } else if (record.type === 'attributes') {
        const attribute = String(record.attributeName || '').toLowerCase();
        if (/^on[a-z]/.test(attribute)) pending.inlineHandlers += 1;
        else if (isScript(record.target) && ['src', 'type', 'async', 'defer', 'integrity', 'crossorigin', 'referrerpolicy'].includes(attribute)) {
          pending.scriptAttributes += 1;
          if (attribute === 'src' && scriptKind(record.target).category === 'extensionScripts') extensionScriptChanges += 1;
        } else if (!owned(record.target) && (record.target === document.documentElement || record.target === document.body) && attribute.startsWith('data-') && !attribute.startsWith('data-observatory-')) pending.rootDataAttributes += 1;
      }
    }
    if (Object.values(pending).some(n => n > 0)) queueFlush();
  }
  function checkApis() {
    let unchanged = 0;
    let unavailable = 0;
    changedApis = 0;
    for (const entry of moduleApiBaseline) {
      const current = readSafely(entry.read);
      const accessible = current.ok && entry.initial.ok;
      const absent = accessible && current.value === undefined && entry.initial.value === undefined;
      const changed = accessible && current.value !== entry.initial.value;
      const state = !accessible || absent ? 'unavailable' : changed ? 'changed' : 'unchanged';
      if (state === 'changed') changedApis += 1;
      else if (state === 'unchanged') unchanged += 1;
      else unavailable += 1;
      emit(`API reference · ${entry.name}`, state === 'changed' ? 'Reference changed since module baseline' : state === 'unchanged' ? 'No reference change observed' : 'Unavailable for comparison', { kind: state === 'unavailable' ? 'unavailable' : 'observed', note: 'Exact reference equality with the module-load snapshot only. The baseline is not a pristine browser. Changes may be legitimate libraries, debugging, polyfills, automation, or extensions. Unchanged references do not prove absence of modification or external control.', source: source.functions });
      const previous = apiStates.get(entry.name);
      if (state === 'changed' && previous !== 'changed') event('Page API reference changed', `${entry.name} now differs from the module-load snapshot. Cause unknown; this does not identify an extension, establish malicious intent, or prove external control.`);
      else if (previous === 'changed' && state === 'unchanged') event('API reference returned to baseline', `${entry.name} again matches the module-load reference. This is not a security verdict.`);
      apiStates.set(entry.name, state);
    }
    emit('API reference comparison', `${unchanged} unchanged · ${changedApis} changed · ${unavailable} unavailable`, { note: 'Fixed small reference sample, checked roughly every 2 seconds while execution is allowed. No native-looking string heuristic or pristine iframe is used; modifications before module loading and many other changes are invisible.', source: source.functions });
  }
  function checkResources() {
    const result = readSafely(() => globalThis.performance?.getEntriesByType?.('resource'));
    if (!result.ok || !result.value) {
      emit('Extension-scheme resource hints', 'Resource timing unavailable', { kind: 'unavailable', note: 'Only already-exposed resource timing entries would be inspected; no resource probing occurs.', source: source.performance });
      return;
    }
    let added = 0;
    const occurrences = new Map();
    for (const entry of result.value) {
      const protocol = extensionProtocol(entry.name);
      if (!protocol) continue;
      // URL keys are private session-memory deduplication data, never output.
      // Include occurrence count so coarsened equal timings do not collapse
      // distinct references or repeated entries into one observation.
      const marker = `${entry.name.length}:${entry.name}|${Number(entry.startTime)}|${Number(entry.duration)}|${String(entry.initiatorType || '')}`;
      const occurrence = (occurrences.get(marker) || 0) + 1;
      occurrences.set(marker, occurrence);
      if (occurrence <= (seenTimingMarkers.get(marker) || 0)) continue;
      seenTimingMarkers.set(marker, occurrence);
      extensionProtocols.add(protocol);
      extensionTimingEntries += 1; added += 1;
    }
    emit('Extension-scheme resource hints', `${extensionTimingEntries} exposed timing entries`, { kind: extensionTimingEntries ? 'estimate' : 'observed', note: 'Inspects existing resource timing records for extension URL schemes only. A record does not establish execution or enumerate extensions. Reference keys are deduplicated only in session memory; raw URLs, IDs, and paths are not logged or exported. No requests or extension-ID probes occur.', source: source.performance });
    if (added) event('Extension-origin resource reference observed', `${added} already-exposed resource timing references use extension schemes; ${extensionOrigins.size} distinct exposed origins have been observed across the session. Timing references and script-node references may describe the same resource and must not be added as an extension count. Execution and cause are unknown.`, 'estimate');
  }
  function checkNow() {
    if (stopped) return summary();
    if (observer?.takeRecords) {
      const queued = readSafely(() => observer.takeRecords());
      if (queued.ok && queued.value?.length) mutations(queued.value);
    }
    flush(); checkApis(); checkResources(); publishCounts();
    return summary();
  }
  function summary() {
    return { stopped, initialScripts, initialExtensionScripts, counts: { ...counts }, changedApis, extensionTimingEntries, extensionScriptChanges, distinctExtensionOrigins: extensionOrigins.size, scriptReferenceObservations: initialExtensionScripts + counts.extensionScripts, resourceReferenceObservations: extensionTimingEntries, extensionProtocols: [...extensionProtocols].sort() };
  }

  const initial = readSafely(() => document.querySelectorAll('script'));
  if (initial.ok && initial.value) for (const script of initial.value) {
    initialScripts += 1;
    seenScriptNodes.add(script);
    if (scriptKind(script).category === 'extensionScripts') initialExtensionScripts += 1;
  }
  emit('Page-change observation scope', 'Script nodes + selected attributes + fixed API references', { kind: 'context', note: 'Script additions, script attributes, and inline-handler attributes are watched in the top document’s ordinary DOM, including app UI. Shadow roots and iframe documents are not traversed. Ordinary text/class/style changes and generic app-owned UI mutations are excluded to avoid self-generated noise. Script text, input values, general DOM content, and handler contents are never read.' });
  emit('Extension / control certainty', 'Cannot establish a complete inventory or control state', { kind: 'context', note: 'Content scripts can run in isolated worlds invisible to page JavaScript. DOM/API changes can have many legitimate causes. No hints does not mean no extensions, automation, injected code, or remote control.', source: source.extensions });
  emit('Changes before baseline', 'Unknown', { kind: 'context', note: 'References are captured at module load, and DOM observation starts with this session. Earlier modifications, removed nodes, isolated worlds, workers, short-lived changes between checks, and modifications to the detector itself may be missed.', source: source.extensions });
  if (typeof globalThis.MutationObserver === 'function') {
    const created = readSafely(() => new MutationObserver(mutations));
    if (created.ok) {
      observer = created.value;
      const observed = readSafely(() => observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true }));
      if (observed.ok) { emit('DOM script observation', 'Active throughout this document', { note: 'Mutation batches are summarized at most once per 700 ms. Only script insertions and selected attributes are reported; routine app UI changes are ignored.' }); cleanup.push(() => observer.disconnect()); }
      else { observer.disconnect(); observer = null; emit('DOM script observation', 'Observation blocked', { kind: 'unavailable', note: 'Mutation observation could not start.' }); }
    } else emit('DOM script observation', 'Observer unavailable', { kind: 'unavailable', note: 'MutationObserver construction failed.' });
  } else emit('DOM script observation', 'Not supported', { kind: 'unavailable', note: 'MutationObserver is not exposed in this browser.' });
  checkNow();
  const timer = setInterval(checkNow, 2000);
  cleanup.push(() => clearInterval(timer));
  return {
    checkNow,
    stop() {
      if (stopped) return;
      flush();
      stopped = true;
      if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
      for (const dispose of cleanup.splice(0)) readSafely(dispose);
    },
  };
}
