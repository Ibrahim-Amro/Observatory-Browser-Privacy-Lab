/** Plain-language interpretation of existing session data. No browser requests. */
export const CHECKUP_STEPS = [
  {id:'click',label:'A click',question:'What does a click reveal?',answer:'A page can receive the position and element type of a click delivered to it.',action:'Click the sample button below.',limit:'A browser-dispatched event does not prove identity, attention, or physical human input.'},
  {id:'copy',label:'Copying',question:'Does copying expose my whole clipboard?',answer:'Copying from this document can deliver a copy event. Reading the system clipboard is a separate capability.',action:'Select the sample sentence and use your usual Copy command.',limit:'This test reads event metadata, not the copied text. Copies made in another app are not delivered here.'},
  {id:'tabs',label:'Leaving a tab',question:'Can it know where I went?',answer:'The browser can report that this page became hidden. It does not identify the destination.',action:'Switch to another tab, then return. A blank test tab is available below.',limit:'Minimising the window or turning off the screen can also hide the page. Focus loss alone is a different signal.'},
  {id:'screenshots',label:'Screenshots',question:'Can it confirm a screenshot?',answer:'There is no universal web event confirming an operating-system screenshot.',action:'You can try your usual screenshot shortcut, then read what evidence arrived. Review the limit to continue.',limit:'A shortcut is only a possible clue if it reaches the page. No clue does not prove that no screenshot happened.'},
  {id:'connection',label:'Your connection',question:'What address reaches this website?',answer:'This host can return the IP address of the connection reaching it. Location is an optional database estimate.',action:'Inspect the existing result or request a fresh same-origin check.',limit:'This can be a shared, VPN or proxy address. It is not a real-IP verdict, GPS location, or proof of identity.'},
  {id:'recognition',label:'Recognition',question:'Can these readings identify me?',answer:'A fingerprint summarises browser, screen and rendering characteristics. Different systems can match.',action:'Inspect the local fingerprint result, then review the recognition limit.',limit:'A hash is not a verified identity or a uniqueness score. Matching or changed values alone do not prove that an extension worked.'},
];

export const QUESTIONS = [
  {id:'copy',topic:'Clipboard',title:'Can a website tell when I copy?',answer:'It can receive a copy event from its own document. That is different from reading everything on your system clipboard.',limit:'A missing event does not prove that copying did not happen. This demo does not read the selected text for the ordinary copy test.',view:'checkup',source:'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API'},
  {id:'paste',topic:'Clipboard',title:'What happens when I paste into a website?',answer:'Pasting into a page can expose the pasted content to that page. Observatory records event metadata and deliberately discards the payload.',limit:'Do not paste private text just to test. An optional clipboard-reading experiment is separate from ordinary page events.',view:'permissions',source:'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API'},
  {id:'screenshots',topic:'Activity',title:'Can it detect Windows + Shift + S or phone screenshots?',answer:'An operating-system capture may never send a signal to the page. A delivered shortcut is a possible clue, not confirmation.',limit:'Focus loss has many causes. An image in an explicitly read clipboard can also be a copied picture.',view:'checkup',source:'https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API'},
  {id:'tabs',topic:'Activity',title:'Can it see my other tabs and apps?',answer:'It can observe its own visibility and focus. Ordinary page JavaScript cannot generally inspect the contents of unrelated tabs or other applications.',limit:'Becoming hidden does not reveal the destination, and focus does not prove that you are paying attention.',view:'checkup',source:'https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API'},
  {id:'ip',topic:'Connection',title:'Is the displayed address my real IP?',answer:'It is the connection address reported by this website’s host. It can belong to a VPN, proxy, shared gateway or intermediary.',limit:'An unchanged address is not proof of anonymity. IPv4 and IPv6 observations are compared separately.',view:'overview',source:'https://www.w3.org/TR/fingerprinting-guidance/'},
  {id:'location',topic:'Connection',title:'Is IP location the same as device location?',answer:'No. IP location is an approximate database estimate. Device location is a separate browser-controlled capability in Permission Lab.',limit:'An IP estimate can be missing, stale or wrong. Previously saved browser grants may already exist.',view:'permissions',source:'https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API'},
  {id:'fingerprint',topic:'Recognition',title:'Does a matching fingerprint prove it is me?',answer:'No. Browser characteristics can be shared, reduced or randomised. A hash summarises inputs; it does not verify a person.',limit:'Compare snapshots under controlled conditions and inspect unavailable or unstable inputs.',view:'fingerprints',source:'https://developer.mozilla.org/en-US/docs/Glossary/Fingerprinting'},
  {id:'extensions',topic:'Recognition',title:'Can it list my Chrome extensions?',answer:'Only some exposed resource references and page-world changes may be visible. Isolated extension worlds may remain invisible.',limit:'Several references can come from one origin. A reference does not prove execution; no hint does not prove no extension is active.',view:'signals',source:'https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts'},
  {id:'permissions',topic:'Permissions',title:'Does Expert mode ask for more access?',answer:'No. Expert mode changes which already-collected technical entries are displayed. Protected experiments require a separate deliberate action.',limit:'Browser support, policy and saved grants affect what an experiment can do.',view:'permissions',source:'https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API'},
  {id:'reset',topic:'Permissions',title:'Does stopping a demo revoke its permission?',answer:'Stopping releases the demo’s resources. Ending a session also clears the demo’s page memory.',limit:'Saved browser grants, exported files, private aggregate counts and hosting logs can remain. Revoke grants in browser site settings.',view:'permissions',source:'https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API'},
  {id:'badges',topic:'Evidence',title:'What do Observed, Estimate and Possible clue mean?',answer:'Observed describes a delivered event or returned reading. Estimate adds an inference. Possible clue has multiple explanations. Unavailable means no valid measurement was obtained.',limit:'Context entries explain a limit rather than proving an observation. No badge is a privacy rating.',view:'report',source:'https://www.w3.org/TR/fingerprinting-guidance/'},
  {id:'retention',topic:'Evidence',title:'Why do totals differ from the visible feed?',answer:'Session totals cover the whole current session. The feed retains at most 600 recent entries, and filters can hide some of them.',limit:'Clearing the retained feed does not reset totals or the learning summary. Ending the session does.',view:'report',source:'https://github.com/Ibrahim-Amro/Observatory-Browser-Privacy-Lab'},
];

