// One entry per visible document, independent of dashboard/connection polling.
// No cookie, browser storage, fingerprint, referrer or evidence payload is sent.
let recorded = false;
export function recordPageEntry() {
  if (recorded) return;
  if (document.visibilityState === 'hidden' || document.prerendering) {
    document.addEventListener('visibilitychange', recordPageEntry, {once:true});
    return;
  }
  recorded = true;
  // Respect visitors explicitly asking to opt out of tracking.
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  fetch(new URL('./api/visit.php', import.meta.url), {
    method:'POST', credentials:'omit', cache:'no-store', redirect:'error', referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json'}, body:'{"event":"page_open"}',
    signal:controller.signal
  }).catch(() => {}).finally(() => clearTimeout(timeout));
}
