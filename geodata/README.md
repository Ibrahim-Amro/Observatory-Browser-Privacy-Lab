# Offline IP location data

The PHP endpoint reads a local database on the hosting account. Visitor addresses are never sent to DB-IP, MaxMind or any other lookup service. Location is an estimate for the connection address; VPNs, proxies, mobile gateways and database inaccuracies can put it far from the visitor. It is not GPS and has no accuracy guarantee.

The application reads `REMOTE_ADDR` only. Forwarding headers and URL parameters cannot override the address. A host behind a reverse proxy may therefore locate the proxy until its server configuration provides the correct trusted connection address. Local, private and reserved addresses do not produce a public location.

## Install outside the public website

For a website deployed at `/home/account/public_html/observatory`, create `/home/account/observatory-data` and upload these uncompressed files there:

- `dbip-city-lite.mmdb` — city, region and country.
- `dbip-asn-lite.mmdb` — optional autonomous system number and organization.
- `dbip-country-lite.mmdb` — optional smaller fallback when the City file is absent. Country does not provide city or region.

The PHP path is `dirname(__DIR__, 3) . '/observatory-data'` from `dist/api/context.php`. If the website uses a different directory depth, adjust this private server path. Do not put MMDB files inside `public_html`, `dist`, a Git repository or the public site ZIP. The web account needs read access; the application does not need write access. Data and site code are separate uploads.

## Download or update

Node.js 18+ can prepare the files without Composer, Python or a PHP extension:

```powershell
node scripts/download-geodata.mjs --month=2026-10 --dir=../../work/observatory-data
```

Run from the `observatory` project directory, and choose an absolute `--dir` when there is any ambiguity. The default destination is `../observatory-data`, alongside this project, outside `dist`. The default release month is the current UTC month. The script streams downloads and decompression, checks October 2026 against the official SHA-1 file fingerprints, and writes a release manifest without visitor information. A future release is downloaded by explicit month from the same official monthly URL pattern; update the data monthly.

Use `--country-only` to fetch Country instead of City, or `--no-asn` to omit ASN. The October 2026 uncompressed files are City 126,998,165 bytes, Country approximately 8 MB, and ASN 9,566,363 bytes. City and ASN together occupy about 130 MiB. The compressed downloads are about 60.2 MB and 5.2 MB.

Official monthly source pages:

- [City Lite downloads and license](https://db-ip.com/db/download/ip-to-city-lite)
- [Country Lite downloads and license](https://db-ip.com/db/download/ip-to-country-lite)
- [ASN Lite downloads and license](https://db-ip.com/db/download/ip-to-asn-lite)

## Attribution and bundled reader

DB-IP Lite is distributed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Keep a visible [IP Geolocation by DB-IP](https://db-ip.com) attribution link on every page displaying or using results, plus a license link in the product documentation. These files are unmodified monthly database releases; renaming the file for deployment does not alter its contents. Preserve this attribution when redistributing the database separately.

The vendored [MaxMind DB PHP Reader](https://github.com/maxmind/MaxMind-DB-Reader-php) is version 1.14.0, upstream commit `f3c92f68b3bec42a9aa780368399e03dc6b91e89`, obtained through the official `maxmind-db/reader` Packagist release. The files in `dist/api/lib/maxmind-db` are unchanged upstream `autoload.php`, `src`, and `LICENSE` under Apache-2.0. There are no production Composer package dependencies. PHP 7.2+ is required; use a supported PHP release supplied by the host. A native MaxMind extension is optional. GMP or BCMath is needed only for unusually large integer types; the downloaded City and ASN databases work with the pure PHP reader on a 64-bit PHP runtime.

The endpoint returns an unavailable state when files are missing or cannot be read. It makes no external fallback request and does not include internal filesystem paths or exception messages in the response.
