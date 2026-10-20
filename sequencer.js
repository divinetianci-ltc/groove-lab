// Playback engine. Editor state and controls are defined in editor.js.

function ensureAudio(){if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)()}
function trackSource(source){activeSources.add(source);source.onended=()=>activeSources.delete(source);return source}
function noiseBuffer(duration=.12){const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),a=buffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;return buffer}
function hit(type,v,time){
  if(!v||playSample(type,v,time))return;
  const gain=[0,.085,.48,.9][v];
  if(['kick','rack','rack2','floor'].includes(type)){
    const o=trackSource(audio.createOscillator()),g=audio.createGain(),freq={kick:[145,45],rack:[210,105],rack2:[175,87],floor:[125,62]}[type];
    o.frequency.setValueAtTime(freq[0],time);o.frequency.exponentialRampToValueAtTime(freq[1],time+(type==='kick'?.12:.18));g.gain.setValueAtTime(gain*(type==='kick'?1:.72),time);g.gain.exponentialRampToValueAtTime(.001,time+(type==='kick'?.2:.3));o.connect(g).connect(audio.destination);o.start(time);o.stop(time+.32);
  }else{
    const cymbal=['hat','ride','crash'].includes(type),duration={hat:.045,ride:.6,crash:1.4,snare:.13}[type],s=trackSource(audio.createBufferSource()),f=audio.createBiquadFilter(),g=audio.createGain();
    s.buffer=noiseBuffer(duration);f.type=cymbal?'highpass':'bandpass';f.frequency.value={hat:6500,ride:4800,crash:3000,snare:1800}[type];g.gain.setValueAtTime(gain*(cymbal?.34:.55),time);g.gain.exponentialRampToValueAtTime(.001,time+duration);s.connect(f).connect(g).connect(audio.destination);s.start(time);
  }
}
function clickHit(time,accent=false){const o=trackSource(audio.createOscillator()),g=audio.createGain();o.frequency.value=accent?1200:850;g.gain.setValueAtTime(accent?.2:.16,time);g.gain.exponentialRampToValueAtTime(.001,time+.035);o.connect(g).connect(audio.destination);o.start(time);o.stop(time+.04)}
const tickSeconds=()=>60/+ $('tempo').value/12;
function buildEventMap(){const map=new Map();for(const slot of allSlots())for(const [id] of lanes){const v=data[id][slot.tick];if(!v)continue;const add=at=>{const whole=Math.floor(at);if(!map.has(whole))map.set(whole,[]);map.get(whole).push({lane:id,velocity:v,offset:at-whole})};add(slot.tick);if(data.rolls[id][slot.tick])add(slot.tick+slot.duration/2)}return map}
function scheduleTick(tick,time,phase){
  if(tick<0){if(tick%12===0)clickHit(time,tick===-48)}else{
    if(!listenPractice||phase===0)for(const e of eventMap.get(tick)||[])hit(e.lane,e.velocity,time+e.offset*tickSeconds());
    if((metro||(listenPractice&&phase===1))&&tick%12===0)clickHit(time,tick%48===0);
  }
  visualQueue.push({tick,time,phase});
}
function scheduler(){
  if(!playing||finishing)return;
  // Catch up after suspension without firing a burst of missed drum strikes.
  if(nextTime<audio.currentTime-.15)nextTime=audio.currentTime+.025;
  while(nextTime<audio.currentTime+.12){
    if(nextTick===192){
      if(!loop){finishing=true;visualQueue.push({end:true,time:nextTime});return}
      nextTick=0;if(listenPractice)practicePhase=1-practicePhase;
    }
    scheduleTick(nextTick,nextTime,practicePhase);nextTick++;nextTime+=tickSeconds();
  }
}
function updatePracticeUI(tick=current,phase=practicePhase){const badge=$('phaseBadge');
  if(playing&&tick<0){badge.hidden=false;badge.classList.remove('practice');badge.textContent=`预备：${Math.floor((tick+48)/12)+1}`;return}
  badge.hidden=!listenPractice;badge.classList.toggle('practice',phase===1);badge.textContent=phase===0?'听：4 小节节奏':'练：4 小节节拍器';
}
function paint(){if(!playing)return;let frame;
  while(visualQueue.length&&visualQueue[0].time<=audio.currentTime){frame=visualQueue.shift();if(frame.end){stop(false);return}}
  if(frame){current=frame.tick;updatePracticeUI(current,frame.phase);document.querySelectorAll('.cell').forEach(c=>c.classList.toggle('current',current>=0&&+c.dataset.tick<=current&&current<+c.dataset.tick+ +c.dataset.duration))}
  animation=requestAnimationFrame(paint);
}
async function start(){
  if(playing||starting||sampleBusy)return;const request=++startRequest;starting=true;$('play').setAttribute('aria-label','取消载入');message(sampleCount()===24?'':'首次播放正在载入鼓音色…');
  try{ensureAudio();await audio.resume();await samplesRestored;await prepareSavedSamples()}catch{if(request===startRequest){starting=false;message('音频无法启动，请重试播放。');$('play').setAttribute('aria-label','播放')}return}
  if(request!==startRequest)return;message('');starting=false;playing=true;finishing=false;practicePhase=0;current=-48;nextTick=-48;nextTime=audio.currentTime+.035;visualQueue=[];eventMap=buildEventMap();
  $('play').classList.add('playing');$('play').setAttribute('aria-label','暂停');$('play').innerHTML='<svg viewBox="0 0 24 24"><path d="M7 6h4v12H7zm6 0h4v12h-4z"/></svg>';updatePracticeUI();scheduler();timer=setInterval(scheduler,25);animation=requestAnimationFrame(paint);
}
function stop(cutTails=true){
  startRequest++;starting=false;playing=false;clearInterval(timer);cancelAnimationFrame(animation);visualQueue=[];finishing=false;current=-1;practicePhase=0;
  if(cutTails){for(const source of activeSources)try{source.stop()}catch{}activeSources.clear()}
  updatePracticeUI(0,0);document.querySelectorAll('.cell').forEach(c=>c.classList.remove('current'));$('play').classList.remove('playing');$('play').setAttribute('aria-label','播放');$('play').innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
}
$('play').onclick=()=>playing||starting?stop():start();
$('tempo').oninput=e=>{const bpm=Math.max(40,Math.min(220,Math.round(+e.target.value/5)*5));e.target.value=bpm;$('bpmText').textContent=bpm};
$('loop').onclick=()=>{loop=!loop;$('loop').classList.toggle('active',loop);$('loop').setAttribute('aria-pressed',String(loop));if(!loop&&listenPractice){listenPractice=false;$('listenPractice').classList.remove('practice-active');$('listenPractice').setAttribute('aria-pressed','false');stop()}};
$('metro').onclick=()=>{metro=!metro;$('metro').classList.toggle('active',metro);$('metro').setAttribute('aria-pressed',String(metro))};
$('listenPractice').onclick=()=>{const restart=playing||starting;stop();listenPractice=!listenPractice;$('listenPractice').classList.toggle('practice-active',listenPractice);$('listenPractice').setAttribute('aria-pressed',String(listenPractice));if(listenPractice){loop=true;$('loop').classList.add('active');$('loop').setAttribute('aria-pressed','true')}updatePracticeUI(0,0);if(restart)start()};
addEventListener('keydown',e=>{if($('soundDialog').open)return;if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();playing||starting?stop():start()}});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
let lastMobile=matchMedia('(max-width:760px)').matches;
addEventListener('resize',()=>{const mobile=matchMedia('(max-width:760px)').matches;if(mobile!==lastMobile){lastMobile=mobile;render()}});
loadHash();render();