export function findQuestions({search='',topic='all'}={}) {
  const terms=String(search).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return QUESTIONS.filter(q=>(topic==='all'||q.topic===topic)&&terms.every(t=>`${q.title} ${q.answer} ${q.limit} ${q.topic}`.toLocaleLowerCase().includes(t)));
}

export function createLearningState() {
  let latest={}, reviewed=new Set(), skipped=new Set(), sampleClick=false;
  function observe(entry) {
    if(!entry||entry.signal||/^synthetic/i.test(entry.title)||['context','unavailable','permission'].includes(entry.kind))return;
    let key;
    if(entry.title==='Page copy event')key='copy';
    if(entry.category==='tabs'&&/became hidden/i.test(entry.title))key='tabs';
    if(entry.category==='screenshot')key='screenshots';
    if(key)latest[key]={title:String(entry.title).slice(0,160),detail:String(entry.detail).slice(0,800),time:entry.time,kind:entry.kind};
  }
  return {
    observe,
    markClick(trusted){if(trusted===true)sampleClick=true;},
    review(id){if(['screenshots','recognition'].includes(id))reviewed.add(id);},
    skip(id){if(CHECKUP_STEPS.some(step=>step.id===id))skipped.add(id);},
    read(){return{latest:Object.fromEntries(Object.entries(latest).map(([key,value])=>[key,{...value}])),reviewed:[...reviewed],skipped:[...skipped],sampleClick};},
    reset(){latest={};reviewed.clear();skipped.clear();sampleClick=false;},
  };
}

export function stepStatus(id,state,session={}) {
  if(id==='click'&&state.sampleClick)return{done:true,label:'Sample click observed',kind:'observed'};
  if(['copy','tabs'].includes(id)&&state.latest[id])return{done:true,label:id==='copy'?'Copy event observed':'Hidden-page event observed',kind:'observed'};
  if(id==='connection'&&session.connection?.address)return{done:true,label:session.connection.stale?'Earlier result available · stale':'Connection result available',kind:'observed'};
  if(state.reviewed.includes(id))return{done:true,label:'Limit reviewed',kind:'context'};
  if(state.skipped.includes(id))return{done:true,label:'Skipped · no result assumed',kind:'context'};
  return{done:false,label:'Not explored yet',kind:'context'};
}

