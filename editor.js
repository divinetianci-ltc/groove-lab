'use strict';
const lanes=[['hat','踩镲','✣'],['ride','叮叮镲','✧'],['crash','强音镲','✦'],['rack','通鼓 1','◉'],['rack2','通鼓 2','◉'],['snare','军鼓','●'],['floor','落地通鼓','◎'],['kick','底鼓','◒']];
const bars=4,TICKS_PER_BEAT=12,TICKS_PER_BAR=48,TOTAL_TICKS=192,DIVISIONS=[1,2,3,4,6];
const RHYTHM_NAMES={1:'4 分',2:'8 分',4:'16 分',3:'3 连',6:'6 连'};
const $=id=>document.getElementById(id),clone=value=>JSON.parse(JSON.stringify(value));
const defaultBeats=(div=0)=>Array.from({length:16},()=>({split:false,div,left:0,right:0}));
function blank(){const d={rolls:{}};for(const [id] of lanes){d[id]=Array(TOTAL_TICKS).fill(0);d.rolls[id]=Array(TOTAL_TICKS).fill(false)}return d}
function makePreset(name){const d=blank();if(name==='blank')return d;for(let b=0;b<bars;b++){
  const offset=b*TICKS_PER_BAR,put=(id,positions,v=2)=>positions.forEach(p=>d[id][offset+Math.round(p*12)]=v);
  for(let i=0;i<48;i+=name==='funk'?3:6)d.hat[offset+i]=name==='funk'&&i%12===0?3:2;
  if(name==='basic'){put('snare',[1,3],3);put('kick',[0,2,2.5])}
  if(name==='funk'){put('snare',[1,3],3);put('snare',[1.75,2.5,3.75],1);put('kick',[0,.75,1.5,2.5])}
  if(name==='halftime'){put('snare',[2],3);put('snare',[1.5,3.5],1);put('kick',[0,1.25,2.75])}
}return d}
let beats=defaultBeats(),data=blank(),rollEdit=false,undoStack=[],selectedBeat=0,editorRange='beat',chosenRhythm=0;
let playing=false,starting=false,startRequest=0,audio=null,timer=null,animation=null,loop=true,metro=false,listenPractice=false;
let practicePhase=0,current=-1,nextTick=-48,nextTime=0,visualQueue=[],eventMap=new Map(),finishing=false;
const activeSources=new Set();
function baseSlots(beatIndex){
  const c=beats[beatIndex],start=beatIndex*12,result=[];
  const add=(offset,length,n)=>{if(!n){result.push({tick:start+offset,duration:length,waiting:true,retained:false});return}for(let i=0;i<n;i++)result.push({tick:start+offset+i*length/n,duration:length/n,waiting:false,retained:false})};
  if(c.split){add(0,6,c.left);add(6,6,c.right)}else add(0,12,c.div);
  return result;
}
function beatSlots(index){
  const result=baseSlots(index),known=new Set(result.map(s=>s.tick)),start=index*12;
  for(let tick=start;tick<start+12;tick++)if(!known.has(tick)&&lanes.some(([id])=>data[id][tick]))result.push({tick,retained:true,waiting:false});
  result.sort((a,b)=>a.tick-b.tick);
  result.forEach((s,i)=>{if(s.waiting&&lanes.some(([id])=>data[id][s.tick])){s.waiting=false;s.retained=true}if(s.retained)s.duration=(result[i+1]?.tick??start+12)-s.tick});
  return result;
}
function allSlots(){return beats.flatMap((_,i)=>beatSlots(i))}
function noteLabel(tick){return `第 ${Math.floor(tick/48)+1} 小节第 ${Math.floor(tick%48/12)+1} 拍`}
function countLabel(s){const p=s.tick%12;if(s.waiting)return '·';if(s.retained)return '原';if(p===0)return Math.floor(s.tick%48/12)+1;if(p===6)return '&';if(p===3)return 'e';if(p===9)return 'a';return p%4===0?`${p/4}/3`:p%2===0?`${p/2}/6`:`${p}/12`}
function beatName(c){if(c.split)return '混合';return RHYTHM_NAMES[c.div]||'待选'}
function selectedRhythm(){const c=beats[selectedBeat];if(editorRange==='beat')return c.split?0:c.div;const n=c.split?c[editorRange]:0;return n===1?2:n===2?4:n===3?3:n===6?6:0}
function updateSelection(){
  $('selectedPosition').textContent=`第 ${Math.floor(selectedBeat/4)+1} 小节 · 第 ${selectedBeat%4+1} 拍`;
  $('scopeToggle').textContent=editorRange==='beat'?'半拍选项':editorRange==='left'?'前半拍 · 选项':'后半拍 · 选项';
  document.querySelectorAll('.range-btn').forEach(b=>{const active=b.dataset.range===editorRange;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  const selected=selectedRhythm()||chosenRhythm;
  document.querySelectorAll('.rhythm-btn').forEach(b=>{const active=+b.dataset.rhythm===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.disabled=editorRange!=='beat'&&+b.dataset.rhythm===1;b.title=b.disabled?'4 分音符占整拍，请先选择“整拍”':''});
  $('applyBarRhythm').disabled=!selected;$('applyBarRhythm').hidden=editorRange!=='beat';
  $('rhythmHelp').textContent=editorRange==='beat'?(selected?`${RHYTHM_NAMES[selected]}已选好。直接点音符；待选拍会使用此节奏。`:'先选上方节奏，再点下方音符。每拍仍可单独改节奏。'):'半拍范围：8 分为 1 格，16 分为 2 格，3 连为 3 格，6 连为 6 格。';
  document.querySelectorAll('.beat-select').forEach(b=>{const on=+b.dataset.beat===selectedBeat;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
  document.querySelectorAll('.bar-jump').forEach(b=>b.classList.toggle('active',+b.dataset.bar===Math.floor(selectedBeat/4)));
  document.querySelectorAll('.cell').forEach(c=>c.classList.toggle('selected-beat',Math.floor(+c.dataset.tick/12)===selectedBeat));
  $('undo').disabled=!undoStack.length;
}
function render(){
  const scroll=$('timelineScroll')?.scrollLeft||0,mobile=matchMedia('(max-width:760px)').matches,labelWidth=mobile?86:108,gap=mobile?6:5;
  const groups=Array.from({length:16},(_,i)=>beatSlots(i)),slots=groups.flat();
  const widths=groups.map(g=>Math.max(mobile?44:30,Math.ceil(68/g.length))),columns=groups.map((g,i)=>`repeat(${g.length},minmax(${widths[i]}px,1fr))`).join(' ');
  const minWidth=labelWidth+groups.reduce((sum,g,i)=>sum+g.length*widths[i],0)+gap*slots.length;
  const headers='<div class="timeline-label">4 小节</div>'+Array.from({length:4},(_,bar)=>`<button class="bar-heading ${bar?'bar-separator':''}" id="barHead-${bar}" data-action="select-bar" data-bar="${bar}" style="grid-column:span ${groups.slice(bar*4,bar*4+4).reduce((sum,g)=>sum+g.length,0)}">第 ${bar+1} 小节</button>`).join('');
  const beatRow='<div class="timeline-label">点拍号</div>'+groups.map((g,i)=>`<button class="beat-select ${i%4===0&&i?'bar-separator':''}" id="beat-${i}" style="grid-column:span ${g.length}" data-action="select-beat" data-beat="${i}" aria-label="选择第 ${Math.floor(i/4)+1} 小节第 ${i%4+1} 拍"><strong>${i%4+1}</strong><small>${beatName(beats[i])}</small></button>`).join('');
  const counts='<div class="timeline-label">计数</div>'+slots.map(s=>`<div class="count ${s.tick%12===0?'beat':''} ${s.retained?'retained':''} ${s.tick%48===0&&s.tick?'bar-separator':''}" title="${s.retained?'保留的已有音符位置':noteLabel(s.tick)}">${countLabel(s)}</div>`).join('');
  const rows=lanes.map(([id,name,icon])=>`<div class="lane-label"><span>${icon}</span>${name}</div>`+slots.map(s=>`<button class="cell ${s.tick%12===0?'beat-start':''} ${s.tick%48===0&&s.tick?'bar-separator':''} ${s.waiting?'waiting':''} ${s.retained?'retained':''} ${data.rolls[id][s.tick]?'roll':''}" data-lane="${id}" data-tick="${s.tick}" data-duration="${s.duration}" data-waiting="${s.waiting?'true':'false'}" data-v="${data[id][s.tick]}" aria-label="${name}，${noteLabel(s.tick)}，${s.waiting?'请先选择节奏':['关闭','鬼音','常规','重音'][data[id][s.tick]]}${data.rolls[id][s.tick]?'，Double 双击':''}" aria-pressed="${!!data[id][s.tick]}">${s.waiting?'·':''}</button>`).join('')).join('');
  $('bars').innerHTML=`<div class="timeline-scroll" id="timelineScroll"><div class="timeline-grid" id="timelineGrid" style="grid-template-columns:${labelWidth}px ${columns};min-width:${minWidth}px">${headers}${beatRow}${counts}${rows}</div></div>`;
  $('timelineScroll').scrollLeft=scroll;updateSelection();
}
function message(text){$('editMessage').textContent=text}
function remember(){undoStack.push(clone({beats,data}));if(undoStack.length>30)undoStack.shift();stop()}
function finishEdit(text){render();saveHash();if(text)message(text)}
function selectBeat(index){if(!Number.isInteger(index)||index<0||index>=16)return;selectedBeat=index;editorRange='beat';updateSelection()}
function scrollToBar(bar){selectBeat(bar*4);const scroll=$('timelineScroll'),head=$(`barHead-${bar}`);if(scroll&&head){const labelWidth=matchMedia('(max-width:760px)').matches?86:108,left=Math.max(0,scroll.scrollLeft+head.getBoundingClientRect().left-scroll.getBoundingClientRect().left-labelWidth-16);if(scroll.scrollTo)scroll.scrollTo({left,behavior:'smooth'});else scroll.scrollLeft=left}}
function setRhythm(index,wholeDivision,range){
  const c=beats[index];if(range==='beat'){c.div=wholeDivision;c.split=false;return}
  if(!c.split){const half=[2,4,6].includes(c.div)?c.div/2:0;c.left=c.right=half;c.split=true}
  c[range]=wholeDivision===2?1:wholeDivision===4?2:wholeDivision;
}
function applyRhythm(value,wholeBar=false){
  if(!DIVISIONS.includes(value)||(editorRange!=='beat'&&value===1))return;
  chosenRhythm=value;
  remember();const indices=wholeBar?Array.from({length:4},(_,i)=>Math.floor(selectedBeat/4)*4+i):[selectedBeat];
  for(const index of indices)setRhythm(index,value,editorRange);
  const retained=indices.reduce((sum,i)=>sum+beatSlots(i).filter(s=>s.retained).length,0);
  finishEdit(`${RHYTHM_NAMES[value]}已设置${wholeBar?'到本小节':''}，现在可以点音符。${retained?'已有音符保留，可撤销。':''}`);
}
function captureBar(bar){const start=bar*48,snapshot={beats:clone(beats.slice(bar*4,bar*4+4)),data:{},rolls:{}};for(const [id] of lanes){snapshot.data[id]=data[id].slice(start,start+48);snapshot.rolls[id]=data.rolls[id].slice(start,start+48)}return snapshot}
function writeBar(bar,snapshot){beats.splice(bar*4,4,...clone(snapshot.beats));for(const [id] of lanes){data[id].splice(bar*48,48,...snapshot.data[id]);data.rolls[id].splice(bar*48,48,...snapshot.rolls[id])}}
function duplicateBar(from,target){
  if(!Number.isInteger(from)||from<0||from>=4)return;
  const targets=target==='all'?[0,1,2,3].filter(b=>b!==from):Number.isInteger(target)&&target>=0&&target<4&&target!==from?[target]:[];if(!targets.length)return;
  const snapshot=captureBar(from);remember();for(const bar of targets)writeBar(bar,snapshot);
  finishEdit(`第 ${from+1} 小节已复制到${targets.map(b=>`第 ${b+1} 小节`).join('、')}，可撤销。`);
}
function updateCopyTargets(){const from=+ $('copyFrom').value;document.querySelectorAll('.copy-target').forEach(b=>b.disabled=b.dataset.target===String(from))}
$('copyBarsToggle').onclick=()=>{const panel=$('barCopyPanel');panel.hidden=!panel.hidden;$('copyBarsToggle').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){$('copyFrom').value=String(Math.floor(selectedBeat/4));updateCopyTargets()}};
$('closeBarCopy').onclick=()=>{$('barCopyPanel').hidden=true;$('copyBarsToggle').setAttribute('aria-expanded','false')};
$('copyFrom').onchange=updateCopyTargets;
$('copyTargets').addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;duplicateBar(+ $('copyFrom').value,button.dataset.target==='all'?'all':+button.dataset.target)});
$('barNav').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.bar!==undefined)scrollToBar(+b.dataset.bar)});
$('scopeToggle').onclick=()=>{const open=$('rhythmPanel').classList.toggle('scope-open');$('scopeToggle').setAttribute('aria-expanded',String(open))};
$('rangeButtons').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!['beat','left','right'].includes(b.dataset.range))return;editorRange=b.dataset.range;updateSelection()});
$('rhythmOptions').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.rhythm&&!b.disabled)applyRhythm(+b.dataset.rhythm)});
$('applyBarRhythm').onclick=()=>{const value=selectedRhythm()||chosenRhythm;if(value)applyRhythm(value,true)};
$('bars').addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.action==='select-bar'){scrollToBar(+button.dataset.bar);return}if(button.dataset.action==='select-beat'){selectBeat(+button.dataset.beat);return}
  if(!button.classList.contains('cell'))return;
  const lane=button.dataset.lane,tick=+button.dataset.tick;selectedBeat=Math.floor(tick/12);updateSelection();
  const waiting=button.dataset.waiting==='true';
  if(waiting&&!chosenRhythm){message('先选上方的节奏类型，再回来点音符。');$('rhythmPanel').scrollIntoView?.({behavior:'smooth',block:'center'});return}
  if(waiting){remember();const c=beats[selectedBeat],range=c.split?(tick%12<6?'left':'right'):'beat';setRhythm(selectedBeat,chosenRhythm===1&&range!=='beat'?2:chosenRhythm,range)}else remember();
  if(rollEdit){if(!data[lane][tick])data[lane][tick]=2;data.rolls[lane][tick]=!data.rolls[lane][tick]}else{data[lane][tick]=({0:2,2:3,3:1,1:0})[data[lane][tick]];if(!data[lane][tick])data.rolls[lane][tick]=false}
  if(waiting){finishEdit(`${RHYTHM_NAMES[chosenRhythm]}已设置，音符已输入。`);return}
  button.dataset.v=data[lane][tick];button.classList.toggle('roll',data.rolls[lane][tick]);button.setAttribute('aria-pressed',String(!!data[lane][tick]));button.setAttribute('aria-label',`${lanes.find(x=>x[0]===lane)[1]}，${noteLabel(tick)}，${['关闭','鬼音','常规','重音'][data[lane][tick]]}${data.rolls[lane][tick]?'，Double 双击':''}`);
  $('undo').disabled=false;saveHash();if(button.classList.contains('retained')&&!lanes.some(([id])=>data[id][tick]))render();
});
$('undo').onclick=()=>{if(!undoStack.length)return;stop();const saved=undoStack.pop();beats=saved.beats;data=saved.data;finishEdit('已撤销上一项修改。')};
$('clear').onclick=()=>{remember();data=blank();beats=defaultBeats();selectedBeat=0;editorRange='beat';chosenRhythm=0;$('preset').value='blank';finishEdit('四小节已清空，可以重新选择节奏；可撤销。')};
$('preset').onchange=e=>{remember();chosenRhythm=e.target.value==='blank'?0:4;beats=defaultBeats(chosenRhythm);data=makePreset(e.target.value);finishEdit('已载入四小节预设，可撤销。')};
$('rollMode').onclick=()=>{rollEdit=!rollEdit;$('rollMode').classList.toggle('active',rollEdit);$('rollMode').setAttribute('aria-pressed',String(rollEdit));$('hint').textContent=rollEdit?'Double 已开启：点音符添加或取消双击，力度不变。':'点击：常规 → 重音 → 鬼音 → 关闭；开启 Double 后点击添加或取消双击。';message(rollEdit?'Double 已开启：点音符添加或取消双击。':'Double 已关闭：点音符切换力度。')};
function saveHash(){const notes={};for(const [id] of lanes)notes[id]=data[id].flatMap((v,tick)=>v?[[tick,v,data.rolls[id][tick]?1:0]]:[]);const hash='#'+btoa(JSON.stringify({v:2,bars:4,beats,notes}));try{if(typeof history!=='undefined'&&history.replaceState)history.replaceState(null,'',hash);else location.hash=hash;return true}catch{return false}}
function loadHash(){
  if(!location.hash||location.hash.length>240000)return;
  try{const saved=JSON.parse(atob(location.hash.slice(1))),nextData=blank(),nextBeats=defaultBeats();
    if(saved.v===2&&Array.isArray(saved.beats)&&saved.beats.length===16&&saved.notes){
      saved.beats.forEach((c,i)=>{if(c&&[c.div,c.left,c.right].every(n=>n===0||DIVISIONS.includes(n)))nextBeats[i]={split:c.split===true,div:c.div,left:c.left,right:c.right}});
      for(const [id] of lanes)if(Array.isArray(saved.notes[id]))for(const n of saved.notes[id])if(Array.isArray(n)&&Number.isInteger(n[0])&&n[0]>=0&&n[0]<192&&[1,2,3].includes(n[1])){nextData[id][n[0]]=n[1];nextData.rolls[id][n[0]]=n[2]===1}
    }else{
      const old=saved.data||saved,steps=[8,12,16,24].includes(saved.steps)?saved.steps:([8,12,16,24].includes(old.hat?.length)?old.hat.length:16),oldBars=Math.min(4,Math.ceil((old.hat?.length||steps)/steps));
      for(let i=0;i<oldBars*4;i++)nextBeats[i].div=steps/4;
      for(const [id] of lanes)if(Array.isArray(old[id]))old[id].slice(0,steps*4).forEach((v,i)=>{const tick=Math.floor(i/steps)*48+(i%steps)*48/steps;if([1,2,3].includes(v)){nextData[id][tick]=v;nextData.rolls[id][tick]=old.rolls?.[id]?.[i]===true}});
    }data=nextData;beats=nextBeats;if(data.hat.some(Boolean)||data.snare.some(Boolean)||data.kick.some(Boolean))$('preset').value='blank';
  }catch{message('链接内容无法读取，已打开空白节奏。')}
}
$('copy').onclick=async()=>{saveHash();try{await navigator.clipboard.writeText(location.href);message('节奏链接已复制，音色不包含在链接中。')}catch{message('此浏览器无法自动复制，请从地址栏复制完整地址。')}};
