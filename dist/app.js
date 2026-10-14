import {startSensors} from './sensors.js';
import {createPermissionLab} from './permissions.js';
import {guides,limitations} from './learn.js';
import {createEvidenceStore} from './evidence.js';
import {startIntegrity} from './integrity.js';
import {mountPermissionRows} from './permission-rows.js';
import {mountEvidencePreview} from './preview.js';
import {createConnectionMonitor} from './connection.js';
const $ = id => document.getElementById(id);
const node = (tag,className,text) => { const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; };
const title = value => String(value).replace(/(^|[-\s])\w/g,c=>c.toUpperCase());
const groupNames = {browser:'Browser',device:'Device',network:'Network & request',display:'Display',activity:'Activity',clipboard:'Clipboard events',fingerprint:'Fingerprints',performance:'Performance',boundaries:'Boundaries',permissions:'Permission data',integrity:'Page integrity',storage:'Storage',media:'Preferences'};
const kindNames = {observed:'Observed',estimate:'Estimate',unavailable:'Unavailable',permission:'Permission data',possible:'Possible signal',context:'Context'};
const groupTitle = group => groupNames[group] || title(group);
let device = null;
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
let basicMode = true;
let lastFeedKeys = '';
let hasRequested = false;
let toastTimer;
const evidence = createEvidenceStore();
const signals = new Map();
const tableNodes = new Map();
let lastTableKeys='';
let lastGroupKeys='';
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
  if(previous?.value===text&&previous?.kind===kind&&previous?.note===(options.note||''))return;
  signals.set(id,{id,group,key,value:text,kind,note:options.note||'',source:options.source||'',updatedAt:new Date().toISOString()});
  if(evidence.capture(group,key,text,{...options,kind}))feedDirty=true;
  signalsDirty=true;
}
function addEvent(eventTitle,detail,kind='observed',meta={}) {
  if(!started)return;
  finishStartupIfDue();
  evidence.add(eventTitle,detail,kind,meta);feedDirty=true;
}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function chooseDevice(value){device=value;document.querySelectorAll('[data-device]').forEach(button=>{const selected=button.dataset.device===value;button.setAttribute('aria-pressed',String(selected));button.querySelector('.choice-check').textContent=selected?'●':'○';});$('begin').disabled=!device;$('begin').textContent=device?'Start my privacy test ↗':'Choose a device to start';updateDevice();}
function updateDevice(){
  $('switchDevice').textContent=device==='Mobile'?'▯ Mobile':'▣ PC';
  $('deviceTip').textContent=device==='Mobile'?'Try scrolling, rotating, or switching apps. OS edge gestures may never reach the page; a hidden state cannot identify a notification shade or task switcher.':'Try resizing the window or switching to another tab. Visibility changes show that the page was hidden, not where you went.';
  if(started)setSignal('device','Chosen experience',device,{note:'Explicit visitor selection. This is not an automatic hardware classification.',source:'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/maxTouchPoints'});
}
function renderConnection(state){
  if(!started)return;
  $('connectionAddress').textContent=state.address||'Not available yet';
  $('connectionPrevious').textContent=state.previousAddress?`Previous: ${state.previousAddress}`:state.local?'Local preview: this is a loopback connection.':'No earlier address in this session.';
  $('connectionChanges').textContent=state.changes;
  $('connectionStatus').textContent=state.detail||({checking:'Checking the current connection…',ready:'Last check completed.',error:'Check failed; last verified value is kept.',paused:'Paused while the page is hidden.',stopped:'Checks stopped.'}[state.status]||'Waiting for the first check.');
  $('refreshConnection').disabled=!!state.busy;$('refreshConnection').textContent=state.busy?'Checking…':'Check connection';
  $('connectionChecked').textContent=state.checkedAt?`Last successful check: ${new Date(state.checkedAt).toLocaleTimeString()} · ${state.family||'Unknown family'}`:'Not checked yet';
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
  if(!device||started)return;
  started=true;sessionToken++;startTime=new Date().toISOString();startupDeadline=Date.now()+1000;
  $('welcome').hidden=true;$('app').hidden=false;document.querySelector('.skip').href='#dashboard';
  preview.setVisible(false);
  sensors=startSensors({setSignal,addEvent,getDevice:()=>device});
  lab=createPermissionLab({setSignal,addEvent,onChange:()=>{permissionDirty=true;}});
  integrity=startIntegrity({setSignal,addEvent});
  const rowOptions={lab,onRequest:()=>{hasRequested=true;},onInspect:item=>{selectedGroup='permissions';$('signalSearch').value=item.title;$('signalKind').value='all';navigate('signals');},onError:error=>toast(error?.message||`This capability could not finish: ${error?.name||'restricted'}.`)};
  permissionMounts=[mountPermissionRows({container:$('overviewPermissionRows'),...rowOptions}),mountPermissionRows({container:$('permissionCards'),...rowOptions})];
  updateDevice();
  addEvent('Observatory session started',`Experience selected: ${device}. No new permission requests have been made.`,'context');
  lab.readExistingPermissions?.().catch(()=>{});
  connection=createConnectionMonitor({setSignal,addEvent,onUpdate:renderConnection});connection.start();
  viewTimer=setInterval(renderLive,500);
  const token=sessionToken;
  startupTimer=setTimeout(()=>{if(started&&sessionToken===token){startupDeadline=0;evidence.finishStartup();feedDirty=true;renderLive();}},Math.max(0,startupDeadline-Date.now()));
  navigate('overview');renderLive();window.scrollTo(0,0);$('dashboard').focus({preventScroll:true});
}
function navigate(view){
  if(!started||!['overview','signals','permissions','fingerprints','boundaries','guide'].includes(view))return;
  currentView=view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-current',button.dataset.view===view?'page':'false');});
  $('breadcrumbView').textContent={permissions:'PERMISSION LAB',signals:'LIVE SIGNALS',fingerprints:'FINGERPRINTS',boundaries:'THE BOUNDARIES',guide:'FIELD GUIDE',overview:'OVERVIEW'}[view];
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
  const surfaced=[...signals.values()].filter(s=>s.kind!=='unavailable'&&s.group!=='boundaries').length;
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
  $('footerSession').textContent=`${device?.toUpperCase()} EXPERIENCE · ${signals.size} INVENTORY READINGS · SESSION MEMORY ONLY`;
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
function feedFilters(){const category=$('feedCategory').value;return{mode:basicMode?'basic':'extensive',search:$('feedSearch').value,categories:category&&category!=='all'?[category]:[],showStartup:basicMode||$('includeStartup').checked};}
function renderFeed(force=false){
  const entries=evidence.query(feedFilters());const summary=evidence.summary();
  $('feedModeLabel').textContent=basicMode?'Basic mode · clicks, clipboard events, screenshot clues, focus and size changes.':'Extensive mode · activity plus available readings and their changes.';
  $('feedResultCount').textContent=`${entries.length} shown · ${basicMode?'basic':'extensive'}`;
  $('feedRetention').textContent=`${summary.retained} retained / 600 max`;
  $('emptyFeed').hidden=entries.length!==0;
  $('emptyFeed').textContent=basicMode?'No matching activity yet. Interact with the page, or switch off Basic mode to include browser and device readings.':'No entries match these filters. Try another category or search.';
  const keys=entries.map(entry=>entry.id).join('|');if(!force&&keys===lastFeedKeys)return;lastFeedKeys=keys;
  const feed=$('eventFeed');const scrollTop=feed.scrollTop;const previousFirst=feed.firstElementChild;const previousOffset=previousFirst?.getBoundingClientRect().top;
  const existing=new Map([...feed.children].map(el=>[el.dataset.entry,el]));
  const rows=entries.map(entry=>{
    if(existing.has(entry.id))return existing.get(entry.id);
    const el=node('li',`feed-event ${entry.kind}`);el.dataset.entry=entry.id;
    const time=node('time','',new Date(entry.time).toLocaleTimeString([],{hour12:false}));time.dateTime=entry.time;
    const body=node('div');body.append(node('strong','',entry.title),node('span','event-category',title(entry.category)));
    if(entry.startup)body.append(node('span','startup-tag','startup'));
    body.append(node('p','',entry.detail));el.append(time,body);return el;
  });
  feed.replaceChildren(...rows);
  if(!force&&scrollTop>8&&previousFirst?.isConnected)feed.scrollTop=scrollTop+(previousFirst.getBoundingClientRect().top-previousOffset);
  else feed.scrollTop=force?0:scrollTop;
}
function renderIntegrity(){
  const values=[...signals.values()].filter(s=>s.group==='integrity');
  const keys=['Added script elements','Extension-scheme script hints','API reference comparison','Inline handler attribute changes'];
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
  if(!lab||permissionMounts.length!==2)return;
  permissionMounts[0].render({search:$('overviewPermissionSearch').value,filter:$('overviewPermissionFilter').value});
  const result=permissionMounts[1].render({search:$('permissionSearch').value,filter:$('permissionFilter').value});
  $('permissionResultCount').textContent=`${result.visible} of ${result.total} capability experiments`;
  renderPermissionReadings();renderSummary();
}
function renderPermissionReadings(){
  const readings=[...signals.values()];permissionMounts.forEach(mount=>mount.updateReadings(readings));
}
function renderFingerprints(){
  const entries=[...signals.values()].filter(s=>s.group==='fingerprint');
  $('fingerprintCards').replaceChildren(...entries.map(s=>{const card=node('article','panel fingerprint-card');card.append(node('span',`tag ${s.kind}`,kindNames[s.kind]||title(s.kind)),node('h2','',s.key),node('div','detail-value',s.value),node('p','',s.note||'This browser-reported value can contribute to a combined grouping signature.'));if(s.source){const source=node('a','','About this reading ↗');source.href=s.source;source.target='_blank';source.rel='noopener noreferrer';card.append(source);}return card;}));
  if(!entries.length)$('fingerprintCards').append(node('p','empty','Computing local rendering signatures…'));
}
function renderBoundaries(){if($('boundaryCards').children.length)return;$('boundaryCards').append(...limitations.map(item=>{const card=node('article','panel boundary-card');card.append(node('h2','',item.title));const observable=node('div');observable.append(node('strong','','WHAT A PAGE CAN OBSERVE'),node('p','',item.observable));const hidden=node('div');hidden.append(node('strong','hidden-label','WHAT IT CANNOT CONCLUDE'),node('p','',item.hidden));const source=node('a','source-link','Read the source ↗');source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';card.append(observable,hidden,source);return card;}));}
function renderGuide(){if($('guideCards').children.length)return;$('guideCards').append(...guides.map((item,index)=>{const card=node('details','guide-card');const summary=node('summary');summary.append(node('span','guide-number',String(index+1).padStart(2,'0')),node('span','guide-title',item.title));card.append(summary,node('p','',item.summary),node('p','',item.body));const source=node('a','source-link','Read the documentation ↗');source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';card.append(source);return card;}));}
function exportSession(){
  if(!started)return;
  const report={product:'Observatory',generatedAt:new Date().toISOString(),startedAt:startTime,chosenExperience:device,notes:['Session-only observations. Values may be rounded or spoofed.','No uniqueness claim. No universal screenshot, extension or external-controller detection.','Permission data may contain personal readings you explicitly enabled. No typed text or clipboard contents are included.','The startup snapshot covers the first second after entering the dashboard. Filters affect display only.'],summary:evidence.summary(),feedFilters:feedFilters(),signals:[...signals.values()],events:evidence.query({mode:'extensive'}).reverse(),permissionExperiments:lab.items.map(item=>({id:item.id,title:item.title,...lab.readState(item.id)}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=`observatory-session-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Session report downloaded to your device.');
}
function resetSession(){
  sessionToken++;connection?.stop();connection=null;lastConnectionChange=0;connectionHistory.length=0;sensors?.stop();lab?.dispose();integrity?.stop();permissionMounts.forEach(mount=>mount.dispose());permissionMounts=[];started=false;clearInterval(viewTimer);clearTimeout(startupTimer);startupDeadline=0;sensors=null;lab=null;integrity=null;signals.clear();evidence.reset();hasRequested=false;lastGroupKeys='';lastTableKeys='';lastFeedKeys='';tableNodes.clear();signalsDirty=false;permissionDirty=false;feedDirty=false;selectedGroup='all';
  $('eventFeed').replaceChildren();$('signalRows').replaceChildren();$('permissionCards').replaceChildren();$('overviewPermissionRows').replaceChildren();$('fingerprintCards').replaceChildren();$('signalSearch').value='';$('permissionSearch').value='';$('overviewPermissionSearch').value='';$('signalKind').value='all';$('permissionFilter').value='all';$('overviewPermissionFilter').value='all';
  basicMode=true;$('basicMode').setAttribute('aria-checked','true');$('basicMode').classList.add('on');$('basicMode').querySelector('.switch-label').textContent='On';$('feedSearch').value='';$('feedCategory').value='all';$('includeStartup').checked=true;setFeedSettings(false);
  $('regenerate').disabled=false;$('regenerate').textContent='Recalculate signatures ↻';
  $('app').hidden=true;$('welcome').hidden=false;preview.setVisible(true);document.querySelector('.skip').href='#main';$('detailDialog').close();device=null;document.querySelectorAll('[data-device]').forEach(button=>{button.setAttribute('aria-pressed','false');button.querySelector('.choice-check').textContent='○';});$('begin').disabled=true;$('begin').textContent='Choose a device to start';$('connectionHistory').replaceChildren(node('li','','No verified changes in this session.'));window.scrollTo(0,0);toast('Session cleared. Saved browser grants remain in site settings.');
}
document.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',()=>chooseDevice(button.dataset.device)));
$('begin').addEventListener('click',beginSession);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.go)));
document.querySelector('.sidebar .brand').addEventListener('click',event=>{event.preventDefault();navigate('overview');});
$('switchDevice').addEventListener('click',()=>{device=device==='Mobile'?'PC':'Mobile';updateDevice();toast(`${device} experience selected. Browser readings are unchanged by this choice.`);});
$('signalSearch').addEventListener('input',()=>renderSignalTable(true));$('signalKind').addEventListener('change',()=>renderSignalTable(true));
$('permissionSearch').addEventListener('input',renderPermissions);$('permissionFilter').addEventListener('change',renderPermissions);
$('overviewPermissionSearch').addEventListener('input',renderPermissions);$('overviewPermissionFilter').addEventListener('change',renderPermissions);
$('closeDetail').addEventListener('click',()=>$('detailDialog').close());
$('detailDialog').addEventListener('click',event=>{if(event.target===$('detailDialog')){const rect=$('detailDialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('detailDialog').close();}});
$('clearFeed').addEventListener('click',()=>{evidence.clearLog();lastFeedKeys='';renderFeed(true);toast('Feed cleared. Activity totals and the startup snapshot are kept.');});
const stopAllDemos=()=>{lab?.stopAll();permissionDirty=true;renderPermissions();toast('Demos stopped. Revoke saved grants through browser site settings.');};
$('stopAll').addEventListener('click',stopAllDemos);$('overviewStopAll').addEventListener('click',stopAllDemos);
function setFeedSettings(open){$('feedSettings').hidden=!open;$('feedSettingsButton').setAttribute('aria-expanded',String(open));}
function setBasicMode(value){basicMode=!!value;$('basicMode').setAttribute('aria-checked',String(basicMode));$('basicMode').classList.toggle('on',basicMode);$('basicMode').querySelector('.switch-label').textContent=basicMode?'On':'Off';renderFeed(true);}
$('feedSettingsButton').addEventListener('click',()=>setFeedSettings($('feedSettings').hidden));
$('closeFeedSettings').addEventListener('click',()=>{setFeedSettings(false);$('feedSettingsButton').focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('feedSettings').hidden){setFeedSettings(false);$('feedSettingsButton').focus();}});
document.addEventListener('click',event=>{if(!$('feedSettings').hidden&&!$('feedSettings').contains(event.target)&&!$('feedSettingsButton').contains(event.target))setFeedSettings(false);});
$('feedSearch').addEventListener('input',()=>renderFeed(true));$('feedCategory').addEventListener('change',()=>{if(basicMode&&!['all','clicks','clipboard','screenshot','tabs','resolution','swipe'].includes($('feedCategory').value)){setBasicMode(false);toast('Extensive mode enabled to show this category.');}else renderFeed(true);});$('includeStartup').addEventListener('change',()=>renderFeed(true));
$('basicMode').addEventListener('click',()=>{if(!basicMode&&!['all','clicks','clipboard','screenshot','tabs','resolution','swipe'].includes($('feedCategory').value))$('feedCategory').value='all';setBasicMode(!basicMode);});
$('checkIntegrity').addEventListener('click',()=>{integrity?.checkNow();renderSummary();toast('Watched script and JavaScript reference checks refreshed.');});
$('inspectIntegrity').addEventListener('click',()=>{selectedGroup='integrity';$('signalSearch').value='';$('signalKind').value='all';navigate('signals');});
$('regenerate').addEventListener('click',async()=>{const token=sessionToken;$('regenerate').disabled=true;$('regenerate').textContent='Recalculating…';try{await sensors?.fingerprint();if(started&&token===sessionToken){renderFingerprints();toast('Local signatures recalculated. Unavailable values stay labelled.');}}catch(error){if(started&&token===sessionToken)toast(`Recalculation could not finish: ${error?.name||'restricted'}.`);}finally{if(token===sessionToken){$('regenerate').disabled=false;$('regenerate').textContent='Recalculate signatures ↻';}}});
$('refreshConnection').addEventListener('click',async()=>{const result=await connection?.checkNow();if(result?.status==='error')toast(result.detail||'The connection check failed. The last verified IP is kept.');});
$('export').addEventListener('click',exportSession);$('reset').addEventListener('click',resetSession);$('resetMobile').addEventListener('click',resetSession);
window.addEventListener('pagehide',()=>lab?.stopAll());
window.addEventListener('error',event=>{if(started)toast(`A browser feature failed: ${event.error?.name||'unavailable'}. Other readings can continue.`);});
window.addEventListener('unhandledrejection',event=>{if(started)toast(`A browser operation was interrupted: ${event.reason?.name||'restricted'}.`);});