export function buildSessionAnswers(session={},state={latest:{}}) {
  const counts=session.summary?.counts||{};
  const c=session.connection;
  const clipboard=(counts.copy||0)+(counts.cut||0)+(counts.paste||0);
  return [
    {id:'click',question:'Did this page receive clicks?',kind:counts.clicks?'observed':'context',result:counts.clicks?`${counts.clicks} browser-dispatched click events recorded.`:'No matching click event observed.',limit:'Events do not establish identity, attention or a physical human action.'},
    {id:'copy',question:'Did copying or pasting reach this page?',kind:clipboard?'observed':'context',result:clipboard?`Copy: ${counts.copy||0}. Cut: ${counts.cut||0}. Paste: ${counts.paste||0}. Payloads were not read by these handlers.`:'No matching copy, cut or paste event observed.',limit:'This is not a history of the system clipboard or actions in other apps.'},
    {id:'tabs',question:'Did this page become hidden?',kind:state.latest.tabs?'observed':'context',result:state.latest.tabs?'A hidden-page event was delivered. Its destination is unknown.':'No matching hidden-page event observed. Focus changes may be recorded separately.',limit:'Minimising, screen state and tab changes can have similar effects.'},
    {id:'screenshots',question:'Was a screenshot confirmed?',kind:counts.screenshot?'possible':'context',result:counts.screenshot?`${counts.screenshot} possible shortcut clues recorded. No screenshot was confirmed.`:'No matching screenshot clue observed. This does not establish whether a capture happened.',limit:'A normal page has no universal operating-system screenshot confirmation event.'},
    {id:'connection',question:'What did the connection check establish?',kind:c?.address?'observed':'unavailable',result:c?.address?`${c.local?'A local preview address':'An '+c.family+' connection address'} was verified by this website${c.stale?'; the retained result is now stale':''}.`:'No valid connection address has been returned yet.',limit:'The address can be shared or belong to an intermediary. IP location is optional and approximate.'},
    {id:'recognition',question:'Does the fingerprint identify a person?',kind:session.fingerprint?.groupingHash?'estimate':'unavailable',result:session.fingerprint?.groupingHash?'A versioned grouping hash was calculated locally. It is not a verified identity.':'A completed grouping hash is not available for this session.',limit:'Values can change, collide or be shared. A difference does not identify its cause.'},
    {id:'permissions',question:'What extra access is running?',kind:session.activeDemos?.length?'permission':'context',result:session.activeDemos?.length?`${session.activeDemos.length} demos running or requesting: ${session.activeDemos.join(', ')}.`:'No permission demos are running or requesting.',limit:'Stopping a demo is different from revoking a saved browser grant.'},
  ];
}

export function plainReport(session,state,{includePersonal=false,now=new Date().toISOString()}={}) {
  const lines=['OBSERVATORY · PLAIN-LANGUAGE SESSION REPORT',`Generated: ${now}`,`Session started: ${session.startedAt||'Not started'}`,'','This is evidence from one page, not a privacy score or proof of identity.',''];
  for(const answer of buildSessionAnswers(session,state))lines.push(answer.question,`${answer.kind.toUpperCase()}: ${answer.result}`,`Limit: ${answer.limit}`,'');
  lines.push(`All-time session entries: ${session.summary?.totalEvents||0}. Retained feed entries: ${session.summary?.retained||0}.`,'These totals can include readings and context; they are not a count of people.');
  if(includePersonal&&session.connection?.address){const c=session.connection;lines.push('',`Connection IP (included by choice): ${c.address}`,`Source: ${c.sourceLabel||'This website'}`,`Last successful check: ${c.checkedAt||'Unknown'}`,`Stale: ${c.stale?'yes':'no'}`);if(c.location?.status==='available')lines.push('Approximate IP location: '+[c.location.city,c.location.region,c.location.country].filter(Boolean).join(', '));}
  else lines.push('Connection IP and approximate location omitted from this report.');
  lines.push('','No typed text, clipboard payloads, credentials or raw media are included.','Demo state is in page memory. Private aggregate visit counts and hosting logs are separate.','https://ia582.brighton.domains/observatory/');
  return lines.join('\n');
}
