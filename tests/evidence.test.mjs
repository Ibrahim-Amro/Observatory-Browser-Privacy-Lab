import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Import without relying on the surrounding directory's package.json mode.
const source = await readFile(new URL('../dist/evidence.js', import.meta.url), 'utf8');
const { createEvidenceStore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let clock = 1000;
const store = createEvidenceStore({ now: () => clock });

const first = store.capture('browser', 'User agent', 'Demo browser');
assert.equal(first.startup, true);
assert.equal(first.signal, true);
assert.equal(first.category, 'browser');
assert.equal(first.time, '1970-01-01T00:00:01.000Z');
assert.equal(store.capture('browser', 'User agent', 'Demo browser'), undefined);
store.capture('display', 'Screen dimensions', '1920 × 1080');
store.capture('boundaries', 'Screenshots', 'Not readable', { kind: 'unavailable' });
store.capture('device', 'No sensor', 'Unavailable', { kind: 'unavailable' });
store.add('Session started', 'No new grants', 'context');
store.add('Page click', 'Click 1 on a button element.');
store.add('Page copy event', 'Contents were not read.');
store.add('Page cut event', 'Contents were not read.');
store.add('Page paste event', 'Contents were not read.');
store.add('Possible screenshot shortcut', 'Does not confirm a screenshot.', 'estimate');
store.add('Page lost focus', 'Destination unknown.');
store.add('Viewport changed', 'New size; cause is unknown.');
store.add('Page swipe', 'Down gesture in this page.', 'estimate');
store.add('Pointer sample', '8, 16');
store.add('Camera', 'Access granted', 'permission', { category: 'permissions' });

const startup = store.finishStartup();
assert.equal(startup.startupReadings, 2);
assert.equal(startup.startupEvents, 11);
assert.equal(startup.activityEvents, 9);
assert.equal(startup.counts.clicks, 1);
assert.equal(startup.counts.clipboard, 3);
assert.equal(startup.counts.copy, 1);
assert.equal(startup.counts.cut, 1);
assert.equal(startup.counts.paste, 1);
assert.equal(startup.counts.screenshot, 1);
assert.equal(startup.counts.tabs, 1);
assert.equal(startup.counts.resolution, 1);
assert.equal(startup.counts.swipe, 1);
assert.deepEqual(startup.startupSamples, ['User agent', 'Screen dimensions']);

const basic = store.query();
assert.equal(basic.length, 8);
assert.ok(basic.every(entry => !entry.signal));
assert.equal(store.query({ mode: 'extensive' }).length, 15);
assert.equal(store.query({ search: 'copied' }).length, 1);
assert.equal(store.query({ search: 'copied' })[0].title, 'Page copy event');
assert.equal(store.query({ search: 'resolution' })[0].title, 'Viewport changed');
assert.equal(store.query({ search: 'switch tabs' })[0].title, 'Page lost focus');
assert.equal(store.query({ categories: ['clipboard'] }).length, 3);
assert.equal(store.query({ categories: ['focus-tab'] }).length, 1);
assert.equal(store.query({ mode: 'extensive', includeContext: false }).length, 14);
assert.equal(store.query({ showStartup: false }).length, 0);

clock += 1000;
store.capture('browser', 'Primary language', 'en');
store.add('Page click', 'Click 2 on a button element.');
assert.equal(store.query({ showStartup: false }).length, 1);
assert.equal(store.summary().startupReadings, 2);
assert.equal(store.summary().startupEvents, 11);
assert.deepEqual(store.finishStartup().startupSamples, startup.startupSamples);
assert.equal(store.summary().counts.clicks, 2);

// Mutating returned objects must not mutate stored records or counters.
const retrieved = store.query();
retrieved[0].title = 'Tampered';
const stats = store.summary();
stats.counts.clicks = -1;
stats.startupSamples.push('Tampered');
assert.notEqual(store.query()[0].title, 'Tampered');
assert.equal(store.summary().counts.clicks, 2);
assert.equal(store.summary().startupSamples.length, 2);

const beforeClear = store.summary();
store.clearLog();
assert.equal(store.query({ mode: 'extensive' }).length, 0);
assert.deepEqual({ ...store.summary(), retained: beforeClear.retained }, beforeClear);
assert.equal(store.capture('browser', 'Primary language', 'en'), undefined);
store.add('Page click', 'After clear');
assert.equal(store.summary().counts.clicks, 3);
assert.equal(store.summary().retained, 1);
store.reset();
assert.equal(store.summary().totalEvents, 0);
assert.equal(store.summary().activityEvents, 0);
assert.equal(store.summary().startupReadings, 0);
assert.equal(store.summary().startupEvents, 0);
assert.equal(store.summary().startupFinished, false);
assert.equal(store.summary().counts.clicks, 0);
assert.deepEqual(store.summary().startupSamples, []);

// Retention must never change lifetime counters or startup totals.
const small = createEvidenceStore({ maxEntries: 2, now: () => clock });
small.add('Page click', '1');
small.add('Page click', '2');
small.add('Page click', '3');
assert.equal(small.query().length, 2);
assert.equal(small.query()[0].detail, '3');
assert.equal(small.summary().totalEvents, 3);
assert.equal(small.summary().activityEvents, 3);
assert.equal(small.summary().counts.clicks, 3);
assert.equal(small.finishStartup().startupEvents, 3);
const zero = createEvidenceStore({ maxEntries: 0 });
zero.add('Page click', 'Still counted');
assert.equal(zero.summary().retained, 0);
assert.equal(zero.summary().counts.clicks, 1);

// Changed data is extensive-only. Counter deltas cannot duplicate action adds.
const sampled = createEvidenceStore({ now: () => clock });
sampled.capture('activity', 'Clicks in this page', 0);
sampled.capture('activity', 'Pointer position', '0, 0');
sampled.capture('activity', 'Visible session time', '0s');
sampled.capture('performance', 'JavaScript heap estimate', '10 MiB');
sampled.capture('network', 'Downlink estimate', '10 Mbps');
sampled.capture('browser', 'Object reading', { b: 2, a: 1 });
assert.equal(sampled.capture('browser', 'Object reading', { a: 1, b: 2 }), undefined);
sampled.finishStartup();
clock += 100;
assert.equal(sampled.capture('activity', 'Clicks in this page', 1), undefined);
assert.equal(sampled.capture('activity', 'Pointer position', '8, 8'), undefined);
assert.equal(sampled.capture('activity', 'Visible session time', '1s'), undefined);
assert.equal(sampled.capture('performance', 'JavaScript heap estimate', '11 MiB'), undefined);
assert.ok(sampled.capture('network', 'Downlink estimate', '9 Mbps'));
clock += 1000;
assert.ok(sampled.capture('activity', 'Pointer position', '16, 16'));
assert.equal(sampled.query().length, 0);
assert.equal(sampled.summary().activityEvents, 0);
assert.equal(sampled.summary().counts.clicks, 0);
clock += 15000;
assert.ok(sampled.capture('activity', 'Visible session time', '17s'));
assert.ok(sampled.capture('performance', 'JavaScript heap estimate', '12 MiB'));
assert.equal(sampled.summary().startupReadings, 6);

console.log('Evidence store: startup, filters, aliases, counts, retention, reset, deduplication and throttling passed.');
