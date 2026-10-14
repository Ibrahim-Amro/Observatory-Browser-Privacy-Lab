const examples = [
  ['+00:01','Page button clicked','Observed','A click reached the page. The element type can be recorded.'],
  ['+00:03','Possible screenshot shortcut','Clue','A capture-related key reached the page. A screenshot is not confirmed.'],
  ['+00:05','Page became hidden','Observed','A tab switch is one possible cause. The destination is unknown.'],
  ['+00:08','Page copy event','Observed','A copy event reached this document. Contents were not read.'],
  ['+00:10','Viewport changed','Observed','The visible page area changed to 1440 × 900 CSS pixels.'],
  ['+00:12','Connection IP checked','Observed','The server can see the address of the connection reaching it.'],
  ['+00:15','Page regained focus','Observed','The browser returned focus to the page. Outside activity is unknown.'],
  ['+00:18','JavaScript reference changed','Observed','A watched API reference changed. The cause is not identified.'],
];

export function mountEvidencePreview({container,button}) {
  if(!container||!button)return {setVisible(){}};
  const doc=container.ownerDocument;
  const group=doc.createElement('div');group.className='preview-row-group';
  for(const [time,title,kind,detail] of examples){
    const row=doc.createElement('div');row.className=`preview-evidence-row ${kind==='Clue'?'is-clue':''}`;
    const stamp=doc.createElement('span');stamp.className='preview-time';stamp.textContent=time;
    const body=doc.createElement('div');const heading=doc.createElement('strong');heading.textContent=title;
    const tag=doc.createElement('span');tag.className='preview-kind';tag.textContent=kind;
    const description=doc.createElement('p');description.textContent=detail;
    body.append(heading,tag,description);row.append(stamp,body);group.append(row);
  }
  container.replaceChildren(group,group.cloneNode(true));
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused=preference.matches;let visible=true;
  const update=()=>{container.classList.toggle('is-paused',paused||!visible);button.textContent=paused?'Play preview':'Pause preview';button.setAttribute('aria-pressed',String(paused));};
  button.addEventListener('click',()=>{paused=!paused;update();});
  preference.addEventListener?.('change',event=>{if(event.matches){paused=true;update();}});
  update();
  return {setVisible(value){visible=!!value;update();}};
}
