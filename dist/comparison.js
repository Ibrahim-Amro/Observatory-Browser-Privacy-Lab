export const COMPARISON_SCHEMA = 'observatory-comparison/1';
export const SESSION_SCHEMA = 'observatory-session/2';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const kinds = new Set(['observed','estimate','possible','unavailable','permission','context']);
const text = (value, limit) => typeof value === 'string' && value.length <= limit;
export function makeSnapshot(signals, capturedAt = new Date().toISOString()) {
  return {schemaVersion:COMPARISON_SCHEMA,product:'Observatory',capturedAt,
    signals:[...signals].map(({id,group,key,value,kind,source,updatedAt}) => ({id,group,key,value,kind,source,updatedAt})).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function parseSnapshot(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_IMPORT_BYTES) throw new Error('Choose an Observatory JSON report smaller than 2 MB.');
  let input; try {input=JSON.parse(raw);} catch {throw new Error('This file is not valid JSON.');}
  if (!input || ![COMPARISON_SCHEMA,SESSION_SCHEMA].includes(input.schemaVersion) || input.product !== 'Observatory' || !Array.isArray(input.signals) || input.signals.length > 2000) throw new Error('Use a comparison snapshot or session report exported by this version of Observatory.');
  const capturedAt = input.capturedAt || input.generatedAt;
  if (!text(capturedAt,40) || !Number.isFinite(Date.parse(capturedAt))) throw new Error('The report needs a valid capture time.');
  const seen = new Set();
  const signals = input.signals.map(item => {
    if (!item || !text(item.id,300) || !item.id || seen.has(item.id) || !text(item.group,60) || !text(item.key,240) || !text(item.value,20000) || !kinds.has(item.kind) || (item.source != null && !text(item.source,2048)) || !text(item.updatedAt,40) || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('The report contains an invalid or duplicate reading.');
    seen.add(item.id);
    return {id:item.id,group:item.group,key:item.key,value:item.value,kind:item.kind,source:item.source || '',updatedAt:item.updatedAt};
  });
  return makeSnapshot(signals,capturedAt);
}
export function compareSnapshots(before, after) {
  const left=new Map(before.signals.map(s=>[s.id,s]));
  const right=new Map(after.signals.map(s=>[s.id,s]));
  const schema = snapshot => snapshot.signals.find(s=>s.group==='fingerprint' && /schema/i.test(s.key))?.value;
  const schemaMismatch=!schema(before)||!schema(after)||schema(before)!==schema(after);
  return [...new Set([...left.keys(),...right.keys()])].filter(id=>{const s=right.get(id)||left.get(id);return s.group!=='boundaries'&&s.kind!=='context';}).sort().map(id=>{
    const a=left.get(id),b=right.get(id),s=b||a;
    const unavailable=!a||!b||a.kind==='unavailable'||b.kind==='unavailable'||(schemaMismatch&&s.group==='fingerprint'&&/hash/i.test(s.key));
    const unstable=['activity','performance','clipboard'].includes(s.group)||/time stamp|timestamp|visible session|elapsed|battery|page focus|page visibility|last successful|connection check status/i.test(s.key);
    return {id,key:s.key,group:s.group,before:a?.value??'Not captured',after:b?.value??'Not captured',status:unavailable?'unavailable':unstable?'unstable':a.value===b.value&&a.kind===b.kind?'unchanged':'changed',note:unavailable?'Missing, unavailable, or incompatible fingerprint schema.':unstable?'This reading can vary with time or activity; a difference does not identify its cause.':'Compare under controlled conditions. A match or difference does not prove an extension succeeded or failed.'};
  });
}
