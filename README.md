# Observatory — Browser Privacy Lab

**Live website: [ia582.brighton.domains/observatory](https://ia582.brighton.domains/observatory/)**

A browser privacy education website that shows what a page can observe about your browser, device and activity, then lets you try individual permission-gated capabilities. Hosted on Brighton Domains using Apache and PHP. No account, dependency installation or frontend build is required.

## Explore the live website

1. Open the [live demo](https://ia582.brighton.domains/observatory/) and choose Computer or Mobile.
2. Enter with no new permission requests. Previously saved browser grants may still exist; protected demos do not start automatically.
3. Watch the large live evidence feed. Use **Filter & settings** to search, select a category or switch Basic mode off for Extensive mode.
4. Scroll down to the activity totals, first-second startup snapshot, page checks and compact permission switches.
5. Turn on an experiment to request access through the browser. Expand Details to understand what access opens, what remains hidden and the latest captured readings.
6. Turn demos off to stop their collection, export a local JSON report, or end and reset the session.

Choosing Mobile changes the guidance; it does not claim to detect your hardware. Available features depend on the browser, operating system, device and browser policy.

## Features

- **Live evidence first:** actions, clues and changed readings, with category and text filters. Searches support aliases such as copied, snipping, tab switch and resize.
- **Basic / Extensive:** Basic shows clicks, actual copy/cut/paste events, screenshot shortcut clues, focus changes, swipes and resizing. Extensive includes browser/device/network readings, permission results and integrity hints. Modes and filters affect display only.
- **Independent counters:** signal snapshots do not count as user actions. Lifetime counters survive filtering and feed clearing. They include events no longer retained in the feed.
- **Startup snapshot:** available signals and non-reading event entries captured during the first second after entering the dashboard are frozen separately. Event entries can include session metadata; they are not all human actions.
- **Live inventory:** current browser, device, display, network, performance, activity and permission readings with explanations and source links.
- **Permission experiments:** camera, microphone, location, clipboard, screen sharing, notifications, device sensors, Bluetooth/USB/HID/serial, files/folders, fonts, fullscreen and other supported capabilities.
- **Page and JavaScript checks:** watched API reference changes, added script elements, selected attribute changes and exposed extension URL scheme hints.
- **Fingerprint demonstrations:** local rendering/configuration hashes with explicit limits; no identity or population uniqueness claims.
- **Local export and reset:** a JSON report downloads only when clicked. No observation database or analytics service.

The feed retains the latest **600 entries**. Unchanged values, duplicate action-count updates and some high-frequency readings are omitted or sampled. The inventory retains the latest surfaced value independently. Export includes retained evidence plus lifetime summary counts, not an unlimited history.

## Permission switch behavior

Switches control this demo's use of a capability, not saved grants in browser settings. Turning off stops live collection without erasing readings already captured. Revoke saved grants through the browser's site settings.

Pending requests can be cancelled in the demo; an already-open native browser prompt may still need dismissal. Denial leaves the demo off. Completed one-off checks show an On snapshot with no ongoing sampling. Live streams/watchers remain On until stopped or released by the browser. Camera and screen previews stay local; microphone sound level is measured without recording audio.

## Honest limits

- A normal webpage cannot reliably confirm that a screenshot happened, especially OS shortcuts such as Windows+Shift+S. Screenshot clues and clipboard image changes have other explanations.
- Ctrl+C alone does not prove copying. An actual document copy event is recorded separately. Clipboard contents are never read in baseline mode. The optional clipboard experiment compares bounded local fingerprints and formats; payloads and content fingerprints are not shown or exported.
- Focus/visibility changes do not identify the other application, tab, notification shade or task switcher. Browsers may suspend background execution; there is no continuous view of activity outside the page.
- Browser extensions are not comprehensively enumerable. Exposed extension schemes are only hints, with no extension IDs or paths logged.
- Integrity checks cover ordinary DOM in the top document and a small set of API references captured at module load. Shadow roots, iframe documents, workers and isolated extension worlds are not traversed. Changes before the baseline and many other modifications are invisible. A script element does not prove execution, and a changed reference does not identify its cause.
- Browser values may be rounded, spoofed, randomized, unavailable or shared by many people. Fingerprint hashes do not prove identity or uniqueness. Trusted event provenance does not prove a human generated an action.

## Privacy and hosting

Readings and sampled events stay in page memory. There are no third-party scripts, remote fonts, advertising pixels, analytics services, accounts, session databases or persistent tracking identifiers. The demo does not upload camera/screen/audio, typed text, clipboard payloads, selected-file contents or the evidence feed.

Like any website, the hosting infrastructure receives ordinary HTTP request metadata and **may retain access logs**. The same-origin `api/context.php` endpoint reflects the current request's connection address and a limited allowlist of headers to that visitor. It writes no files, database records or application logs, contacts no external IP service, never returns cookie values or authorization headers, and sends no CORS permission. A connection address may belong to a VPN, proxy or shared network.

An explicit JSON export may contain personal readings from demos the visitor enabled. Reloading or ending a session clears page memory; browser grants and downloaded exports may remain.

## Run locally

Requires Node.js 20 or newer. There are no dependencies to install.

```sh
node server.cjs
```

Open [localhost:5173](http://localhost:5173). The server binds only to `127.0.0.1`. It implements the same metadata response in Node, so PHP is not needed for local testing. Local requests show a loopback address rather than a public-facing address.

```sh
npm test
```

Tests cover evidence startup freezing, filters/search aliases, counters/retention/reset, reading deduplication/sampling and clipboard event provenance/payload restrictions. Browser QA covered desktop/mobile layout, feed filters, resizing, fullscreen On/Off, reset and export. Personal-data permission prompts are left for the visitor to approve explicitly.

## Deploy to Brighton Domains / cPanel

Production files are the **contents of `dist/`**, including hidden `.htaccess` and `api/context.php`. Do not upload the repository, `.git`, tests or Node server into the public web directory.

1. Back up any deployment being replaced.
2. Package the contents of `dist/` inside an `observatory/` folder in a ZIP. Include `.htaccess` and the `api/` folder.
3. In cPanel File Manager, upload the ZIP to your home directory, outside `public_html`.
4. Extract it into `public_html`. This creates `public_html/observatory/` without replacing other coursework or the domain homepage.
5. Open the HTTPS URL and check the page, JS/CSS assets and `observatory/api/context.php`.

PHP 7.2+ is required for the metadata endpoint; use a supported PHP version supplied by the host. Apache `.htaccess` config supplies HTTPS redirection, a self-only content security policy, no-store responses, no directory listing and denial of common archive/log/config backup file extensions. A valid HTTPS certificate is necessary for protected browser APIs. When deploying on a different domain, change the HTTPS redirect host in `dist/.htaccess` and the homepage links in this README and `package.json`.

[Official cPanel File Manager documentation](https://docs.cpanel.net/cpanel/files/file-manager/)

## Source layout

- `dist/index.html` — onboarding, overview, live inventory and educational views.
- `dist/app.js` — session lifecycle, navigation, filters, counters and export.
- `dist/evidence.js` — bounded evidence store, sampling, search and startup snapshot.
- `dist/sensors.js` — permission-free baseline readings and page activity handlers.
- `dist/integrity.js` — narrow script/attribute/reference/extension-scheme hints.
- `dist/permissions.js` — explicit capability experiments and resource cleanup.
- `dist/permission-rows.js` — accessible stable switches, details and local previews.
- `dist/learn.js` — sourced explanations and browser boundaries.
- `dist/style.css`, `dist/plain.css`, `dist/permission-readings.css` — responsive UI.
- `dist/api/context.php` — limited same-origin request-metadata reflection for PHP hosting.
- `dist/.htaccess` — Apache hosting rules.
- `server.cjs` — dependency-free loopback development server.
- `tests/` — focused Node tests.