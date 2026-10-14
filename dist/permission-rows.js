// Stable, accessible demo controls. These switches stop this lab's use of a
// capability; saved browser grants are managed in the browser's site settings.
let mountSequence = 0;

export function mountPermissionRows({ container, lab, onRequest = () => {}, onInspect, onError = () => {} }) {
  if (!container || !lab?.items || typeof lab.readState !== 'function') throw new TypeError('A container and permission lab are required.');
  const doc = container.ownerDocument || document;
  const instance = `permission-rows-${++mountSequence}`;
  const rows = new Map();
  const removers = [];
  let disposed = false;
  let options = { search: '', filter: 'all' };

  const make = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const text = (element, value) => { const next = String(value ?? ''); if (element.textContent !== next) element.textContent = next; };
  const attr = (element, name, value) => { const next = String(value); if (element.getAttribute(name) !== next) element.setAttribute(name, next); };
  const hide = (element, value) => { if (element.hidden !== value) element.hidden = value; };
  const listen = (element, type, callback) => {
    element.addEventListener(type, callback);
    removers.push(() => element.removeEventListener(type, callback));
  };
  const report = (error, item) => {
    if (disposed) return;
    try { onError(error, item); } catch { /* A UI callback must not interrupt cleanup. */ }
  };
  const stateFor = item => {
    try { return lab.readState(item.id); }
    catch (error) { report(error, item); return { status: 'error', supported: false, active: false, detail: 'The experiment state is unavailable.' }; }
  };
  const switchedOn = state => !!state.active || state.status === 'granted';
  const pending = state => state.status === 'requesting';
  const summarizeState = state => {
    const detail = state.detail || '';
    if (pending(state)) return `Request pending. Switch again to cancel. ${detail}`;
    if (state.active) return `Live demo on. ${detail}`;
    if (state.status === 'granted') return `Snapshot complete; no ongoing sampling. ${detail}`;
    if (state.status === 'denied') return `Demo off — blocked or denied. ${detail}`;
    if (!state.supported || state.status === 'unsupported') return `Unavailable here. ${detail}`;
    if (state.status === 'error') return `Demo off — could not start. ${detail}`;
    if (state.status === 'stopped') return `Demo off. ${detail}`;
    return detail || 'Demo off. No request has been made.';
  };

  function updatePreview(row, state) {
    if (!row.video) return;
    const stream = lab.getPreview?.(row.item.id) || null;
    const visible = !!stream && (row.details.open || state.active);
    hide(row.preview, !visible);
    if (stream && visible) {
      if (row.video.srcObject !== stream) {
        row.video.srcObject = stream;
        const playing = row.video.play?.();
        playing?.catch?.(() => {});
      }
    } else if (row.video.srcObject) {
      row.video.pause?.();
      row.video.srcObject = null;
    }
  }

  function updateRow(row) {
    const { item } = row;
    const state = stateFor(item);
    const on = switchedOn(state);
    const waiting = pending(state);
    attr(row.element, 'data-status', state.status);
    row.element.classList.toggle('is-active', !!state.active);
    row.element.classList.toggle('is-granted', state.status === 'granted');
    row.element.classList.toggle('is-pending', waiting);
    row.element.classList.toggle('is-unsupported', !state.supported);
    row.switch.classList.toggle('on', on);
    row.switch.classList.toggle('pending', waiting);
    if (row.switch.disabled !== !state.supported) row.switch.disabled = !state.supported;
    attr(row.switch, 'aria-checked', on);
    attr(row.switch, 'aria-busy', waiting);
    attr(row.switch, 'aria-label', waiting ? `${item.title} demo — cancel pending request` : !state.supported ? `${item.title} demo unavailable` : `${item.title} demo`);
    attr(row.switch, 'aria-disabled', !state.supported);
    attr(row.switch, 'title', !state.supported ? state.detail || 'Unavailable in this browser.' : waiting ? `Cancel ${item.title} request` : on ? `Stop ${item.title} demo; saved browser permission remains` : `Try ${item.title} demo`);
    text(row.switchLabel, !state.supported ? 'Unavailable' : waiting ? 'Cancel' : on ? 'On' : 'Off');
    attr(row.state, 'class', `permission-status ${state.status}`);
    text(row.state, summarizeState(state));
    hide(row.checkNow, item.id !== 'clipboard' || !state.active || waiting);
    const checking = !!state.checking;
    if (row.checkNow.disabled !== checking) row.checkNow.disabled = checking;
    attr(row.checkNow, 'aria-busy', checking);
    text(row.checkNow, checking ? 'Checking…' : 'Check now');
    hide(row.retry, !state.supported || state.active || waiting || !['granted', 'denied', 'error'].includes(state.status));
    text(row.retry, state.status === 'granted' ? 'Run again' : 'Try again');
    if (row.actionPending && !waiting && !checking) {
      row.actionPending = false;
      text(row.feedback, state.active ? row.actionType === 'check' ? 'Clipboard check completed. Format and comparison metadata appear in Details.' : 'Demo started. Readings appear in Details and Live signals.' : state.status === 'granted' ? 'Snapshot ready. Open Details to inspect the result.' : state.status === 'stopped' ? 'Demo stopped. Saved browser permissions remain in site settings.' : state.status === 'denied' || state.status === 'error' ? `Request could not complete. ${state.detail}` : state.detail || 'No access was opened.');
    }
    updatePreview(row, state);
    return state;
  }

  function matches(item, state) {
    const needle = options.search.trim().toLowerCase();
    const haystack = `${item.title} ${item.category} ${item.description} ${(item.opens || []).join(' ')}`.toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
    switch (options.filter) {
      case 'supported': return !!state.supported;
      case 'unsupported': return !state.supported;
      case 'active': return switchedOn(state) || pending(state);
      case 'on': return switchedOn(state) || pending(state);
      case 'off': return !switchedOn(state) && !pending(state);
      case 'granted': return state.status === 'granted';
      case 'requesting': return pending(state);
      case 'all': return true;
      default: return state.status === options.filter || String(item.category).toLowerCase() === options.filter;
    }
  }

  function renderCurrent() {
    if (disposed) return { visible: 0, total: rows.size };
    let visible = 0;
    for (const row of rows.values()) {
      const state = updateRow(row);
      const show = matches(row.item, state);
      hide(row.element, !show);
      if (show) visible++;
    }
    return { visible, total: rows.size };
  }

  function request(item) {
    if (disposed) return;
    const state = stateFor(item);
    if (!state.supported) return;
    const row = rows.get(item.id);
    const action = ++row.actionVersion;
    row.actionPending = true;
    row.actionType = state.active && item.id === 'clipboard' ? 'check' : 'request';
    hide(row.feedback, false);
    text(row.feedback, state.active && item.id === 'clipboard' ? 'Checking the clipboard while this page has focus…' : 'Opening the browser request. Approve or cancel it in your browser.');
    // A notification callback is presentation-only; it cannot accidentally gate
    // the real browser action or consume it by delaying with an awaited result.
    try { onRequest(item); } catch (error) { report(error, item); }
    try {
      // Keep run in the click's synchronous call stack. Choosers and browser
      // permission dialogs must receive the original transient user activation.
      const result = lab.run(item.id);
      const requestId = stateFor(item).requestId;
      renderCurrent();
      Promise.resolve(result).then(() => {
        if (disposed || row.actionVersion !== action) return;
        const final = stateFor(item);
        if (requestId !== undefined && final.requestId !== requestId) return;
        if (final.status === 'denied' || final.status === 'error') {
          const error = new Error(final.detail || 'The browser could not start this demo.');
          error.name = final.status === 'denied' ? 'PermissionDeniedError' : 'CapabilityError';
          report(error, item);
          row.details.open = true;
        }
        renderCurrent();
      }, error => {
        report(error, item);
        row.actionPending = false;
        text(row.feedback, `Request could not complete. ${error?.message || error?.name || 'Browser restriction.'}`);
        if (!disposed) renderCurrent();
      });
    } catch (error) {
      report(error, item);
      row.actionPending = false;
      text(row.feedback, `Request could not complete. ${error?.message || error?.name || 'Browser restriction.'}`);
      renderCurrent();
    }
  }

  for (const item of lab.items) {
    const row = { item, readingNodes: new Map(), actionVersion: 0, actionPending: false };
    row.element = make('article', 'permission-row');
    row.element.dataset.permissionId = item.id;
    const main = make('div', 'permission-row-main');
    const copy = make('div', 'permission-row-copy');
    const heading = make('div', 'permission-row-heading');
    const title = make('h3', 'permission-row-title', item.title);
    title.id = `${instance}-${item.id}-title`;
    heading.append(title, make('span', 'permission-category', item.category));
    row.description = make('p', 'permission-row-description', item.description);
    row.description.id = `${instance}-${item.id}-description`;
    row.state = make('p', 'permission-status');
    row.state.id = `${instance}-${item.id}-state`;
    row.feedback = make('p', 'permission-status permission-action-feedback');
    row.feedback.setAttribute('role', 'status');
    row.feedback.setAttribute('aria-live', 'polite');
    row.feedback.setAttribute('aria-atomic', 'true');
    row.feedback.hidden = true;
    copy.append(heading, row.description, row.state, row.feedback);
    const controls = make('div', 'permission-row-controls');
    row.switch = make('button', 'permission-switch');
    row.switch.type = 'button';
    row.switch.setAttribute('role', 'switch');
    row.switch.setAttribute('aria-describedby', `${row.description.id} ${row.state.id}`);
    const track = make('span', 'permission-switch-track');
    track.setAttribute('aria-hidden', 'true');
    track.append(make('span', 'permission-switch-thumb'));
    row.switchLabel = make('span', 'permission-switch-label', 'Off');
    row.switchLabel.setAttribute('aria-hidden', 'true');
    row.switch.append(track, row.switchLabel);
    row.checkNow = make('button', 'permission-extra permission-check', 'Check now');
    row.checkNow.type = 'button';
    row.checkNow.hidden = true;
    row.checkNow.setAttribute('aria-label', `Check ${item.title.toLowerCase()} now`);
    row.retry = make('button', 'permission-extra permission-retry', 'Run again');
    row.retry.type = 'button';
    row.retry.setAttribute('aria-label', `Run ${item.title.toLowerCase()} demo again`);
    row.retry.hidden = true;
    controls.append(row.switch, row.checkNow, row.retry);
    main.append(copy, controls);
    row.details = make('details', 'permission-row-details');
    const summary = make('summary', 'permission-extra', 'Details');
    summary.setAttribute('aria-label', `Details for ${item.title}`);
    row.details.append(summary);
    const detailBody = make('div', 'permission-detail-body');
    detailBody.id = `${instance}-${item.id}-details`;
    summary.setAttribute('aria-controls', detailBody.id);
    detailBody.append(make('strong', 'permission-detail-heading', 'What this makes available'));
    const opens = make('ul', 'permission-opens');
    for (const value of item.opens || []) opens.append(make('li', '', value));
    detailBody.append(opens, make('p', 'permission-limits', item.limits));
    detailBody.append(make('p', 'permission-control-note', 'The switch controls this local demo. Switching it off stops this demo; saved browser grants remain in site settings. Completed snapshots are historical readings, not ongoing monitoring.'));
    const links = make('div', 'permission-detail-actions');
    const inspect = make('button', 'permission-extra permission-inspect', 'See live readings ↗');
    inspect.type = 'button';
    inspect.setAttribute('aria-label', `Inspect live readings for ${item.title}`);
    links.append(inspect);
    if (item.source) {
      const source = make('a', 'permission-extra permission-source', 'Platform documentation ↗');
      source.href = item.source; source.target = '_blank'; source.rel = 'noopener noreferrer';
      links.append(source);
    }
    detailBody.append(links, make('strong', 'permission-detail-heading', 'Latest readings'));
    row.readings = make('dl', 'permission-readings');
    row.noReadings = make('p', 'permission-no-readings', 'No readings from this demo yet.');
    detailBody.append(row.noReadings, row.readings);
    row.details.append(detailBody);
    row.element.append(main, row.details);
    if (item.id === 'camera' || item.id === 'display') {
      row.preview = make('div', 'permission-preview-wrap');
      row.preview.hidden = true;
      row.preview.append(make('p', 'permission-preview-caption', `${item.title} preview · local only · no recording or upload`));
      row.video = make('video', 'permission-preview permission-preview-video media-preview');
      row.video.muted = true; row.video.autoplay = true; row.video.playsInline = true;
      row.video.setAttribute('aria-label', `${item.title} local preview`);
      row.preview.append(row.video);
      row.element.append(row.preview);
    }
    listen(row.switch, 'click', () => {
      if (disposed) return;
      const state = stateFor(item);
      if (!state.supported) return;
      if (switchedOn(state) || pending(state)) {
        row.actionVersion++;
        row.actionPending = false;
        try { lab.stop(item.id); } catch (error) { report(error, item); }
        hide(row.feedback, false);
        text(row.feedback, pending(state) ? 'Pending demo cancelled. An open browser prompt may still need to be dismissed.' : 'Demo stopped. Saved browser permissions remain in site settings.');
        renderCurrent();
      } else request(item);
    });
    listen(row.checkNow, 'click', () => request(item));
    listen(row.retry, 'click', () => request(item));
    listen(inspect, 'click', () => {
      if (disposed) return;
      try {
        if (typeof onInspect === 'function') onInspect(item);
        else { row.details.open = true; row.readings.tabIndex = -1; row.readings.focus?.(); }
      } catch (error) { report(error, item); }
    });
    listen(row.details, 'toggle', () => {
      if (disposed) return;
      attr(summary, 'aria-expanded', row.details.open);
      updatePreview(row, stateFor(item));
    });
    summary.setAttribute('aria-expanded', 'false');
    rows.set(item.id, row);
    container.append(row.element);
  }

  function render(nextOptions) {
    if (nextOptions) options = { search: String(nextOptions.search ?? ''), filter: String(nextOptions.filter ?? 'all').toLowerCase() };
    return renderCurrent();
  }

  function displayValue(value) {
    if (value === undefined) return 'Not supplied';
    if (value === null) return 'Not supplied';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function updateReadings(signalsArray) {
    if (disposed) return;
    const permitted = (signalsArray || []).filter(signal => String(signal.group || '').trim().toLowerCase() === 'permissions');
    for (const row of rows.values()) {
      const prefix = `${row.item.title} · `;
      const readings = permitted.filter(signal => String(signal.key || '').startsWith(prefix)).sort((a, b) => {
        const time = value => typeof value === 'number' ? value : Date.parse(value || '') || 0;
        return time(b.updatedAt || b.timestamp) - time(a.updatedAt || a.timestamp);
      }).slice(0, 3);
      const nextKeys = new Set(readings.map(reading => reading.key));
      for (const [key, entry] of row.readingNodes) {
        if (!nextKeys.has(key)) { entry.element.remove(); row.readingNodes.delete(key); }
      }
      for (const reading of readings) {
        let entry = row.readingNodes.get(reading.key);
        if (!entry) {
          entry = { element: make('div', 'permission-reading'), label: make('dt', ''), value: make('dd', '') };
          entry.element.append(entry.label, entry.value);
          row.readingNodes.set(reading.key, entry);
        }
        text(entry.label, reading.key.slice(prefix.length));
        const fullValue = displayValue(reading.value);
        text(entry.value, fullValue.length > 220 ? `${fullValue.slice(0, 217)}…` : fullValue);
        attr(entry.value, 'title', fullValue.length > 220 ? 'Open live readings to inspect the full value.' : fullValue);
        // Append only if ordering changed. Stable nodes retain focus and selection.
        const targetIndex = readings.indexOf(reading);
        if (row.readings.children[targetIndex] !== entry.element) row.readings.insertBefore(entry.element, row.readings.children[targetIndex] || null);
      }
      hide(row.noReadings, readings.length !== 0);
    }
  }

  render();
  if (typeof lab.subscribe === 'function') removers.push(lab.subscribe(renderCurrent));
  return {
    render, updateReadings,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of removers.splice(0)) remove();
      for (const row of rows.values()) {
        if (row.video) { row.video.pause?.(); row.video.srcObject = null; }
        row.element.remove();
      }
      rows.clear();
    },
  };
}
