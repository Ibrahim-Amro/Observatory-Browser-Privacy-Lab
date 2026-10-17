import {startSensors} from './sensors.js';
import {createPermissionLab} from './permissions.js';
import {guides,limitations} from './learn.js';
import {createEvidenceStore} from './evidence.js';
import {startIntegrity} from './integrity.js';
import {mountPermissionRows} from './permission-rows.js';
import {mountEvidencePreview} from './preview.js';
import {createConnectionMonitor} from './connection.js';
import {recordPageEntry} from './visits.js';
import {parseRoute,DASHBOARD_VIEWS} from './routes.js';
import {makeSnapshot,parseSnapshot,compareSnapshots,SESSION_SCHEMA,MAX_IMPORT_BYTES} from './comparison.js';
recordPageEntry();
const $ = id => document.getElementById(id);
const node = (tag,className,text) => { const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; };
const title = value => String(value).replace(/(^|[-\s])\w/g,c=>c.toUpperCase());
const groupNames = {browser:'Browser',device:'Device',network:'Network & request',display:'Display',activity:'Activity',clipboard:'Clipboard events',fingerprint:'Fingerprints',performance:'Performance',boundaries:'Boundaries',permissions:'Permission data',integrity:'Page integrity',storage:'Storage',media:'Preferences'};
const kindNames = {observed:'Observed',estimate:'Estimate',unavailable:'Unavailable',permission:'Permission data',possible:'Possible clue',context:'Context'};
const groupTitle = group => groupNames[group] || title(group);
let started = false;
let currentView = 'overview';
let selectedGroup = 'all';
let sensors = null;
let lab = null;
let startTime;
let sessionToken = 0;
let signalsDirty = false;
let permissionDirty = false;
let feedDirty = false;
let viewTimer;
let startupTimer;
let startupDeadline=0;
let integrity = null;
let connection = null;
let lastConnectionChange=0;
const connectionHistory=[];
let permissionMounts = [];
let expertMode = false;
let comparisonBaseline = null;
let routeHighlightTimer;
let highlightedDestination = null;
let lastFeedKeys = '';
let hasRequested = false;
let toastTimer;
const evidence = createEvidenceStore();
const signals = new Map();
const tableNodes = new Map();
let lastTableKeys='';
let lastGroupKeys='';
let lastFingerprintKeys='';
const preview=mountEvidencePreview({container:$('previewTrack'),button:$('previewPause')});
function finishStartupIfDue(){if(startupDeadline&&Date.now()>=startupDeadline){startupDeadline=0;evidence.finishStartup();}}
function setSignal(group,key,value,options={}) {
  if(!started)return;
  finishStartupIfDue();
  group=String(group).toLowerCase();
  const id=`${group}:${key}`;
  const text=typeof value==='object'?JSON.stringify(value):String(value??'Not exposed');
  const previous=signals.get(id);
  const kind=group==='permissions'&&(!options.kind||options.kind==='observed')?'permission':options.kind||'observed';
  if(previous?.value===text&&previous?.kind===kind&&previous?.note===(options.note||'')&&previous?.source===(options.source||''))return;
  signals.set(id,{id,group,key,value:text,kind,note:options.note||'',source:options.source||'',updatedAt:new Date().toISOString()});
  if(evidence.capture(group,key,text,{...options,kind}))feedDirty=true;
  signalsDirty=true;
}
function addEvent(eventTitle,detail,kind='observed',meta={}) {
  if(!started)return;
  finishStartupIfDue();
  const entry=evidence.add(eventTitle,detail,kind,{source:meta.source||'This page’s browser event listeners',...meta});feedDirty=true;
  renderGuided(entry);
}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function renderConnection(state){
  if(!started)return;
  $('connectionAddress').textContent=state.address||'No verified address yet';
  $('connectionAddress').classList.toggle('is-stale',!!state.stale);
  $('connectionPrevious').textContent=state.previousAddress?`Previous: ${state.previousAddress}`:state.local?'Local preview: this is a loopback connection.':'No earlier address in this session.';
  $('connectionChanges').textContent=state.changes;
  $('connectionStatus').textContent=state.detail||({checking:'Checking the current connection…',ready:'Last check completed.',error:'Check failed; last verified value is kept.',paused:'Paused while the page is hidden.',stopped:'Checks stopped.'}[state.status]||'Waiting for the first check.');
  if(state.comparison)$('connectionStatus').textContent+=' '+state.comparison;
  $('refreshConnection').disabled=!!state.busy;$('refreshConnection').textContent=state.busy?'Checking…':'Check connection';
  $('connectionChecked').textContent=state.checkedAt?`Last successful check: ${new Date(state.checkedAt).toLocaleTimeString()} · ${state.family||'Unknown family'}${state.stale?' · STALE':''} · ${state.sourceLabel||'This website’s endpoint'}`:'Not checked yet';
  const location=state.location;
  if(location?.status==='available'){
    $('connectionLocation').textContent=[location.city,location.region,location.country].filter((value,index,array)=>value&&array.indexOf(value)===index).join(', ')||location.countryCode||'No named location';
    $('connectionProvider').textContent=[location.asn?`AS${String(location.asn).replace(/^AS/i,'')}`:'',location.organization||''].filter(Boolean).join(' · ')||'Approximate network location; not GPS.';
  }else{
    $('connectionLocation').textContent=state.local?'Localhost · no IP location':'Location not available';
    $('connectionProvider').textContent=location?.note||'No location was returned for this connection. A permission-based location is a separate experiment.';
  }
  $('connectionDatabase').textContent=location?.databaseDate?`database ${location.databaseDate}`:'offline database';
  if(state.changes>lastConnectionChange&&state.address&&state.previousAddress){
    connectionHistory.unshift({from:state.previousAddress,to:state.address,time:state.checkedAt});if(connectionHistory.length>20)connectionHistory.pop();
    $('connectionHistory').replaceChildren(...connectionHistory.map(entry=>node('li','',`${new Date(entry.time).toLocaleTimeString()} · ${entry.from} → ${entry.to}`)));
  }
  lastConnectionChange=state.changes;
}
function beginSession(){
  if(started)return;
  started=true;sessionToken++;startTime=new Date().toISOString();startupDeadline=Date.now()+1000;
  $('welcome').hidden=true;$('app').hidden=false;document.querySelector('.skip').href='#dashboard';
  preview.setVisible(false);
  sensors=startSensors({setSignal,addEvent});
  lab=createPermissionLab({setSignal,addEvent,onChange:()=>{permissionDirty=true;}});
  integrity=startIntegrity({setSignal,addEvent});
  const rowOptions={lab,onRequest:()=>{hasRequested=true;},onInspect:item=>{selectedGroup='permissions';$('signalSearch').value=item.title;$('signalKind').value='all';navigate('signals');},onError:error=>toast(error?.message||`This capability could not finish: ${error?.name||'restricted'}.`)};
  permissionMounts=[mountPermissionRows({container:$('permissionCards'),...rowOptions})];
  addEvent('Observatory session started','No new permission requests have been made. Browser feature availability determines the available experiments.','context');
  lab.readExistingPermissions?.().catch(()=>{});
  connection=createConnectionMonitor({setSignal,addEvent,onUpdate:renderConnection});connection.start();
  viewTimer=setInterval(renderLive,500);
  const token=sessionToken;
  startupTimer=setTimeout(()=>{if(started&&sessionToken===token){startupDeadline=0;evidence.finishStartup();feedDirty=true;renderLive();}},Math.max(0,startupDeadline-Date.now()));
  renderLive();
}
function showView(view){
  if(!started||!DASHBOARD_VIEWS.includes(view))return;
  currentView=view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-current',button.dataset.view===view?'page':'false');});
  $('breadcrumbView').textContent={permissions:'PERMISSION LAB',signals:'LIVE SIGNALS',fingerprints:'FINGERPRINTS',boundaries:'THE BOUNDARIES',guide:'FIELD GUIDE',overview:'OVERVIEW',compare:'COMPARE SNAPSHOTS'}[view];
  if(view==='signals')renderSignalTable(true);
  if(view==='overview'){renderFeed(true);renderPermissions();}
  if(view==='permissions')renderPermissions();
  if(view==='fingerprints')renderFingerprints();
  if(view==='boundaries')renderBoundaries();
  if(view==='guide')renderGuide();
  renderSummary();window.scrollTo({top:0,behavior:'instant'});
}
function formatTime(seconds){return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;}
function renderSummary(){
  const surfaced=[...signals.values()].filter(s=>!['unavailable','context'].includes(s.kind)&&s.group!=='boundaries').length;
  const activeCount=lab?.items.filter(item=>lab.readState(item.id).active).length||0;
  const summary=evidence.summary();
  $('metricSignals').textContent=surfaced;$('metricEvents').textContent=summary.totalEvents;$('metricPermissions').textContent=activeCount;
  $('metricTime').textContent=formatTime(sensors?.getSummary().visibleSeconds||0);
  for(const [id,category] of Object.entries({totalClicks:'clicks',totalClipboard:'clipboard',totalScreenshot:'screenshot',totalTabs:'tabs',totalResolution:'resolution'}))$(id).textContent=summary.counts[category];
  $('startupReadingCount').textContent=summary.startupReadings;$('startupEventCount').textContent=summary.startupEvents;
  $('startupState').textContent=summary.startupFinished?'First second · saved snapshot':'Capturing first second…';
  const samples=summary.startupSamples.join('|');
  if($('startupSamples').dataset.keys!==samples){$('startupSamples').dataset.keys=samples;$('startupSamples').replaceChildren(...summary.startupSamples.map(sample=>node('li','',sample)));}
  $('navSignalCount').textContent=signals.size;$('navPermissionCount').textContent=lab?.items.length||0;
  $('liveState').textContent=document.hidden?'◌ PAGE HIDDEN':document.hasFocus()?'● SESSION LIVE':'◌ PAGE UNFOCUSED';
  $('liveState').style.color=document.hasFocus()&&!document.hidden?'var(--lime)':'var(--amber)';
  document.querySelector('.mode-badge').textContent=hasRequested?'EXPLORING · PERMISSION LAB USED':'BASELINE · NO NEW REQUESTS';
  $('footerSession').textContent=`${signals.size} inventory entries · Demo readings in memory · Private aggregate visits on host`;
  renderIntegrity();
}
function renderLive(){
  if(!started||document.hidden)return;
  renderSummary();
  if(feedDirty&&currentView==='overview'){renderFeed();feedDirty=false;}
  if(signalsDirty){
    if(currentView==='signals')renderSignalTable();
    if(currentView==='fingerprints')renderFingerprints();
    if(currentView==='permissions'||currentView==='overview')renderPermissionReadings();
    signalsDirty=false;
  }
  if(permissionDirty){if(currentView==='permissions'||currentView==='overview')renderPermissions();permissionDirty=false;}
}
function feedFilters(){const category=$('feedCategory').value;return{mode:expertMode?'expert':'normal',search:$('feedSearch').value,categories:category&&category!=='all'?[category]:[],kinds:$('feedKind').value==='all'?[]:[$('feedKind').value],showStartup:$('includeStartup').checked};}
function renderFeed(force=false){
  const entries=evidence.query(feedFilters());const summary=evidence.summary();
  $('feedModeLabel').textContent=expertMode?'Expert mode · activity, technical readings and diagnostic hints.':'Page activity and possible clues. Expert mode adds technical readings, without granting permissions.';
  $('feedResultCount').textContent=`${entries.length} shown · ${expertMode?'Expert mode':'everyday activity'}`;
  $('feedRetention').textContent=`${summary.retained} retained / 600 max`;
  $('emptyFeed').hidden=entries.length!==0;
  $('emptyFeed').textContent=!expertMode&&!normalCategories.has($('feedCategory').value)?'This category needs Expert mode. Switch it on, or choose another category.':'No matching event observed. Try the sample actions, or change your filters.';
  const keys=entries.map(entry=>entry.id).join('|');if(!force&&keys===lastFeedKeys)return;lastFeedKeys=keys;
  const feed=$('eventFeed');const scrollTop=feed.scrollTop;const previousFirst=feed.firstElementChild;const previousOffset=previousFirst?.getBoundingClientRect().top;
  const existing=new Map([...feed.children].map(el=>[el.dataset.entry,el]));
  const rows=entries.map(entry=>{
    if(existing.has(entry.id))return existing.get(entry.id);
    const el=node('li',`feed-event ${entry.kind}`);el.dataset.entry=entry.id;
    const time=node('time','',new Date(entry.time).toLocaleTimeString([],{hour12:false}));time.dateTime=entry.time;
    const body=node('div');body.append(node('strong','',entry.title),node('span',`tag ${entry.kind}`,kindNames[entry.kind]||title(entry.kind)),node('span','event-category',title(entry.category)));
    if(entry.startup)body.append(node('span','startup-tag','startup'));
    body.append(node('p','',entry.detail));el.append(time,body);return el;
  });
  feed.replaceChildren(...rows);
  if(!force&&scrollTop>8&&previousFirst?.isConnected)feed.scrollTop=scrollTop+(previousFirst.getBoundingClientRect().top-previousOffset);
  else feed.scrollTop=force?0:scrollTop;
}
function renderIntegrity(){
  const values=[...signals.values()].filter(s=>s.group==='integrity');
  const keys=['Added script elements','Extension-scheme script hints','Distinct exposed extension origins','API reference comparison','Inline handler attribute changes'];
  const readings=keys.map(key=>values.find(s=>s.key===key)).filter(Boolean);
  const signature=readings.map(s=>s.value).join('|');if($('integritySummary').dataset.values===signature)return;
  $('integritySummary').dataset.values=signature;
  $('integritySummary').replaceChildren(...readings.map(s=>{const row=node('div');row.append(node('span','',s.key),node('strong','',s.value));return row;}));
}
function renderGroups(){
  const groups=[...new Set([...signals.values()].map(s=>s.group))].sort();
  const signature=groups.join('|')+'|'+selectedGroup;if(signature===lastGroupKeys)return;lastGroupKeys=signature;
  $('signalGroups').replaceChildren(...['all',...groups].map(group=>{const button=node('button',group===selectedGroup?'active':'',group==='all'?'All signals':groupTitle(group));button.setAttribute('aria-pressed',String(group===selectedGroup));button.addEventListener('click',()=>{selectedGroup=group;renderSignalTable(true);});return button;}));
}
function renderSignalTable(force=false){
  renderGroups();
  const query=$('signalSearch').value.trim().toLowerCase();const kind=$('signalKind').value;
  const entries=[...signals.values()].filter(s=>(selectedGroup==='all'||s.group===selectedGroup)&&(kind==='all'||s.kind===kind)&&(!query||`${s.key} ${s.value} ${s.note} ${groupTitle(s.group)}`.toLowerCase().includes(query))).sort((a,b)=>a.group.localeCompare(b.group)||a.key.localeCompare(b.key));
  $('signalResultCount').textContent=`${entries.length} of ${signals.size} readings`;
  $('emptySignals').hidden=entries.length!==0;
  const keys=entries.map(s=>s.id).join('|');
  if(force||lastTableKeys!==keys){
    tableNodes.clear();lastTableKeys=keys;
    $('signalRows').replaceChildren(...entries.map(s=>{const row=node('tr');const name=node('td');const button=node('button','row-detail',s.key);button.addEventListener('click',()=>showDetail(s.id));name.append(button);const value=node('td');const kindCell=node('td');const badge=node('span');kindCell.append(badge);const category=node('td','',groupTitle(s.group));const action=node('td');const more=node('button','text-button','↗');more.setAttribute('aria-label',`Details for ${s.key}`);more.addEventListener('click',()=>showDetail(s.id));action.append(more);row.append(name,value,kindCell,category,action);tableNodes.set(s.id,{value,badge});return row;}));
  }
  for(const s of entries){const existing=tableNodes.get(s.id);existing.value.textContent=s.value.length>180?`${s.value.slice(0,180)}…`:s.value;existing.value.title=s.value;existing.badge.textContent=kindNames[s.kind]||title(s.kind);existing.badge.className=`tag ${s.kind}`;}
}
function showDetail(id){const s=signals.get(id);if(!s)return;$('detailGroup').textContent=groupTitle(s.group);$('detailTitle').textContent=s.key;$('detailValue').textContent=s.value;$('detailKind').textContent=kindNames[s.kind]||title(s.kind);$('detailKind').className=`tag ${s.kind}`;$('detailNote').textContent=s.note||'This is the value currently exposed to this page. Browser implementations, settings and privacy protections can affect it.';$('detailTime').textContent=`Last changed: ${new Date(s.updatedAt).toLocaleTimeString()}. This reading is a snapshot; close and reopen for the latest value.`;$('detailSource').hidden=!s.source;if(s.source)$('detailSource').href=s.source;$('detailDialog').showModal();}
function renderPermissions(){
  if(!lab||permissionMounts.length!==1)return;
  const result=permissionMounts[0].render({search:$('permissionSearch').value,filter:$('permissionFilter').value});
  $('permissionResultCount').textContent=`${result.visible} of ${result.total} capability experiments`;
  renderPermissionReadings();renderSummary();
}
function renderPermissionReadings(){
  const readings=[...signals.values()];permissionMounts.forEach(mount=>mount.updateReadings(readings));
}
function renderFingerprints(){
  const entries=[...signals.values()].filter(s=>s.group==='fingerprint');
  const signature=entries.map(s=>`${s.id}|${s.value}|${s.kind}`).join('\n');if(signature===lastFingerprintKeys&&$('fingerprintCards').children.length)return;lastFingerprintKeys=signature;
  $('fingerprintCards').replaceChildren(...entries.map(s=>{const card=node('article','panel fingerprint-card');card.append(node('span',`tag ${s.kind}`,kindNames[s.kind]||title(s.kind)),node('h2','',s.key),node('p','',s.note||'A changeable browser-reported input; not a verified identity.'));const value=node('div','detail-value',s.value);if(s.value.length>180||/graphics extensions|inputs|fields/i.test(s.key)){const details=node('details');details.append(node('summary','','Show exact values'),value);card.append(details);}else card.append(value);if(s.source){const source=node('a','','About this reading ↗');source.href=s.source;source.target='_blank';source.rel='noopener noreferrer';card.append(source);}return card;}));
  if(!entries.length)$('fingerprintCards').append(node('p','empty','Collecting a local fingerprint snapshot…'));
}
function renderBoundaries(){if($('boundaryCards').children.length)return;$('boundaryCards').append(...limitations.map(item=>{const card=node('article','panel boundary-card');card.append(node('h2','',item.title));const observable=node('div');observable.append(node('strong','','WHAT A PAGE CAN OBSERVE'),node('p','',item.observable));const hidden=node('div');hidden.append(node('strong','hidden-label','WHAT IT CANNOT CONCLUDE'),node('p','',item.hidden));const source=node('a','source-link','Read the source ↗');source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';card.append(observable,hidden,source);return card;}));}
function renderGuide(){if($('guideCards').children.length)return;$('guideCards').append(...guides.map((item,index)=>{const card=node('details','guide-card');const summary=node('summary');summary.append(node('span','guide-number',String(index+1).padStart(2,'0')),node('span','guide-title',item.title));card.append(summary,node('p','',item.summary),node('p','',item.body));const source=node('a','source-link','Read the documentation ↗');source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';card.append(source);return card;}));}
function downloadJson(report,filename){
  let url;
  try{const data=JSON.stringify(report,null,2);url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Download requested. Check your browser’s downloads.');}
  catch{if(url)URL.revokeObjectURL(url);toast('The report could not be prepared. Try again.');}
}
function exportSession(){
  if(!started)return;
  const report={schemaVersion:SESSION_SCHEMA,product:'Observatory',generatedAt:new Date().toISOString(),startedAt:startTime,
    notes:['Demo readings are held in page memory. Private aggregate visit statistics and host access logs are separate.','No uniqueness claim or universal screenshot/extension detection.','Exports can contain IP addresses, request headers, location and other personal readings from demos you enabled. No typed text, clipboard payloads, credentials or raw media are included.','All-time session totals are independent of retained feed entries. Filters only change the display.'],
    summary:evidence.summary(),feedFilters:feedFilters(),signals:[...signals.values()],events:evidence.query({mode:'expert'}).reverse(),fingerprint:sensors?.getSummary().fingerprint||null,permissionExperiments:lab.items.map(item=>({id:item.id,title:item.title,...lab.readState(item.id)}))};
  downloadJson(report,`observatory-session-${new Date().toISOString().slice(0,10)}.json`);
}
function resetSession({updateUrl=true,announce=true}={}){
  sessionToken++;started=false;connection?.stop();connection=null;lastConnectionChange=0;connectionHistory.length=0;sensors?.stop();lab?.dispose();integrity?.stop();permissionMounts.forEach(mount=>mount.dispose());permissionMounts=[];clearInterval(viewTimer);clearTimeout(startupTimer);clearTimeout(routeHighlightTimer);startupDeadline=0;sensors=null;lab=null;integrity=null;signals.clear();evidence.reset();hasRequested=false;lastGroupKeys='';lastTableKeys='';lastFeedKeys='';tableNodes.clear();lastFingerprintKeys='';signalsDirty=false;permissionDirty=false;feedDirty=false;selectedGroup='all';comparisonBaseline=null;
  for(const id of ['eventFeed','signalRows','permissionCards','fingerprintCards','comparisonResults'])$(id)?.replaceChildren();
  for(const id of ['signalSearch','permissionSearch','feedSearch','comparisonFile'])if($(id))$(id).value='';
  for(const id of ['signalKind','permissionFilter','feedCategory','feedKind'])$(id).value='all';
  $('includeStartup').checked=true;setFeedSettings(false);setExpertMode(false);
  $('regenerate').disabled=false;$('regenerate').textContent='Recalculate signatures ↻';
  $('app').hidden=true;$('welcome').hidden=false;preview.setVisible(true);document.querySelector('.skip').href='#main';$('detailDialog').close();$('begin').textContent='Try it on my browser';$('connectionHistory').replaceChildren(node('li','','No verified changes in this session.'));
  for(const id of ['copyResult','tabResult','screenshotResult','clickResult'])if($(id))$(id).textContent='No matching event observed.';
  if($('comparisonStatus'))$('comparisonStatus').textContent='Capture or import a baseline to begin. Files stay in this tab.';
  if(updateUrl){history.pushState(null,'',location.pathname+location.search);applyRoute();$('begin').focus({preventScroll:true});}
  if(announce)toast('Session cleared and demos stopped. Saved browser grants remain in site settings.');
}
const normalCategories=new Set(['all','clicks','clipboard','screenshot','tabs','resolution','swipe']);
function setExpertMode(value){
  expertMode=!!value;const button=$('expertMode');button.setAttribute('aria-checked',String(expertMode));button.classList.toggle('on',expertMode);if(button.querySelector('.switch-label'))button.querySelector('.switch-label').textContent=expertMode?'On':'Off';
  document.querySelectorAll('[data-expert-only]').forEach(el=>el.hidden=!expertMode);
  for(const option of $('feedCategory').options){if(!normalCategories.has(option.value)){option.dataset.label ||= option.textContent.replace(/ \(Expert mode\)$/,'');option.disabled=!expertMode;option.textContent=option.dataset.label+(expertMode?'':' (Expert mode)');}}
  renderFeed(true);
}
function setFeedSettings(open){$('feedSettings').hidden=!open;$('feedSettingsButton').setAttribute('aria-expanded',String(open));if(open)$('feedSearch').focus();}
function focusDestination(element){if(!element)return;highlightedDestination?.classList.remove('route-highlight');highlightedDestination=element;element.setAttribute('tabindex','-1');element.scrollIntoView({block:'start',behavior:'auto'});element.focus({preventScroll:true});element.classList.add('route-highlight');clearTimeout(routeHighlightTimer);routeHighlightTimer=setTimeout(()=>element.classList.remove('route-highlight'),1800);}
function applyRoute(){
  const route=parseRoute(location.hash);
  if(route.unknown){history.replaceState(null,'',location.pathname+location.search);toast('That section was not found. Here is the introduction.');}
  if(route.screen==='dashboard'){
    beginSession();$('welcome').hidden=true;$('app').hidden=false;preview.setVisible(false);document.querySelector('.skip').href='#dashboard';showView(route.view);focusDestination($(`view-${route.view}`).querySelector('h1')||$('dashboard'));
  }else{
    $('welcome').hidden=false;$('app').hidden=true;preview.setVisible(!started);document.querySelector('.skip').href='#main';$('begin').textContent=started?'Return to my session':'Try it on my browser';if($('landingSessionNote'))$('landingSessionNote').hidden=!started;if(!location.hash){window.scrollTo(0,0);}else focusDestination($(route.section)||$('main'));
    if(started&&route.section!=='main')toast('Your session is still running in this tab. Use “Return to my session” to go back.');
  }
}
function navigate(view){if(!DASHBOARD_VIEWS.includes(view))return;const hash=`#${view}`;if(location.hash!==hash)history.pushState(null,'',hash);applyRoute();}
function renderGuided(entry){
  if(/^Synthetic/i.test(entry.title))return;
  const id={clipboard:'copyResult',tabs:'tabResult',screenshot:'screenshotResult'}[entry.category];
  if(id&&$(id))$(id).textContent=`${kindNames[entry.kind]||'Observed'} · ${new Date(entry.time).toLocaleTimeString()} · ${entry.title}. ${entry.detail}`;
}
function startExperiment(name){
  if(name==='browser'){navigate('fingerprints');return;}
  if(name==='extensions'){selectedGroup='integrity';navigate('signals');return;}
  navigate('overview');
  const target=name==='connection'?$('connectionTitle'):({copy:$('copyResult'),tabs:$('tabResult'),screenshots:$('screenshotResult')}[name])?.closest('article');
  focusDestination(target);
}
function renderComparison(){
  if(!comparisonBaseline){$('comparisonStatus').textContent='Capture or import a baseline first. Files stay in this tab.';return;}
  const rows=compareSnapshots(comparisonBaseline,makeSnapshot(signals.values()));
  const counts=Object.fromEntries(['changed','unchanged','unavailable','unstable'].map(key=>[key,rows.filter(row=>row.status===key).length]));
  $('comparisonStatus').textContent=`Baseline: ${new Date(comparisonBaseline.capturedAt).toLocaleString()} · ${counts.changed} changed · ${counts.unchanged} unchanged · ${counts.unavailable} unavailable · ${counts.unstable} unstable. Differences do not identify their cause.`;
  const table=node('table','comparison-table');const head=node('thead');const tr=node('tr');for(const label of ['Reading','Result','Baseline','Current'])tr.append(node('th','',label));head.append(tr);table.append(head);const body=node('tbody');
  for(const row of rows){const tr=node('tr');tr.append(node('th','',row.key),node('td','',title(row.status)));for(const value of [row.before,row.after]){const td=node('td');const details=node('details');details.append(node('summary','',value.length>80?value.slice(0,80)+'…':value),node('p','detail-value',value),node('p','',row.note));td.append(details);tr.append(td);}body.append(tr);}table.append(body);$('comparisonResults').replaceChildren(table);
}
$('begin').addEventListener('click',()=>navigate('overview'));
for(const button of document.querySelectorAll('[data-view],[data-go]'))button.addEventListener('click',event=>{event.preventDefault();navigate(button.dataset.view||button.dataset.go);});
for(const button of document.querySelectorAll('[data-experiment]'))button.addEventListener('click',()=>startExperiment(button.dataset.experiment));
document.querySelector('.sidebar .brand').addEventListener('click',event=>{event.preventDefault();navigate('overview');});
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();focusDestination($('app').hidden?$('main'):$('dashboard'));});
document.addEventListener('click',event=>{const anchor=event.target.closest?.('a[href^="#"]');if(!anchor||event.defaultPrevented||(anchor.target&&anchor.target!=='_self')||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const hash=anchor.getAttribute('href');if(parseRoute(hash).unknown)return;event.preventDefault();if(location.hash!==hash)history.pushState(null,'',hash);applyRoute();});
window.addEventListener('hashchange',applyRoute);
$('signalSearch').addEventListener('input',()=>renderSignalTable(true));$('signalKind').addEventListener('change',()=>renderSignalTable(true));
$('permissionSearch').addEventListener('input',renderPermissions);$('permissionFilter').addEventListener('change',renderPermissions);
$('closeDetail').addEventListener('click',()=>$('detailDialog').close());
$('detailDialog').addEventListener('click',event=>{if(event.target===$('detailDialog')){const rect=$('detailDialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('detailDialog').close();}});
$('clearFeed').addEventListener('click',()=>{evidence.clearLog();lastFeedKeys='';renderFeed(true);toast('Feed cleared. All-time session totals and the startup snapshot are kept.');});
$('stopAll').addEventListener('click',()=>{lab?.stopAll();permissionDirty=true;renderPermissions();toast('Demos stopped. Revoke saved grants through browser site settings.');});
$('feedSettingsButton').addEventListener('click',()=>setFeedSettings($('feedSettings').hidden));
$('closeFeedSettings').addEventListener('click',()=>{setFeedSettings(false);$('feedSettingsButton').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('feedSettings').hidden){setFeedSettings(false);$('feedSettingsButton').focus();}});
document.addEventListener('click',event=>{if(!$('feedSettings').hidden&&!$('feedSettings').contains(event.target)&&!$('feedSettingsButton').contains(event.target))setFeedSettings(false);});
for(const id of ['feedSearch','feedCategory','feedKind','includeStartup'])$(id).addEventListener(id==='feedSearch'?'input':'change',()=>renderFeed(true));
$('clearFilters').addEventListener('click',()=>{$('feedSearch').value='';$('feedCategory').value='all';$('feedKind').value='all';$('includeStartup').checked=true;renderFeed(true);toast('Filters cleared. Evidence and permissions are unchanged.');});
$('expertMode').addEventListener('click',()=>{setExpertMode(!expertMode);toast(`Expert mode ${expertMode?'on':'off'}. No extra permissions were requested.`);});
$('tryClick').addEventListener('click',event=>{$('clickResult').textContent=event.isTrusted?'Observed · A browser-dispatched click reached this sample button. This does not establish identity or attention.':'Diagnostic · A synthetic click was dispatched. It does not prove a physical click.';});
$('checkIntegrity').addEventListener('click',()=>{integrity?.checkNow();renderSummary();toast('Watched page-world API checks refreshed. Cause remains unknown.');});
$('inspectIntegrity').addEventListener('click',()=>{selectedGroup='integrity';$('signalSearch').value='';$('signalKind').value='all';navigate('signals');});
$('regenerate').addEventListener('click',async()=>{const token=sessionToken;$('regenerate').disabled=true;$('regenerate').textContent='Recalculating…';try{await sensors?.fingerprint();if(started&&token===sessionToken){renderFingerprints();toast('A fresh local fingerprint snapshot was collected. Unavailable values stay labelled.');}}catch(error){if(started&&token===sessionToken)toast(`Recalculation could not finish: ${error?.name||'restricted'}.`);}finally{if(token===sessionToken){$('regenerate').disabled=false;$('regenerate').textContent='Recalculate signatures ↻';}}});
$('refreshConnection').addEventListener('click',async()=>{const result=await connection?.checkNow();if(result?.status==='error'||result?.throttled)toast(result.detail||'The latest check failed. The last verified value is retained.');});
$('captureComparison').addEventListener('click',()=>{comparisonBaseline=makeSnapshot(signals.values());downloadJson(comparisonBaseline,`observatory-baseline-${Date.now()}.json`);renderComparison();});
$('compareCurrent').addEventListener('click',renderComparison);
$('comparisonFile').addEventListener('change',async event=>{const token=sessionToken;const file=event.target.files?.[0];if(!file)return;try{if(file.size>MAX_IMPORT_BYTES)throw new Error('Choose a JSON report smaller than 2 MB.');const imported=parseSnapshot(await file.text());if(!started||token!==sessionToken)return;comparisonBaseline=imported;renderComparison();}catch(error){if(started&&token===sessionToken)$('comparisonStatus').textContent=error.message;}finally{if(token===sessionToken)event.target.value='';}});
$('export').addEventListener('click',exportSession);$('reset').addEventListener('click',()=>resetSession());$('resetMobile').addEventListener('click',()=>resetSession());
window.addEventListener('pagehide',()=>resetSession({updateUrl:false,announce:false}));
window.addEventListener('pageshow',event=>{if(event.persisted)applyRoute();});
window.addEventListener('error',event=>{if(started)toast(`A browser feature failed: ${event.error?.name||'unavailable'}. Other readings can continue.`);});
window.addEventListener('unhandledrejection',event=>{if(started)toast(`A browser operation was interrupted: ${event.reason?.name||'restricted'}.`);});
setExpertMode(false);
applyRoute();
