// The offline HTML embeds the recordings; the web build loads the same bytes as small assets.
function defaultSampleRecords(){const result={};for(const entry of builtinSamples)result[`${entry.lane}:${entry.velocity}`]={name:entry.name,builtinKey:`${entry.lane}:${entry.velocity}`,byteLength:entry.byteLength};return result}
let encodedSampleBank=null;
function readSampleBytes(record){
  if(record.bytes)return record.bytes;
  if(!encodedSampleBank){encodedSampleBank=JSON.parse($('builtinSampleData').textContent);$('builtinSampleData').textContent=''}
  const entry=encodedSampleBank[record.builtinKey];if(!entry)throw new Error('内置采样未找到');
  if(entry.parts)return loadSampleParts(entry).then(packed=>unpackSample(record,entry,packed));
  const binary=atob(entry.data),packed=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)packed[i]=binary.charCodeAt(i);
  return unpackSample(record,entry,packed);
}
function unpackSample(record,entry,packed){const bytes=entry.compression==='gzip'?window.pako.ungzip(packed):packed;record.bytes=bytes.buffer;return record.bytes}
async function loadSampleParts(entry){
  let cache;try{if('caches'in window)cache=await caches.open('groove-lab-mainroom-audio-v1')}catch{}
  const chunks=await Promise.all(entry.parts.map(async name=>{
    const url=new URL(name,document.baseURI).href;
    let response;try{response=cache&&await cache.match(url)}catch{}
    if(!response){response=await fetch(url);if(!response.ok)throw new Error('鼓音色下载失败');try{if(cache)await cache.put(url,response.clone())}catch{}}
    return new Uint8Array(await response.arrayBuffer());
  }));
  const packed=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;for(const chunk of chunks){packed.set(chunk,offset);offset+=chunk.length}
  if(packed.length!==entry.packedBytes)throw new Error('鼓音色文件不完整');
  if(globalThis.crypto?.subtle){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',packed)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==entry.sha256)throw new Error('鼓音色校验失败')}
  return packed;
}
const sampleBuffers=Object.fromEntries(lanes.map(([id])=>[id,[null,null,null,null]]));
let sampleRecords=defaultSampleRecords(),sampleBusy=false,sampleDb=null;
const soundStatus=$('soundStatus'),soundMessage=$('soundMessage'),sampleKey=(lane,velocity)=>`${lane}:${velocity}`;
const sampleCount=()=>Object.values(sampleBuffers).reduce((n,row)=>n+row.filter(Boolean).length,0);
const MAX_SAMPLE_BYTES=8*1024*1024,MAX_BANK_BYTES=48*1024*1024;
const SAMPLE_BANK='mainroom-24-v25-20261010';
const levels=['','弱 · 鬼音','中 · 常规','强 · 重音'];
$('sampleTable').innerHTML='<div></div>'+[1,2,3].map(v=>`<div class="sample-header">${levels[v]}</div>`).join('')+lanes.map(([id,name])=>`<div class="sample-label">${name}</div>`+[1,2,3].map(v=>`<div class="sample-slot"><label class="sample-pick"><span class="sample-level">${name} · ${levels[v]}</span><span class="sample-name" id="sampleName-${id}-${v}"></span><input type="file" id="sampleFile-${id}-${v}" accept=".wav,.mp3,.ogg,.m4a,.flac,audio/*" aria-label="${name} ${levels[v]}采样"></label><button class="sample-preview" id="preview-${id}-${v}" disabled>试听</button></div>`).join('')).join('');
function updateSoundUI(){
  const loaded=sampleCount(),records=Object.keys(sampleRecords).length,missing=lanes.filter(([id])=>[1,2,3].some(v=>!sampleRecords[sampleKey(id,v)])).map(x=>x[1]);
  soundStatus.textContent=`${loaded?`已载入 ${loaded}`:`已内置 ${records}`}/24 个采样${missing.length?` · ${missing.join('、')}待采样，暂用合成音色`:' · 三档真实采样'}`;
  for(const [id] of lanes)for(const v of [1,2,3]){
    const record=sampleRecords[sampleKey(id,v)],name=$(`sampleName-${id}-${v}`);name.textContent=record?.name||'待补充 · 合成音色';name.title=record?.name||'';
    $(`preview-${id}-${v}`).disabled=false;
  }
}
function sampleDatabase(){if(sampleDb)return sampleDb;sampleDb=new Promise((resolve,reject)=>{
  if(!('indexedDB'in window)){reject(new Error('当前浏览器不支持音色保存'));return}
  // A new bank key prevents cached v40 recordings from overriding the new v25 kit.
  // Leave the previous bank untouched for anyone reopening the previous version.
  const request=window.indexedDB.open('groove-lab-mainroom-samples',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('banks');
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db)};request.onerror=()=>reject(request.error||new Error('无法打开音色存储'));request.onblocked=()=>reject(new Error('请关闭其他 Groove Lab 页面后重试'));
});return sampleDb}
async function restoreSampleRecords(){try{
  const db=await sampleDatabase(),saved=await new Promise((resolve,reject)=>{const request=db.transaction('banks','readonly').objectStore('banks').get(SAMPLE_BANK);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  let bytes=0;for(const [id] of lanes)for(const v of [1,2,3]){const key=sampleKey(id,v),r=saved?.[key];if(r&&typeof r.name==='string'&&r.bytes instanceof ArrayBuffer&&r.bytes.byteLength&&r.bytes.byteLength<=MAX_SAMPLE_BYTES&&bytes+r.bytes.byteLength<=MAX_BANK_BYTES){sampleRecords[key]=r;bytes+=r.bytes.byteLength}}
  updateSoundUI();
}catch{/* Playback and imports work without persistent browser storage. */}}
const samplesRestored=restoreSampleRecords();
async function persistSampleRecords(){const db=await sampleDatabase();const custom=Object.fromEntries(Object.entries(sampleRecords).filter(([,r])=>!r.builtinKey));await new Promise((resolve,reject)=>{const tx=db.transaction('banks','readwrite');tx.objectStore('banks').put(custom,SAMPLE_BANK);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('音色保存失败'))})}
async function decodeSample(bytes){const buffer=await audio.decodeAudioData(bytes.slice(0));if(!buffer.duration||buffer.duration>12)throw new Error('请使用不超过 12 秒的单次鼓击录音');return buffer}
let samplePreparation=null;
async function prepareSavedSamples(){
  if(samplePreparation)return samplePreparation;
  samplePreparation=(async()=>{let failed=0,next=0;const jobs=lanes.flatMap(([id])=>[1,2,3].map(v=>({id,v,record:sampleRecords[sampleKey(id,v)]}))).filter(({id,v,record})=>record&&!sampleBuffers[id][v]);
    async function worker(){while(next<jobs.length){const {id,v,record}=jobs[next++];try{const buffer=await decodeSample(await readSampleBytes(record));if(sampleRecords[sampleKey(id,v)]===record)sampleBuffers[id][v]=buffer}catch{failed++}updateSoundUI()}}
    await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker));updateSoundUI();if(failed)soundMessage.textContent=`${failed} 个采样无法解码，请重新选择音频；对应声音暂用合成音色。`;
  })();try{await samplePreparation}finally{samplePreparation=null}
}
function playSample(type,v,time){
  const buffer=sampleBuffers[type]?.[v];if(!buffer)return false;
  const source=trackSource(audio.createBufferSource()),gain=audio.createGain();source.buffer=buffer;
  // Keep the recording's dynamics; lower the ghost layer by a further ~5 dB.
  gain.gain.setValueAtTime(v===1?.42:.75,time);source.connect(gain).connect(audio.destination);source.start(time);return true;
}
function identifySample(name){
  const stem=name.toLowerCase().normalize('NFKC').replace(/\.[^.]+$/,'').replace(/[\s_.-]+/g,'').replace(/v(25|40|85|120)$/,'');
  const aliases={hat:['hat','hihat','closedhat','踩镲'],rack:['rack','racktom','rack1','tom1','hightom','高音嗵鼓','通鼓1'],rack2:['rack2','racktom2','tom2','midtom','通鼓2'],snare:['snare','军鼓'],floor:['floor','floortom','落地嗵鼓','落地通鼓'],kick:['kick','bassdrum','底鼓'],ride:['ride','叮叮镲'],crash:['crash','强音镲']};
  const velocities={1:['weak','soft','ghost','弱','鬼音','1'],2:['medium','mid','normal','中','常规','2'],3:['strong','hard','accent','强','重音','3']};
  for(const [lane,words] of Object.entries(aliases))for(const [v,names] of Object.entries(velocities))if(words.some(word=>names.some(level=>stem===word+level)))return{lane,velocity:+v};return null;
}
async function importSampleFiles(files,slot=null){
  if(sampleBusy)return;sampleBusy=true;stop();soundMessage.textContent='正在检查采样…';$('soundFiles').disabled=true;
  try{ensureAudio();await audio.resume();await samplesRestored;const mapped=[],keys=new Set();let skipped=0;
    for(const file of files){if(/\.obw$/i.test(file.name)){skipped++;continue}const target=slot||identifySample(file.name);if(!target){skipped++;continue}const key=sampleKey(target.lane,target.velocity);
      if(keys.has(key))throw new Error('同一鼓件的同一力度有多个文件，请每档只选一个');if(!file.size||file.size>MAX_SAMPLE_BYTES)throw new Error(`${file.name}：每个采样需小于 8 MB`);keys.add(key);mapped.push({file,key,...target});
    }
    if(!mapped.length)throw new Error('没有可导入的采样。请选择 WAV 等单次鼓击录音；.obw 音频库不能直接播放。');
    const unchanged=Object.entries(sampleRecords).reduce((n,[key,r])=>n+(keys.has(key)?0:(r.bytes?.byteLength||r.byteLength||0)),0);
    if(unchanged+mapped.reduce((n,x)=>n+x.file.size,0)>MAX_BANK_BYTES)throw new Error('音色总大小需小于 48 MB，请使用精简的单次鼓击录音');
    const prepared=[];for(const item of mapped){const bytes=await item.file.arrayBuffer();let buffer;try{buffer=await decodeSample(bytes)}catch(error){throw new Error(`${item.file.name}：${error.message||'无法解码，请使用 WAV 文件'}`)}prepared.push({...item,bytes,buffer})}
    // Commit atomically only after every selected file has decoded successfully.
    for(const item of prepared){sampleRecords[item.key]={name:item.file.name,bytes:item.bytes};sampleBuffers[item.lane][item.velocity]=item.buffer}
    updateSoundUI();const notice=`已启用 ${prepared.length} 个采样${skipped?`，${skipped} 个未匹配文件已跳过`:''}。`;
    try{await persistSampleRecords();soundMessage.textContent=notice+'已保存在当前浏览器，可离线使用。'}catch{soundMessage.textContent=notice+'当前浏览器无法保存，关闭页面后需要重新导入。'}
  }catch(error){soundMessage.textContent=error.message||'导入失败，原有音色已保留。'}finally{sampleBusy=false;$('soundFiles').disabled=false}
}
async function clearSampleFiles(){if(sampleBusy)return;sampleBusy=true;stop();try{
  await samplesRestored;ensureAudio();await audio.resume();sampleRecords=defaultSampleRecords();for(const [id] of lanes)sampleBuffers[id].fill(null);await prepareSavedSamples();
  try{await persistSampleRecords();soundMessage.textContent='已恢复 Main Room 八件鼓的 24 个默认采样。'}catch{soundMessage.textContent='已恢复默认鼓组；当前浏览器无法保存此设置。'}
}catch{soundMessage.textContent='恢复未完成，请重试。'}finally{sampleBusy=false}}
$('soundSettings').onclick=async()=>{$('soundDialog').showModal();try{ensureAudio();await audio.resume();await samplesRestored;await prepareSavedSamples()}catch{soundMessage.textContent='音频无法启动，请关闭设置后重试。'}};
$('closeSound').onclick=()=>$('soundDialog').close();$('resetSound').onclick=clearSampleFiles;
$('soundFiles').onchange=async e=>{await importSampleFiles(Array.from(e.target.files));e.target.value=''};
for(const [id] of lanes)for(const v of [1,2,3]){
  $(`sampleFile-${id}-${v}`).onchange=async e=>{if(e.target.files[0])await importSampleFiles([e.target.files[0]],{lane:id,velocity:v});e.target.value=''};
  $(`preview-${id}-${v}`).onclick=async()=>{try{ensureAudio();await audio.resume();await samplesRestored;await prepareSavedSamples();hit(id,v,audio.currentTime+.015)}catch{soundMessage.textContent='试听无法启动，请重试。'}};
}
updateSoundUI();
