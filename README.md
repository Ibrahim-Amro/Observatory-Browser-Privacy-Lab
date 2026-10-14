# Observatory — Browser Privacy Lab

**Live website: [ia582.brighton.domains/observatory](https://ia582.brighton.domains/observatory/)**

A browser privacy education website that shows what a page can observe about your browser, device and activity, then lets you try individual permission-gated capabilities. Hosted on Brighton Domains using Apache and PHP. No account, dependency installation or frontend build is required.

Built by **Ibrahim Amro** · [LinkedIn](https://www.linkedin.com/in/ibrahimamro/) · [Source code](https://github.com/Ibrahim-Amro/Observatory-Browser-Privacy-Lab)

The split welcome screen pairs an animated evidence preview with the introduction and device choice. The preview is explicitly illustrative: its example events are not readings from the visitor's device. **Pause preview / Play preview** controls the animation, and a reduced-motion preference starts it paused. The real observation session begins only after choosing Computer or Mobile and entering the dashboard.

## Explore the live website

1. Open the [live demo](https://ia582.brighton.domains/observatory/) and choose Computer or Mobile.
2. Enter with no new permission requests. Previously saved browser grants may still exist; protected demos do not start automatically.
3. Watch the large live evidence feed. Use **Filter & settings** to search, select a category or switch Basic mode off for Extensive mode.
4. Inspect activity totals, the connection IP and approximate location, the first-second startup snapshot, page checks and compact permission switches. **Check connection** performs a fresh same-origin check.
5. Turn on a supported experiment to request access through the browser. Expand Details to understand what access opens, what remains hidden and the latest captured readings. Unavailable experiments explain their browser, context or policy restriction.
6. Turn demos off to stop their collection, export a local JSON report, or end and reset the session.

Choosing Mobile changes the guidance; it does not claim to detect your hardware. Available features depend on the browser, operating system, device and browser policy.

## Features

- **Illustrative welcome preview:** a looping example evidence feed, with pause/play and reduced-motion support, before any session readings are collected.
- **Live evidence first:** actions, clues and changed readings, with category and text filters. Searches support aliases such as copied, snipping, tab switch and resize.
- **Basic / Extensive:** Basic shows clicks, actual copy/cut/paste events, screenshot shortcut clues, focus changes, swipes and resizing. Extensive includes browser/device/network readings, permission results and integrity hints. Modes and filters affect display only.
- **Independent counters:** signal snapshots do not count as user actions. Lifetime counters survive filtering and feed clearing. They include events no longer retained in the feed.
- **Startup snapshot:** available signals and non-reading event entries captured during the first second after entering the dashboard are frozen separately. Event entries can include session metadata; they are not all human actions.
- **Live inventory:** current browser, device, display, network, performance, activity and permission readings with explanations and source links.
- **Connection checks:** the connection IP seen by this host, previous address, last successful check and verified address-change history. Checks run every 30 seconds while visible and online, on return/focus, when the browser reports online, and through the manual button.
- **Offline IP location:** approximate city, region and country from a local DB-IP database, plus ASN and organization when the optional ASN database supplies them. The visitor's IP is never sent to a separate geolocation service.
- **Permission experiments:** camera, microphone, location, clipboard, screen sharing, notifications, device sensors, Bluetooth/USB/HID/serial, files/folders, fonts, fullscreen and other supported capabilities.
- **Page and JavaScript checks:** watched API reference changes, added script elements, selected attribute changes and exposed extension URL scheme hints.
- **Fingerprint demonstrations:** local rendering/configuration hashes with explicit limits; no identity or population uniqueness claims.
- **Local export and reset:** a JSON report downloads only when clicked. No observation database or analytics service.

The feed retains the latest **600 entries**. Unchanged values, duplicate action-count updates and some high-frequency readings are omitted or sampled. The inventory retains the latest surfaced value independently. Export includes retained evidence plus lifetime summary counts, not an unlimited history.

## Permission switch behavior

Switches control this demo's use of a capability, not saved grants in browser settings. Turning off stops live collection without erasing readings already captured. Revoke saved grants through the browser's site settings.

Supported switches perform a real browser request or capability action. API availability does not guarantee permission, compatible hardware or a successful result. Unsupported controls are labelled **Unavailable**, disabled, and accompanied by an explicit reason, such as a missing browser API, an insecure context, an embedding restriction or a known Permissions Policy block. A permission grant cannot add an API the browser lacks.

While a request is pending, the switch shows **Cancel**. Cancelling invalidates the demo request and releases any resource that arrives late; an already-open native browser prompt may still need dismissal. Denial leaves the demo off and exposes a **Try again** action with the browser's result. Completed one-off checks show an On snapshot with no ongoing sampling and offer **Run again** to repeat the chooser or read. **Details** explains boundaries and shows captured values; **See live readings** opens the matching inventory. Active clipboard checks also provide **Check now**, with a busy state while the read runs.

Live streams/watchers remain On until stopped or released by the browser. Camera and screen previews stay local; microphone sound level is measured without recording audio. Both permission views share the same state, so changes in the overview appear in the Permission lab.

## Connection IP and approximate location

The monitor checks this site's `api/context.php` endpoint without credentials or an external IP-lookup service. After the first valid response establishes a baseline, an address change is counted only when another successful, validated response contains a different normalized address. Failed, invalid, offline, hidden-page or timed-out checks preserve the last verified address and do not invent a change. Checks pause when hidden/offline and resume when the page returns or the browser reports online. Transitions between successful checks can be missed; this is a sampled view of the connection reaching this host.

The PHP endpoint uses `REMOTE_ADDR`, never a visitor-supplied query parameter or arbitrary forwarding header. A reverse proxy can therefore be the observed connection until the hosting server is configured to provide a trusted client address. The result may identify a VPN/proxy exit, shared gateway or hosting network rather than a person's device. An unchanged address does not prove anonymity; a changed address is not proof of a true-IP leak or a VPN state.

City, region, country, ASN and organization are local **database estimates** for that address. They can be missing, stale or wrong, and are separate from the permission-based precise-location experiment. No map or remote geolocation API is used. Local/private/reserved addresses have no inferred public location. If database files are absent or unreadable, the IP check still works and location is explicitly unavailable.

## Honest limits

- A normal webpage cannot reliably confirm that a screenshot happened, especially OS shortcuts such as Windows+Shift+S. Screenshot clues and clipboard image changes have other explanations.
- Ctrl+C alone does not prove copying. An actual document copy event is recorded separately. Clipboard contents are never read in baseline mode. The optional clipboard experiment compares bounded local fingerprints and formats; payloads and content fingerprints are not shown or exported.
- Focus/visibility changes do not identify the other application, tab, notification shade or task switcher. Browsers may suspend background execution; there is no continuous view of activity outside the page.
- Browser extensions are not comprehensively enumerable. Exposed extension schemes are only hints, with no extension IDs or paths logged.
- Integrity checks cover ordinary DOM in the top document and a small set of API references captured at module load. Shadow roots, iframe documents, workers and isolated extension worlds are not traversed. Changes before the baseline and many other modifications are invisible. A script element does not prove execution, and a changed reference does not identify its cause.
- Browser values may be rounded, spoofed, randomized, unavailable or shared by many people. Fingerprint hashes do not prove identity or uniqueness. Trusted event provenance does not prove a human generated an action.

## Privacy and hosting

Readings and sampled events stay in page memory. There are no third-party scripts, remote fonts, advertising pixels, analytics services, accounts, session databases or persistent tracking identifiers. The demo does not upload camera/screen/audio, typed text, clipboard payloads, selected-file contents or the evidence feed.

Like any website, the hosting infrastructure receives ordinary HTTP request metadata and **may retain access logs**. The same-origin `api/context.php` endpoint reflects the current request's connection address and a limited allowlist of headers to that visitor. It also reads private, offline DB-IP files to estimate IP location and network attribution. It writes no files, database records or application logs, contacts no external IP service, never returns cookie values or authorization headers, and sends no CORS permission. Periodic checks create ordinary same-origin requests that the host may log. A connection address may belong to a VPN, proxy or shared network.

An explicit JSON export may contain personal readings from demos the visitor enabled. Reloading or ending a session clears page memory; browser grants and downloaded exports may remain.

## Run locally

Requires Node.js 20 or newer. There are no dependencies to install.

```sh
node server.cjs
```

Open [localhost:5173](http://localhost:5173). The server binds only to `127.0.0.1`. It implements the local metadata response in Node, so PHP is not needed to test the interface. Local requests show a loopback address and no meaningful public IP location. The deployed PHP endpoint performs the offline database lookup.

```sh
npm test
```

Focused tests cover evidence startup freezing, filters/search aliases, counters/retention/reset, reading deduplication/sampling and clipboard event provenance/payload restrictions. The private geodata integration also has a PHP fixture test:

```sh
php tests/geodata.php /absolute/path/to/observatory-data
```

The geodata test uses known public DNS fixture addresses, not visitor IPs. With the October 2026 City and ASN files it checks public IPv4/IPv6 records, AS15169, approximate labels, private/invalid addresses, missing/corrupt files and path redaction. Interface QA should cover desktop/mobile layouts, preview pause/play, feed filters, connection checks, permission start/cancel/retry/stop, reset and export. Personal-data permission prompts require the visitor's explicit approval; support varies across browsers.

## Deploy to Brighton Domains / cPanel

Production site code is the **contents of `dist/`**, including hidden `.htaccess`, `api/context.php` and the vendored PHP reader under `api/lib/maxmind-db/`. Upload the geodata separately outside the public website. Do not upload the repository, `.git`, tests, download script or Node server into the public web directory.

1. Back up any deployment being replaced.
2. Package the contents of `dist/` inside an `observatory/` folder in a ZIP. Include `.htaccess` and the `api/` folder.
3. In cPanel File Manager, upload the ZIP to your home directory, outside `public_html`.
4. Extract it into `public_html`. This creates `public_html/observatory/` without replacing other coursework or the domain homepage.
5. Create `observatory-data` in the account home directory, alongside `public_html`. Upload/extract the uncompressed City and optional ASN MMDB files there. Keep this data out of the site-code ZIP and outside every public web directory.
6. Open the HTTPS URL and check the page, JS/CSS assets, connection check and approximate location. `observatory/api/context.php` should return JSON; it should never expose internal file paths or exception messages.

The expected layout is:

```text
/home/account/
  public_html/
    observatory/
      index.html
      app.js
      api/context.php
      api/lib/maxmind-db/...
  observatory-data/
    dbip-city-lite.mmdb
    dbip-asn-lite.mmdb
    release.json
```

The PHP path is `dirname(__DIR__, 3) . '/observatory-data'` from `api/context.php`. Adjust the private server path if deploying at a different depth. The web account needs read access to the data; the endpoint does not need write access. City and ASN together occupy about 130 MiB uncompressed, plus approximately 65 MB if a compressed upload archive is retained. Country Lite is a smaller optional fallback, with no city or region.

Use 64-bit PHP 7.2+ for the endpoint and reader, choosing a supported PHP version supplied by the host. Composer and a native MaxMind extension are not required. Apache `.htaccess` config supplies HTTPS redirection, a self-only content security policy, no-store responses, no directory listing and denial of common archive/log/config backup file extensions. A valid HTTPS certificate is necessary for protected browser APIs. When deploying on a different domain, change the HTTPS redirect host in `dist/.htaccess` and the homepage links in this README and `package.json`.

[Official cPanel File Manager documentation](https://docs.cpanel.net/cpanel/files/file-manager/)

## Refresh the private database monthly

From the project directory, prepare the October 2026 release locally with Node.js:

```sh
node scripts/download-geodata.mjs --month=2026-10 --dir=../../work/observatory-data
```

Choose an absolute destination when needed. The default destination is `../observatory-data`, outside the project and `dist`; the default release is the current UTC month. Set `--month=YYYY-MM` for the release being installed, `--no-asn` to omit ASN, or `--country-only` to fetch the lightweight Country file instead of City. The script streams official downloads, decompresses the files and records a release manifest. October 2026 file hashes are verified against the official release fingerprints. Upload the resulting files to the private account-home directory and replace the previous monthly files there.

MMDB files and compressed database archives are ignored by Git and **must not be committed to source control**. Keep private geodata and the public site-code release as separate artifacts. See [geodata/README.md](geodata/README.md) for file sizes, deployment details and source links.

## Data and reader licenses

[DB-IP Lite](https://db-ip.com/db/lite.php) data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The connection card includes the required [IP Geolocation by DB-IP](https://db-ip.com) attribution and license link. Preserve attribution on pages displaying or using these results and when redistributing the database. The Lite datasets are updated monthly with reduced coverage and accuracy. The bundled databases are unmodified October 2026 releases.

The PHP reader is the official [maxmind-db/reader](https://packagist.org/packages/maxmind-db/reader) version 1.14.0, upstream commit `f3c92f68b3bec42a9aa780368399e03dc6b91e89`, licensed under Apache-2.0. Its unchanged `autoload.php`, `src` and `LICENSE` are vendored in `dist/api/lib/maxmind-db/`. It has no production Composer package dependencies. MaxMind does not receive visitor addresses from this application.

## Source layout

- `dist/index.html` — onboarding, overview, live inventory and educational views.
- `dist/app.js` — session lifecycle, navigation, filters, counters and export.
- `dist/preview.js`, `dist/welcome.css` — illustrative animated welcome preview and responsive split entry screen.
- `dist/connection.js` — visible-page same-origin checks, response validation and verified IP-change history.
- `dist/evidence.js` — bounded evidence store, sampling, search and startup snapshot.
- `dist/sensors.js` — permission-free baseline readings and page activity handlers.
- `dist/integrity.js` — narrow script/attribute/reference/extension-scheme hints.
- `dist/permissions.js` — explicit capability experiments and resource cleanup.
- `dist/permission-rows.js` — accessible stable switches, details and local previews.
- `dist/learn.js` — sourced explanations and browser boundaries.
- `dist/style.css`, `dist/plain.css`, `dist/permission-readings.css` — responsive UI.
- `dist/api/context.php` — limited same-origin request metadata and private offline IP-location/ASN lookup.
- `dist/api/lib/maxmind-db/` — official vendored Apache-2.0 MaxMind DB PHP reader.
- `dist/.htaccess` — Apache hosting rules.
- `server.cjs` — dependency-free loopback development server.
- `scripts/download-geodata.mjs`, `geodata/README.md` — private monthly data preparation and deployment notes.
- `tests/` — focused JavaScript tests and optional PHP geodata fixtures.
