// Prepare private, offline geodata. This script never processes visitor IPs.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const month = option('month') || new Date().toISOString().slice(0, 7);
if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Use --month=YYYY-MM.');
const directory = resolve(option('dir') || resolve(scriptDirectory, '../../observatory-data'));
const publicDirectory = resolve(scriptDirectory, '../dist');
const relativeToPublic = relative(publicDirectory, directory);
if (!relativeToPublic || !relativeToPublic.startsWith('..') && !isAbsolute(relativeToPublic)) throw new Error('Choose a private --dir outside dist. Never publish MMDB files.');
const kinds = [args.includes('--country-only') ? 'country' : 'city', ...(args.includes('--no-asn') ? [] : ['asn'])];
const knownSHA1 = {
  '2026-10': {
    city: 'df17bd24390108ed1d24dcb7718dc60f6b9abd4f',
    country: 'e515b63075ad48847f9c4332b724742e8ba15b0e',
    asn: 'bc76615cd8f99b7b3a878803b1c84cbeda65769a',
  },
};
await mkdir(directory, { recursive: true });
const files = await Promise.all(kinds.map(async kind => {
  const url = `https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz`;
  const target = resolve(directory, `dbip-${kind}-lite.mmdb`);
  const temporary = `${target}.${process.pid}.partial`;
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${kind}.`);
    await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(temporary, { flags: 'wx' }));
    const hash = createHash('sha1');
    for await (const chunk of createReadStream(temporary)) hash.update(chunk);
    const sha1 = hash.digest('hex');
    const expected = knownSHA1[month]?.[kind];
    if (expected && sha1 !== expected) throw new Error(`Official ${month} ${kind} file fingerprint does not match.`);
    const info = await stat(temporary);
    if (info.size < 1024) throw new Error(`The ${kind} database is unexpectedly small.`);
    await rename(temporary, target);
    console.log(`${kind}: ${info.size} bytes, SHA-1 ${sha1}${expected ? ' (official fingerprint verified)' : ' (recorded; compare with official release page)'}`);
    return { kind, filename: `dbip-${kind}-lite.mmdb`, sourceURL: url, bytes: info.size, sha1 };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}));
await writeFile(resolve(directory, 'release.json'), JSON.stringify({ month, preparedAt: new Date().toISOString(), provider: 'DB-IP Lite', license: 'CC BY 4.0', attribution: 'https://db-ip.com', licenseURL: 'https://creativecommons.org/licenses/by/4.0/', files }, null, 2) + '\n');
console.log(`Private data prepared in ${directory}. Upload it outside public_html; retain DB-IP attribution.`);
