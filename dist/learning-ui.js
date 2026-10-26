import {CHECKUP_STEPS,QUESTIONS,findQuestions,createLearningState,stepStatus,buildSessionAnswers,plainReport} from './learning.js';

export function mountLearningTools({getSession,onNavigate,onRefreshConnection,onDownload}) {
  const $=id=>document.getElementById(id);
  const assign=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const button=(text,action,className='button secondary')=>{const el=make('button',className,text);el.type='button';el.addEventListener('click',action);return el;};
  const state=createLearningState();
  let index=0,renderedIndex=-1,reportKey='',generation=0,topic='all';
  const reportNodes=new Map();

  function renderQuestions() {
    const list=findQuestions({search:$('questionSearch').value,topic});
    $('questionCount').textContent=`${list.length} of ${QUESTIONS.length} questions`;
    $('questionEmpty').hidden=list.length!==0;
    $('questionLibrary').replaceChildren(...list.map(q=>{
      const details=make('details','answer-card');const summary=make('summary');summary.append(make('span','answer-topic',q.topic),make('span','',q.title));
      details.append(summary,make('p','answer-body',q.answer));
      const limit=make('p','answer-limit');limit.append(make('strong','','The limit: '),document.createTextNode(q.limit));details.append(limit);
      const actions=make('div','answer-actions');actions.append(button('Explore this in the lab',()=>{if(q.view==='checkup'){const next=CHECKUP_STEPS.findIndex(step=>step.id===q.id);if(next>=0){index=next;renderedIndex=-1;}}onNavigate(q.view,q.id);},'text-button'));
      const source=make('a','','Read the documentation ↗');source.href=q.source;source.target='_blank';source.rel='noopener noreferrer';actions.append(source);details.append(actions);return details;
    }));
  }
  const topics=['all',...new Set(QUESTIONS.map(q=>q.topic))];
  $('questionTopics').replaceChildren(...topics.map(value=>{const el=button(value==='all'?'All questions':value,()=>{topic=value;for(const b of $('questionTopics').children)b.setAttribute('aria-pressed',String(b.dataset.topic===value));renderQuestions();},'question-topic');el.dataset.topic=value;el.setAttribute('aria-pressed',String(value===topic));return el;}));
  $('questionSearch').addEventListener('input',renderQuestions);
  $('clearQuestionSearch').addEventListener('click',()=>{$('questionSearch').value='';topic='all';for(const b of $('questionTopics').children)b.setAttribute('aria-pressed',String(b.dataset.topic==='all'));renderQuestions();$('questionSearch').focus();});
  renderQuestions();

  function selectStep(next,focus=true) {
    index=Math.max(0,Math.min(CHECKUP_STEPS.length-1,next));
    renderStep();update();
    if(focus)$('checkupQuestion').focus({preventScroll:true});
  }
  const stepButtons=CHECKUP_STEPS.map((step,i)=>{const el=button(`${i+1}. ${step.label}`,()=>selectStep(i),'checkup-step');el.dataset.step=step.id;return el;});
  $('checkupSteps').replaceChildren(...stepButtons);

  function renderStep() {
    if(renderedIndex===index)return;
    renderedIndex=index;
    const step=CHECKUP_STEPS[index];
    $('checkupNumber').textContent=`QUESTION ${index+1} OF ${CHECKUP_STEPS.length}`;
    $('checkupQuestion').textContent=step.question;
    $('checkupAnswer').textContent=step.answer;
    $('checkupInstruction').textContent=step.action;
    $('checkupLimit').textContent=step.limit;
    $('checkupBack').disabled=index===0;
    $('checkupNext').textContent=index===CHECKUP_STEPS.length-1?'See my results →':'Next question →';
    const area=$('checkupAction');area.replaceChildren();
    if(step.id==='click')area.append(button('Try this sample button',event=>{state.markClick(event.isTrusted);update();},'button primary'));
    if(step.id==='copy'){const p=make('p','copy-sample','Copy this harmless sentence to test a page event. Observatory does not read the copied payload.');p.tabIndex=0;area.append(p);}
    if(step.id==='tabs'){const a=make('a','button secondary','Open a blank test tab ↗');a.href='about:blank';a.target='_blank';a.rel='noopener noreferrer';area.append(a,make('p','learning-small','Return to this tab afterwards. The page cannot identify the destination you chose.'));}
    if(step.id==='screenshots')area.append(button('I understand: a clue is not confirmation',()=>{state.review('screenshots');update();},'button primary'));
    if(step.id==='connection')area.append(button('Check connection again',async event=>{const token=generation;const el=event.currentTarget;el.disabled=true;el.textContent='Checking…';try{await onRefreshConnection();}finally{if(token===generation){el.disabled=false;el.textContent='Check connection again';update();}}},'button primary'));
    if(step.id==='recognition')area.append(button('Inspect fingerprint readings',()=>onNavigate('fingerprints')),button('I understand: a hash is not identity',()=>{state.review('recognition');update();},'button primary'));
  }
  $('checkupBack').addEventListener('click',()=>selectStep(index-1));
  $('checkupNext').addEventListener('click',()=>index===CHECKUP_STEPS.length-1?onNavigate('report'):selectStep(index+1));
  $('checkupSkip').addEventListener('click',()=>{state.skip(CHECKUP_STEPS[index].id);index===CHECKUP_STEPS.length-1?onNavigate('report'):selectStep(index+1);});

  function renderReport(session) {
    const answers=buildSessionAnswers(session,state.read());
    const signature=JSON.stringify(answers);if(signature===reportKey)return;reportKey=signature;
    if(!reportNodes.size){
      $('reportAnswers').replaceChildren(...answers.map(answer=>{const card=make('article','report-answer');const badge=make('span','tag');const result=make('p','report-result');card.append(make('h2','',answer.question),badge,result,make('p','report-limit',answer.limit));card.append(button('Inspect this evidence →',()=>onNavigate(({recognition:'fingerprints',permissions:'permissions'}[answer.id]||'overview'),answer.id),'text-button'));reportNodes.set(answer.id,{badge,result});return card;}));
    }
    for(const answer of answers){const {badge,result}=reportNodes.get(answer.id);badge.className=`tag ${answer.kind}`;badge.textContent={possible:'Possible clue',observed:'Observed',estimate:'Estimate',permission:'Permission data',unavailable:'Unavailable',context:'Context'}[answer.kind];result.textContent=answer.result;}
  }
  function update() {
    const session=getSession();const snapshot=state.read();
    let explored=0;
    CHECKUP_STEPS.forEach((step,i)=>{const status=stepStatus(step.id,snapshot,session);if(status.done)explored++;stepButtons[i].classList.toggle('is-current',i===index);stepButtons[i].classList.toggle('is-done',status.done);stepButtons[i].setAttribute('aria-current',i===index?'step':'false');stepButtons[i].setAttribute('aria-label',`${i+1}. ${step.label}: ${status.label}`);});
    $('checkupProgress').value=explored;
    $('checkupProgressText').textContent=`${explored} of ${CHECKUP_STEPS.length} steps completed or skipped. This is learning progress, not a privacy rating.`;
    $('overviewProgress').textContent=explored?`${explored} of 6 steps completed or skipped`:'Six short questions. No new permissions required.';
    if(!$('view-checkup').hidden){renderStep();const step=CHECKUP_STEPS[index],status=stepStatus(step.id,snapshot,session);assign('checkupStatus',status.label);$('checkupStatus').className=`tag ${status.kind}`;const answer=buildSessionAnswers(session,snapshot).find(a=>a.id===step.id);const event=snapshot.latest[step.id];assign('checkupEvidence',event?`${new Date(event.time).toLocaleTimeString()} · ${event.title}. ${event.detail}`:answer?.result||'No matching sample event observed.');}
    if(!$('view-report').hidden)renderReport(session);
  }
  $('downloadPlainReport').addEventListener('click',()=>onDownload(plainReport(getSession(),state.read(),{includePersonal:$('includeReportPersonal').checked}),`observatory-summary-${new Date().toISOString().slice(0,10)}.txt`));
  $('printPlainReport').addEventListener('click',()=>window.print());
  return {
    update,
    observe(entry){state.observe(entry);},
    markSampleClick(trusted){state.markClick(trusted);},
    reset(){generation++;state.reset();index=0;renderedIndex=-1;reportKey='';reportNodes.clear();$('reportAnswers').replaceChildren();$('includeReportPersonal').checked=false;update();},
  };
}
