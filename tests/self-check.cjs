const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class ClassList{
  constructor(value=''){this.values=new Set(value.split(/\s+/).filter(Boolean))}
  contains(x){return this.values.has(x)}add(...xs){xs.forEach(x=>this.values.add(x))}remove(...xs){xs.forEach(x=>this.values.delete(x))}
  toggle(x,force){const on=force===undefined?!this.contains(x):!!force;on?this.add(x):this.remove(x);return on}
}
class Element{
  constructor(doc,id='',tag='BUTTON'){this.doc=doc;this.id=id;this.tagName=tag;this.dataset={};this.listeners={};this.classList=new ClassList();this.attrs={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.scrollLeft=0;this._html=''}
  set innerHTML(value){this._html=value;if(this.id==='bars'||this.id==='sampleTable')this.doc.parse(value,this.id)}get innerHTML(){return this._html}
  setAttribute(key,value){this.attrs[key]=value}addEventListener(type,fn){this.listeners[type]=fn}
  closest(selector){return selector==='button'&&this.tagName==='BUTTON'?this:selector==='.cell'&&this.classList.contains('cell')?this:null}
  getBoundingClientRect(){return{left:this.dataset.bar!==undefined?108+2000* +this.dataset.bar:0}}
  scrollTo(options){this.scrollLeft=options.left}
  showModal(){this.open=true}close(){this.open=false}
}
class Document{
  constructor(){this.elements={};this.scopes={};this.baseURI=require('url').pathToFileURL(path.join(root,'index.html')).href}
  getElementById(id){return this.elements[id]||(this.elements[id]=new Element(this,id))}
  querySelectorAll(selector){return Object.values(this.scopes).flat().filter(el=>el.classList.contains(selector.slice(1)))}
  parse(markup,scope){const list=[];for(const match of markup.matchAll(/<(button|select|div|span|input)\b([^>]*)>/g)){
    const attrs=Object.fromEntries(Array.from(match[2].matchAll(/([\w-]+)="([^"]*)"/g),a=>[a[1],a[2]])),el=new Element(this,attrs.id||'',match[1].toUpperCase());
    el.attrs=attrs;el.classList=new ClassList(attrs.class||'');el.disabled=/\bdisabled\b/.test(match[2]);el.hidden=/\bhidden\b/.test(match[2]);
    for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))el.dataset[key.slice(5)]=value;
    if(el.id)this.elements[el.id]=el;list.push(el);
  }this.scopes[scope]=list}
}
function node(extra={}){return{connect(to){return to},...extra}}
class Audio{
  constructor(){this.currentTime=0;this.sampleRate=48000;this.destination={};this.sampleStarts=[];this.oscillatorStarts=[];this.gains=[];this.stops=0}
  async resume(){}
  createGain(){const context=this;return node({gain:{setValueAtTime(value,time){context.gains.push({value,time})},exponentialRampToValueAtTime(){}}})}
  createBufferSource(){const context=this;return node({start(time){context.sampleStarts.push({buffer:this.buffer,time})},stop(){context.stops++}})}
  createOscillator(){const context=this;return node({frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},start(time){context.oscillatorStarts.push({time,frequency:this.frequency.value})},stop(){context.stops++}})}
  createBuffer(_c,n){return{getChannelData(){return new Float32Array(n)}}}createBiquadFilter(){return node({frequency:{value:0}})}
  async decodeAudioData(bytes){const b=Buffer.from(bytes);if(b[0]===255)throw new Error('bad audio');if(b.toString('ascii',0,4)==='RIFF'){const rate=b.readUInt32LE(24),align=b.readUInt16LE(32),size=b.readUInt32LE(40);return{marker:b[0],duration:size/align/rate}}return{marker:b[0],duration:b[0]===254?13:1}}
}
function app(hash='',store=null,mobile=false){
  const document=new Document();document.parse(html.split('<script>')[0],'static');document.getElementById('tempo').value='90';document.getElementById('preset').value='blank';
  document.getElementById('builtinSampleData').textContent=html.match(/<script type="application\/json" id="builtinSampleData">([\s\S]*?)<\/script>/)[1];
  const location={protocol:'file:',href:'file:///groove-lab/index.html'+hash};Object.defineProperty(location,'hash',{get(){return hash},set(value){hash=value.startsWith('#')?value:'#'+value},configurable:true});
  const context=vm.createContext({console,document,location,navigator:{clipboard:{async writeText(){}}},window:{AudioContext:Audio,...(store?{indexedDB:store}:{})},matchMedia:()=>({matches:mobile}),addEventListener(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,ArrayBuffer,Uint8Array,Float32Array,Math,JSON,Array,Map,Set,btoa:x=>Buffer.from(x,'binary').toString('base64'),atob:x=>Buffer.from(x,'base64').toString('binary')});
  context.URL=URL;context.fetch=async url=>{const bytes=fs.readFileSync(require('url').fileURLToPath(url));return{ok:true,async arrayBuffer(){return Uint8Array.from(bytes).buffer}}};
  vm.runInContext(source,context);return{context,document,$:id=>document.getElementById(id)};
}
const state=(a,code)=>vm.runInContext(code,a.context),json=(a,code)=>JSON.parse(JSON.stringify(state(a,code)));
function cell(a,lane,tick){return a.document.querySelectorAll('.cell').find(c=>c.dataset.lane===lane&&+c.dataset.tick===tick)}
function click(a,el){a.$('bars').listeners.click({target:el})}
function palette(a,n){const target=a.document.querySelectorAll('.rhythm-btn').find(b=>+b.dataset.rhythm===n);a.$('rhythmOptions').listeners.click({target})}
function range(a,name){const target=a.document.querySelectorAll('.range-btn').find(b=>b.dataset.range===name);a.$('rangeButtons').listeners.click({target})}
function copyTarget(a,targetBar){const target=a.document.querySelectorAll('.copy-target').find(b=>b.dataset.target===String(targetBar));a.$('copyTargets').listeners.click({target})}
function preset(a,name='basic'){a.$('preset').value=name;a.$('preset').onchange({target:a.$('preset')})}
function file(name,marker,size=4){return{name,size,async arrayBuffer(){return Uint8Array.of(marker,0,0,0).buffer}}}
function vlq(bytes,pos){let value=0,b;do{b=bytes[pos++];value=(value<<7)|(b&127)}while(b&128);return[value,pos]}
function parseMidi(bytes){assert.equal(bytes.toString('ascii',0,4),'MThd');assert.equal(bytes.readUInt16BE(12),960);let pos=22,tick=0;const hits=[],markers=[];while(pos<bytes.length){let delta;[delta,pos]=vlq(bytes,pos);tick+=delta;const status=bytes[pos++];if(status===255){const type=bytes[pos++];let length;[length,pos]=vlq(bytes,pos);if(type===6)markers.push(bytes.toString('ascii',pos,pos+length));pos+=length}else{const note=bytes[pos++],velocity=bytes[pos++];if(status===0x99&&velocity)hits.push({tick,note,velocity})}}return{hits,markers,tick}}
async function main(){
  const a=app();assert.equal(a.document.querySelectorAll('.cell').length,8*16);assert(!html.includes('id="division"'));assert.equal(state(a,'bars'),4);assert.equal(state(a,'beats.length'),16);
  assert.equal(a.document.querySelectorAll('.timeline-grid').length,1,'four bars share one timeline');assert.equal(a.document.querySelectorAll('.lane-label').length,8,'each instrument label appears once');assert.equal(a.document.querySelectorAll('.bar-heading').length,4);assert.equal(a.document.querySelectorAll('.beat-select').length,16);assert.equal(a.document.querySelectorAll('.bar-card').length,0);
  assert.equal(state(a,'beats.every(c=>c.div===0)'),true,'start without predetermined subdivisions');assert.equal(state(a,'data.kick.some(Boolean)'),false);
  assert.equal(state(a,'encodedSampleBank'),null,'opening the editor must not parse or inflate audio');assert.equal(state(a,'Object.values(sampleRecords).some(r=>r.bytes)'),false);
  click(a,cell(a,'kick',0));assert.equal(state(a,'data.kick[0]'),0,'a waiting beat must be configured before entering notes');assert.equal(state(a,'undoStack.length'),0);
  palette(a,4);assert.deepEqual(json(a,'baseSlots(0).map(s=>s.tick)'),[0,3,6,9]);assert.equal(state(a,'beats[1].div'),0,'only the selected beat changes');
  a.$('applyBarRhythm').onclick();assert.deepEqual(json(a,'beats.slice(0,4).map(c=>c.div)'),[4,4,4,4]);assert.equal(state(a,'beats[4].div'),0,'one-click bar rhythm must not change another bar');
  const direct=app('',null,true);palette(direct,3);click(direct,cell(direct,'snare',12));assert.equal(state(direct,'beats[1].div'),3);assert.equal(state(direct,'data.snare[12]'),2,'a pending beat accepts the chosen rhythm and the tap in one action');assert.equal(state(direct,'beats[2].div'),0);direct.$('undo').onclick();assert.equal(state(direct,'beats[1].div'),0);assert.equal(state(direct,'data.snare[12]'),0);
  state(direct,'selectBeat(1)');range(direct,'left');palette(direct,4);click(direct,cell(direct,'kick',18));assert.deepEqual(json(direct,'[beats[1].left,beats[1].right]'),[2,2]);assert.equal(state(direct,'data.kick[18]'),2);
  const restricted=app();Object.defineProperty(restricted.context.location,'hash',{set(){throw new Error('Blocked navigation')},get(){return ''},configurable:true});palette(restricted,4);click(restricted,cell(restricted,'kick',0));assert.equal(state(restricted,'data.kick[0]'),2,'restricted URL writes must not disable editing');
  preset(a);assert.equal(a.document.querySelectorAll('.cell').length,8*64);
  assert.deepEqual(json(a,'[data.snare[12],data.snare[60],data.snare[108],data.snare[156]]'),[3,3,3,3]);
  const tapped=cell(a,'rack',3);for(const value of ['2','3','1','0']){click(a,tapped);assert.equal(tapped.dataset.v,value)}
  a.$('rollMode').onclick();click(a,tapped);assert.equal(tapped.dataset.v,2);assert(tapped.classList.contains('roll'));
  // Independent subdivisions: no change to neighbouring beats, and no erased notes.
  state(a,'selectBeat(0)');palette(a,3);assert.deepEqual(json(a,'baseSlots(0).map(s=>s.tick)'),[0,4,8]);assert.deepEqual(json(a,'baseSlots(1).map(s=>s.tick)'),[12,15,18,21]);assert.equal(state(a,'data.rack[3]'),2);assert.equal(state(a,'data.rolls.rack[3]'),true);assert(state(a,'beatSlots(0).some(s=>s.tick===3&&s.retained)'));
  click(a,a.$('beat-1'));range(a,'left');palette(a,3);range(a,'right');palette(a,4);assert.deepEqual(json(a,'baseSlots(1).map(s=>s.tick)'),[12,14,16,18,21]);
  const halfBefore=json(a,'beats[1]');palette(a,1);assert.deepEqual(json(a,'beats[1]'),halfBefore,'quarter notes are disabled in half-beat scope');
  click(a,a.$('beat-2'));for(const n of [1,2,3,4,6]){palette(a,n);assert.equal(state(a,'baseSlots(2).length'),n)}
  // Copy every aspect of a mixed bar, paste by value and undo the overwrite.
  const originalBar2=json(a,'data.snare.slice(48,96)');assert.equal(a.$('barCopyPanel').hidden,true);a.$('copyBarsToggle').onclick();assert.equal(a.$('barCopyPanel').hidden,false);assert.equal(a.$('copyFrom').value,'0');copyTarget(a,1);
  assert.deepEqual(json(a,'beats.slice(0,4)'),json(a,'beats.slice(4,8)'));assert.deepEqual(json(a,'data.rack.slice(0,48)'),json(a,'data.rack.slice(48,96)'));assert.equal(state(a,'data.rolls.rack[51]'),true);
  a.$('undo').onclick();assert.deepEqual(json(a,'data.snare.slice(48,96)'),originalBar2);assert.equal(state(a,'data.rack[51]'),0);
  copyTarget(a,'all');for(const offset of [48,96,144])assert.equal(state(a,`data.rolls.rack[${offset+3}]`),true);
  state(a,'data.rack[3]=1');copyTarget(a,2);assert.equal(state(a,'data.rack[99]'),1,'each copy reads the current source, not a stale clipboard');assert.equal(state(a,'data.rack[51]'),2);
  state(a,'data.rack[51]=3');assert.equal(state(a,'data.rack[3]'),1,'copied bars must not share arrays');
  a.$('copyFrom').value='3';a.$('copyFrom').onchange();copyTarget(a,0);assert.equal(state(a,'data.rack[3]'),2,'source selector applies directly');a.$('undo').onclick();assert.equal(state(a,'data.rack[3]'),1);a.$('closeBarCopy').onclick();assert.equal(a.$('barCopyPanel').hidden,true);
  // Save/reload preserves mixed grids, ghost notes, doubles and all four measures.
  state(a,'saveHash()');const restored=app(a.context.location.hash);assert.deepEqual(json(restored,'data'),json(a,'data'));assert.deepEqual(json(restored,'beats'),json(a,'beats'));
  for(const steps of [8,12,16,24]){const old={hat:Array(steps*2).fill(0),kick:Array(steps*2).fill(0),rolls:{kick:Array(steps*2).fill(false)}};old.kick[steps+1]=1;old.rolls.kick[steps+1]=true;const migrated=app('#'+Buffer.from(JSON.stringify({steps,bars:2,data:old})).toString('base64'));const at=48+48/steps;assert.equal(state(migrated,`data.kick[${at}]`),1);assert.equal(state(migrated,`data.rolls.kick[${at}]`),true);assert.equal(state(migrated,'data.kick.slice(96).some(Boolean)'),false)}
  const original={hat:Array(16).fill(0),snare:Array(16).fill(0)};original.snare[4]=3;const legacy=app('#'+Buffer.from(JSON.stringify(original)).toString('base64'));assert.equal(state(legacy,'data.snare[12]'),3);assert.equal(state(legacy,'data.snare.slice(48).some(Boolean)'),false);
  // Changing and undoing must preserve mobile horizontal scroll.
  const mobile=app('',null,true);mobile.$('timelineScroll').scrollLeft=231;palette(mobile,3);assert.equal(mobile.$('timelineScroll').scrollLeft,231);assert.equal(mobile.document.querySelectorAll('.timeline-grid').length,1);state(mobile,'scrollToBar(3)');assert(mobile.$('timelineScroll').scrollLeft>231);assert.equal(state(mobile,'selectedBeat'),12);
  const pendingGrid=app();palette(pendingGrid,3);state(pendingGrid,'saveHash()');const pendingReload=app(pendingGrid.context.location.hash);assert.deepEqual(json(pendingReload,'beats'),json(pendingGrid,'beats'),'unconfigured beats must survive link reload');
  a.$('tempo').value='93';a.$('tempo').oninput({target:a.$('tempo')});assert.equal(a.$('tempo').value,95);assert(/min="40" max="220" step="5"/.test(html));
  // Eight instruments x three independent recordings; import must be atomic.
  const names=['hat','ride','crash','rack','rack2','snare','floor','kick'];const files=names.flatMap((name,i)=>['weak','medium','strong'].map((level,v)=>file(`${name}-${level}.wav`,i*3+v+1)));
  a.context.importFiles=files;await state(a,'importSampleFiles(importFiles)');assert.equal(state(a,'sampleCount()'),24);assert(a.$('soundMessage').textContent.includes('无法保存'));
  for(const [i,name]of names.entries())for(const v of [1,2,3]){state(a,`hit('${name}',${v},10)`);assert.equal(state(a,'audio.sampleStarts.at(-1).buffer.marker'),i*3+v);assert.equal(state(a,'audio.gains.at(-1).value'),v===1?.42:.75)}
  assert.equal(state(a,"identifySample('rack2-weak-v25.wav').lane"),'rack2');assert.equal(state(a,"identifySample('ride-accent.wav').velocity"),3);assert.equal(state(a,"identifySample('snare.wav')"),null);
  // Double is timed within the selected full or half beat, at every velocity.
  for(const split of [false,true])for(const division of [1,2,3,4,6])for(const v of [1,2,3]){
    state(a,`data=blank();beats=defaultBeats();beats[0]={split:${split},div:${division},left:${division},right:2};data.snare[0]=${v};data.rolls.snare[0]=true;eventMap=buildEventMap();audio.sampleStarts=[];listenPractice=false;metro=false;`);
    for(let t=0;t<12;t++)state(a,`scheduleTick(${t},10+${t}*tickSeconds(),0)`);
    const hits=state(a,'audio.sampleStarts');assert.equal(hits.length,2);assert.equal(hits[0].buffer,hits[1].buffer);assert.equal(hits[0].buffer.marker,15+v);
    const duration=(split?6:12)/division;assert(Math.abs(hits[1].time-hits[0].time-duration/2*state(a,'tickSeconds()'))<1e-9);
  }
  const before=state(a,'sampleBuffers.kick[1]');a.context.importFiles=[file('kick-weak.wav',90),file('snare-medium.wav',255)];await state(a,'importSampleFiles(importFiles)');assert.equal(state(a,'sampleBuffers.kick[1]'),before);
  for(const [bad,part]of [[file('sound.obw',1),'.obw'],[file('kick-weak.wav',254),'12 秒'],[file('kick-weak.wav',1,9*1024*1024),'8 MB']]){a.context.importFiles=[bad];await state(a,'importSampleFiles(importFiles)');assert(a.$('soundMessage').textContent.includes(part));assert.equal(state(a,'sampleBuffers.kick[1]'),before)}
  a.context.importFiles=[file('kick-weak.wav',1),file('kick_weak.wav',2)];await state(a,'importSampleFiles(importFiles)');assert(a.$('soundMessage').textContent.includes('多个文件'));
  // Full bar of count-in, four groove bars, then four practice bars with no drums.
  const player=app();preset(player);await player.$('play').onclick();assert.equal(state(player,'sampleCount()'),24);assert(!player.$('soundStatus').textContent.includes('待采样'));assert.equal(player.$('phaseBadge').textContent,'预备：1');
  // The default recorded kit must route every layer without entering synthesis.
  const uniqueBuffers=new Set();
  for(const name of names)for(const v of [1,2,3]){
    const oscillatorCount=state(player,'audio.oscillatorStarts.length');state(player,`hit('${name}',${v},10)`);
    assert.equal(state(player,'audio.sampleStarts.at(-1).buffer'),state(player,`sampleBuffers.${name}[${v}]`));assert.equal(state(player,'audio.oscillatorStarts.length'),oscillatorCount);
    uniqueBuffers.add(state(player,`sampleBuffers.${name}[${v}]`));
  }
  assert.equal(uniqueBuffers.size,24);state(player,'audio.sampleStarts=[]');
  state(player,'audio.currentTime=0;scheduler()');const firstTime=state(player,'nextTime-nextTick*tickSeconds()');
  for(let t=0;t<300;t++)state(player,`audio.currentTime=${t*.02};scheduler();paint()`);
  assert(Math.abs(state(player,'audio.sampleStarts[0].time')-firstTime)<1e-9,'first groove begins precisely after four count-in beats');assert.equal(player.$('phaseBadge').hidden,true,'count-in badge must clear when groove starts');
  state(player,'stop();listenPractice=true;metro=false;playing=true;practicePhase=0;nextTick=192;nextTime=audio.currentTime+.02;finishing=false;eventMap=buildEventMap();audio.sampleStarts=[];audio.oscillatorStarts=[];scheduler()');assert.equal(state(player,'practicePhase'),1);assert.equal(state(player,'audio.sampleStarts.length'),0);assert(state(player,'audio.oscillatorStarts.length')>0);
  state(player,'nextTick=192;nextTime=audio.currentTime+.02;scheduler()');assert.equal(state(player,'practicePhase'),0);assert(state(player,'audio.sampleStarts.length')>0);
  state(player,'loop=false;nextTick=192;nextTime=audio.currentTime+.02;scheduler();audio.currentTime+=.1;paint()');assert.equal(state(player,'playing'),false,'non-loop playback ends after the full fourth bar');
  // Simulate complete listen/practice cycles at slow, normal and fast tempo.
  for(const bpm of [40,90,220]){
    const full=app();preset(full);full.$('tempo').value=String(bpm);state(full,'listenPractice=true');await full.$('play').onclick();
    const beat=60/bpm,start=.035,practiceStart=start+20*beat,returnStart=start+36*beat;
    for(let t=0;t<returnStart+.08;t+=.025)state(full,`audio.currentTime=${t};scheduler();paint()`);
    const hits=state(full,'audio.sampleStarts');
    assert.equal(hits.filter(h=>h.time<practiceStart-1e-8).length,52,`${bpm} BPM: all four groove bars must play`);
    assert.equal(hits.filter(h=>h.time>=practiceStart-1e-8&&h.time<returnStart-1e-8).length,0,`${bpm} BPM: all four practice bars must be silent`);
    assert(hits.some(h=>Math.abs(h.time-returnStart)<1e-8),`${bpm} BPM: groove returns exactly after four practice bars`);
    const clicks=state(full,'audio.oscillatorStarts');assert.equal(clicks.filter(h=>h.time<start+4*beat-1e-8).length,4);assert.equal(clicks.filter(h=>h.time>=practiceStart-1e-8&&h.time<returnStart-1e-8).length,16);
    state(full,'stop()');
  }
  state(a,'data=blank();beats=defaultBeats();beats[15]={split:true,div:4,left:6,right:6};data.crash[191]=1;data.rolls.crash[191]=true;eventMap=buildEventMap();audio.sampleStarts=[];scheduleTick(191,20,0)');
  assert.equal(state(a,'audio.sampleStarts.length'),2);assert(state(a,'audio.sampleStarts[1].time<20+tickSeconds()'),'final-cell Double stays inside bar four');
  // A cached old bank must not shadow the new v25 defaults. Custom edits persist.
  const saved=new Map([['active',{'kick:1':{name:'old-v40.wav',bytes:Uint8Array.of(99,0,0,0).buffer}}]]);
  const store={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(_name,mode){const tx={objectStore(){return{get(key){const read={};queueMicrotask(()=>{read.result=structuredClone(saved.get(key));read.onsuccess()});return read},put(value,key){saved.set(key,structuredClone(value))}}}};if(mode==='readwrite')queueMicrotask(()=>tx.oncomplete());return tx}};request.onsuccess()});return request}};
  const fresh=app('',store);await fresh.$('play').onclick();assert.equal(state(fresh,'sampleBuffers.kick[1].marker'),82);assert.equal(state(fresh,"sampleRecords['kick:1'].name"),'kick-weak.wav');state(fresh,'stop()');
  const first=app('',store);first.context.importFiles=files;await state(first,'importSampleFiles(importFiles)');assert(first.$('soundMessage').textContent.includes('已保存在当前浏览器'));
  const second=app('',store);preset(second);await second.$('play').onclick();assert.equal(state(second,'sampleCount()'),24);assert.equal(state(second,'sampleBuffers.rack2[1].marker'),13);await state(second,'clearSampleFiles()');assert.equal(state(second,'sampleCount()'),24);assert.equal(state(second,'data.snare[12]'),3);assert.equal(saved.get('active')['kick:1'].name,'old-v40.wav');
  const pending=app(),promise=pending.$('play').onclick();state(pending,'stop()');await promise;assert.equal(state(pending,'playing'),false);
  const denied=app();state(denied,"ensureAudio();audio.resume=async()=>{throw new Error('denied')}");await denied.$('play').onclick();assert.equal(state(denied,'playing'),false);assert.equal(state(denied,'starting'),false);
  // Actual built-in WAV bytes, not just a mocked decoder.
  const samples=json(a,'builtinSamples');assert.equal(samples.length,24);const peaks={};
  for(const item of samples){const b=Buffer.from(await state(a,`readSampleBytes(defaultSampleRecords()['${item.lane}:${item.velocity}'])`));assert.equal(b.length,item.byteLength);assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');assert.equal(b.readUInt16LE(22),2);assert.equal(b.readUInt32LE(24),44100);assert.equal(b.readUInt16LE(34),16);assert(b.length>10000);
    assert.equal(item.midi_velocity,[25,85,120][item.velocity-1]);assert(b.readUInt32LE(40)/4/44100<=12);
    let peak=0;for(let i=44;i<b.length;i+=2)peak=Math.max(peak,Math.abs(b.readInt16LE(i)));assert(peak<32767,'PCM must not clip');
    (peaks[item.lane]||=[])[item.velocity]=peak;
    const filePath=path.join(root,'samples',item.name);if(fs.existsSync(filePath))assert(b.equals(fs.readFileSync(filePath)),'embedded bytes must match the processed WAV');
  }
  assert.equal(Object.keys(peaks).length,8);for(const layers of Object.values(peaks))assert(layers[1]<layers[2]&&layers[2]<layers[3]);
  const midi=parseMidi(fs.readFileSync(path.join(root,'groove-lab-mainroom-24-hits.mid')));assert.equal(midi.hits.length,24);assert.equal(midi.markers.length,24);assert.equal(midi.tick/1920,290);
  const notes=[36,38,42,48,47,43,51,49];for(let i=0;i<24;i++){assert.equal(midi.hits[i].note,notes[Math.floor(i/3)]);assert.equal(midi.hits[i].velocity,[25,85,120][i%3]);assert.equal(midi.hits[i].tick/1920,2+i*12)}
  console.log('Groove Lab single-line checks passed: choose rhythm first, direct copy, mixed beats, undo, playback, 24-layer routing, storage, WAV and MIDI.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
