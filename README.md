# Observatory — Browser Privacy Lab

**[Open the live website](https://ia582.brighton.domains/observatory/)** · [Source code](https://github.com/Ibrahim-Amro/Observatory-Browser-Privacy-Lab)
Built by **Ibrahim Amro** · [LinkedIn](https://www.linkedin.com/in/ibrahimamro/)

An approachable, working browser privacy learning tool: **What can a website actually see?** Copy sample text, click a harmless target, switch tabs and inspect the evidence. Read the explanations without starting a session. Developer tools remain available for controlled privacy-extension comparisons.

## Guided learning upgrade (2.1)

- **Guided check-up** (`#checkup`): six questions with real event results, independent steps, skip controls and explicit limits. A synthetic click or a focus change cannot pass a different real-event test. Reviewing the screenshot explanation means the limit was reviewed, never that a screenshot was confirmed. Progress is kept in this tab only and is not a privacy score.
- **My results** (`#report`): plain-language observations and limits, independent of feed filters/retention. Download a text report or print the summary. The text download omits connection IP and approximate location unless explicitly included; the detailed JSON export remains separate.
- **Question library** (`#answers`): 12 searchable, topic-filtered questions with accessible disclosures, experiment links, an evidence glossary and primary documentation links. Reading it does not start protected capabilities or require a session.
- **Global stop control**: stop active or pending permission demos from the dashboard header. This releases the demo resources; saved browser grants remain controlled by browser site settings.
- **A clearer overview**: guided entry and results are prominent; individual sample actions are in an expandable section, keeping the live feed easier to reach. Direct experiment links open that section before focusing their target.

No new external service, tracking identifier, browser storage, protected API request or permission grant is introduced by these learning tools. The existing private aggregate visit counter and its meaning are unchanged.

## Use the lab

1. Read the question cards, then select **Start a guided check-up** or **Explore the live lab**. No account, device selection or new permission request is needed. Saved browser grants may already exist; protected demos do not start automatically.
2. Try the guided copy, click, tab-visibility and screenshot-clue experiments. Each separates the observed event from what it cannot prove. The ordinary copy demo records event/formats, not clipboard contents.
3. Watch **Live Evidence**. The visible **Expert mode** switch adds technical readings and diagnostic hints without requesting permissions or clearing evidence. **Filters** contains search, category, evidence type, startup inclusion and clear-filter controls only. Technical categories are unavailable until Expert mode is explicitly enabled.
4. Open **Permission Lab** for the full catalogue. Each experiment explains access before requesting it; off stops collection but does not revoke saved browser grants. Unsupported/blocked capabilities explain why. Pending requests can be cancelled, snapshots repeated, and failures retried.
5. Use **Fingerprints** for fresh, versioned local rendering/browser snapshots. Expand raw values and inspect the exact ordered grouping fields. Hashes can change, collide or be shared; they do not establish identity or uniqueness.
6. Use **Compare snapshots** to download a baseline, change an extension configuration, reload when needed and import the baseline. Compare changed, unchanged, unavailable and unstable readings. Files are read locally as bounded JSON (maximum 2 MB), validated and displayed as text; no import is uploaded or executed. Different fingerprint schemas are not compared as equivalent hashes. Matching values do not prove an extension failed.
7. Export a versioned JSON session report or end/reset. Reports can contain personal IP/header/location or permission-derived readings; inspect before sharing. Typed text, clipboard payloads, credentials and raw media are not included. Feedback says **Download requested**, because a page cannot confirm that the browser saved the file.

## Navigation and evidence

Public links `#questions`, `#how-it-works`, `#developer`, `#answers` and `#privacy` remain useful before or during a session. They scroll to and focus a substantial visible destination, including when already on screen. A running session remains active while reading public explanations; **Return to my session** returns to the overview.

Dashboard routes are `#overview`, `#signals`, `#permissions`, `#fingerprints`, `#boundaries`, `#guide`, `#compare`, `#checkup` and `#report`. Direct links/reloads start a fresh in-memory session at that view; navigation supports browser Back/Forward. Unknown routes return to the introduction with feedback. Reset clears the current session; going Back afterwards cannot recover deleted evidence.

The bounded feed retains the latest 600 entries. **All-time session totals**, observed activity counts and the frozen first-second snapshot are separate from retained entries and survive filtering/feed clearing. Explanatory limitations and unavailable/context entries are not counted as successful startup observations. Synthetic events are diagnostic entries, separate from browser-dispatched activity; trusted provenance does not prove a physical human action.

## Connection IP architecture

The app uses only this website's same-origin PHP endpoint, `api/context.php`. It makes an initial check and throttled manual refreshes (minimum five seconds), with no continuous polling or automatic focus/return request by default. No ipify or external IP provider is contacted, so the CSP remains self-only and no outside provider disclosure/permission flow is needed.

The PHP endpoint validates and canonicalizes `REMOTE_ADDR` before optional offline geolocation. Forwarded headers are ignored unless the immediate peer exactly matches an address explicitly configured in `OBSERVATORY_TRUSTED_PROXIES`. Leave that environment variable empty on the current host. Only a trusted proxy's validated single client address can replace the peer; arbitrary forwarding chains are rejected.

A connection IP is the address **seen by this website**, not a real-IP verdict, identity or proof of VPN state. IPv4 and IPv6 keep separate comparison baselines. A provider/provenance switch starts a new baseline and is never counted as a verified change. Failed, invalid, offline or hidden-page checks preserve the last valid value with a stale label and the last successful timestamp; they do not invent a change. HTTP, timeout, JSON/schema and network/blocked failure states are distinguished as far as browser fetch permits.

Approximate city/region/country and ASN are optional database estimates, read from private offline DB-IP files. Missing/corrupt/blocked geodata cannot suppress a valid IP. Database source/date is shown separately, coordinates are not invented, and this is separate from the explicit permission-based device-location demo. A VPN, proxy or shared gateway may be located elsewhere. The server makes no visitor-IP calls to an outside geolocation service.

## Hosting repair and deployment

The deployed HTTP500 was reproduced and repaired on 17 October 2026. cPanel `stat` showed entry PHP files at **0666**; PHP syntax was valid on host PHP8.2.34. Restricting the files to **0644**, without changing their code, restored HTTP200 JSON from the context endpoint. The release helper now explicitly writes Unix **0644** ZIP modes, avoiding Windows source-file permissions being copied into the upload. Do not deploy group/world-writable PHP files.

Use supported 64-bit PHP7.3+ and Apache. Composer, frontend dependencies and a native MaxMind extension are not required. Operational PHP diagnostics contain fixed event codes only, never exception text, IPs, user-agents, credentials or internal paths. Hosting access logs are separate.

```sh
python scripts/package-release.py /absolute/path/observatory-release.zip
```

Upload that code archive to cPanel's account home and extract into `/public_html`, updating only `public_html/observatory/`. The archive includes `.htaccess`, self-only CSP, HTTPS redirect, no-store headers, disabled directory listing and a denied `api/lib/` directory. Keep private database and counter data outside the web root:

```text
/home/account/
  public_html/observatory/
    index.html
    app.js
    api/context.php
    api/visit.php
    api/lib/...
  observatory-data/
    dbip-city-lite.mmdb
    dbip-asn-lite.mmdb
    visitor-state.json
    visitor-stats.json
```

The PHP data path is `dirname(__DIR__, 3) . '/observatory-data'` from each endpoint. The context endpoint needs read access; the private visitor counter additionally needs write access in this private folder. On a different host/deployment depth, adjust the private path, HTTPS redirect domain and project links. No hosting configuration remains necessary for the repaired Brighton deployment.

## Privacy and private visitor statistics

Demo readings, evidence, imports and fingerprint snapshots remain in page memory until local export. This demo does not use fingerprint signatures to track people across websites. There are no third-party scripts/analytics, advertising pixels, external fonts, visitor accounts, cookies or persistent browser tracking identifiers. Normal hosting requests/access logs and the private aggregate counter are distinct from the in-memory demo.

A separate same-origin `POST api/visit.php` sends only `{"event":"page_open"}` once per visible document, with no referrer, credentials, evidence feed or permission payload. It is independent of the connection endpoint. Global Privacy Control and Do Not Track opt out; common bot user-agents are skipped. Blocked JavaScript/requests, bots, shared connections and VPN changes affect accuracy.

The counter starts from its first successful entry, not historic traffic. Private `visitor-stats.json` contains aggregate totals and 90 UTC days of counts only:

- `totalPageViews`: counted page openings, including reloads.
- `totalVisits`: estimated sessions, with a new visit after 30 minutes of inactivity **or a new UTC day**.
- `dailyPageViews`, `dailyVisits`, `estimatedDailyVisitors`: aggregate date maps, not identifiable people.

A separate private state file holds HMAC signatures derived from the connection IP and bounded user-agent; raw values are not saved by this counter. Its random salt and signature map are replaced on the **first counted request of a new UTC day**. This is request-driven rotation, not scheduled deletion. File locks and atomic replacements protect concurrent totals; corrupt state is not silently reset. These files are ignored by Git and have no public read endpoint.

To inspect your private counts: **[Brighton Domains Dashboard](https://brighton.domains/dashboard/) → File Manager → observatory-data → visitor-stats.json → View/Download**. Your normal hosting login protects access; no new admin password is needed.

## Run and verify locally

Node.js20+ is sufficient for the interface preview; no dependency installation/build is needed:

```sh
node server.cjs
npm test
```

Open [localhost:5173](http://localhost:5173). The preview binds to loopback, returns honest local connection metadata and never increments live visitor statistics. Production PHP tests use a separate temporary directory and known public DNS fixtures:

```sh
php tests/visits.php
php tests/geodata.php /absolute/path/to/observatory-data
```

Automated suites cover evidence/counts, trusted/synthetic clipboard handling, permission lifecycle/late resource cleanup, connection failures and source/family baselines, daily counter concurrency/retention, fresh fingerprint snapshots, media-query/pointer accuracy, resize deduplication, route parsing and bounded comparison imports. Browser QA covers real navigation/history/reload, useful anchors/focus, filter/mode separation, copy/click evidence, real JSON downloads, responsive layouts and reduced motion. Physical hardware and OS screenshot actions cannot be fully automated; unsupported/denied capabilities remain explicitly labelled. A normal webpage cannot universally confirm screenshots, enumerate all extensions or see other applications/tabs.

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
