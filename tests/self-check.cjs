const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*)<\/script>/)[1];

class ClassList {
  constructor(initial = '') { this.values = new Set(initial.split(/\s+/).filter(Boolean)); }
  add(...xs) { xs.forEach(x => this.values.add(x)); }
  remove(...xs) { xs.forEach(x => this.values.delete(x)); }
  contains(x) { return this.values.has(x); }
  toggle(x, force) {
    const on = force === undefined ? !this.contains(x) : !!force;
    on ? this.add(x) : this.remove(x);
    return on;
  }
}

class Element {
  constructor(id = '') {
    this.id = id; this.value = ''; this.textContent = ''; this.hidden = false;
    this.classList = new ClassList(); this.dataset = {}; this.style = {};
    this.listeners = {}; this.innerHTML = ''; this.tagName = 'BUTTON';
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  closest(selector) { return selector === '.cell' && this.classList.contains('cell') ? this : null; }
}

class Grid extends Element {
  constructor() { super('grid'); this.cells = []; this._html = ''; }
  set innerHTML(value) { this._html = value; this.cells = []; }
  get innerHTML() { return this._html; }
  insertAdjacentHTML(_where, markup) {
    if (!markup.includes('<button')) return;
    const cell = new Element();
    cell.classList = new ClassList(markup.match(/class="([^"]+)"/)[1]);
    for (const key of ['lane', 'step', 'v']) cell.dataset[key] = markup.match(new RegExp(`data-${key}="([^"]+)"`))[1];
    this.cells.push(cell);
  }
}

function audioNode(extra = {}) { return { connect(node) { return node; }, ...extra }; }
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 48000; this.destination = {}; this.sampleStarts = []; this.oscillators = 0; }
  resume() {}
  createOscillator() { this.oscillators++; return audioNode({ frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, start() {}, stop() {} }); }
  createGain() { return audioNode({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }); }
  createBufferSource() { const context = this; return audioNode({ start(time) { context.sampleStarts.push({ buffer: this.buffer, time }); }, buffer: null }); }
  async decodeAudioData(bytes) { const marker = new Uint8Array(bytes)[0]; if (marker === 255) throw new Error('bad audio'); return { marker, duration: marker === 254 ? 13 : 1 }; }
  createBiquadFilter() { return audioNode({ type: '', frequency: { value: 0 } }); }
  createBuffer(_channels, length) { return { getChannelData() { return new Float32Array(length); } }; }
}

function makeContext(hash = '', sampleStore = null) {
  const grid = new Grid();
  const ids = ['play','tempo','bpmText','phaseBadge','division','rollMode','hint','loop','metro','listenPractice','clear','preset','copy'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  elements.tempo.value = '90'; elements.division.value = '16'; elements.preset.value = 'basic';
  const document = {
    querySelector(selector) { return selector === '#grid' ? grid : (elements[selector.slice(1)] ||= new Element(selector.slice(1)));  },
    querySelectorAll(selector) { return selector === '.cell' ? grid.cells : []; }
  };
  const location = { hash, protocol: 'file:', href: `file:///groove-lab/index.html${hash}` };
  const context = vm.createContext({
    console, document, location, navigator: { clipboard: { async writeText() {} } },
    window: { AudioContext: FakeAudioContext, ...(sampleStore ? { indexedDB: sampleStore } : {}) }, matchMedia: () => ({ matches: false }),
    addEventListener() {}, setInterval: fn => (context.intervalFn = fn, 1), clearInterval() {},
    setTimeout: fn => (fn(), 1), structuredClone, Math, JSON, Array, ArrayBuffer, Uint8Array, Float32Array,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary')
  });
  vm.runInContext(source, context);
  return { context, grid, elements };
}

function state(context, expression) { return vm.runInContext(expression, context); }
function clickGrid(grid, cell) { grid.listeners.click({ target: cell }); }

async function main() {
const app = makeContext();
assert.equal(app.grid.cells.length, 160, '16th-note mode should render 5 lanes × 32 cells');
assert.equal(app.grid.cells.filter(c => c.classList.contains('bar-start')).length, 5, 'every lane needs a second-bar marker');
assert.deepEqual(state(app.context, "[data.snare[4],data.snare[12],data.snare[20],data.snare[28]]"), [3,3,3,3], 'preset should fill both bars');

const emptyRack = app.grid.cells.find(c => c.dataset.lane === 'rack' && c.dataset.step === '1');
for (const expected of ['2','3','1','0']) { clickGrid(app.grid, emptyRack); assert.equal(emptyRack.dataset.v, expected, `velocity cycle should reach ${expected}`); }
app.elements.rollMode.onclick({ currentTarget: app.elements.rollMode });
clickGrid(app.grid, emptyRack);
assert.equal(emptyRack.dataset.v, '2', 'Double mode should create a normal note in an empty cell');
assert(emptyRack.classList.contains('roll'), 'Double marker should be visible');

for (const [division, expectedCells] of [['8',80],['12',120],['16',160],['24',240]]) {
  app.elements.division.value = division;
  app.elements.division.onchange({ target: app.elements.division });
  assert.equal(app.grid.cells.length, expectedCells, `${division}-step subdivision should render two bars`);
}

app.elements.division.value = '8';
app.elements.division.onchange({ target: app.elements.division });
await app.elements.play.onclick();
assert.equal(state(app.context, 'countInStep'), 1, 'play should start count-in immediately');
assert.equal(app.elements.phaseBadge.textContent, '预备：1');
for (let i = 0; i < 7; i++) state(app.context, 'tick()');
assert.equal(state(app.context, 'current'), -1, 'groove must not start before the full count-in bar');
state(app.context, 'tick()');
assert.equal(state(app.context, 'current'), 0, 'groove should enter exactly on bar-one beat one');
assert.equal(app.elements.phaseBadge.hidden, true, 'count-in badge must hide when normal playback begins');
state(app.context, 'stop()');

app.elements.listenPractice.onclick();
await app.elements.play.onclick();
for (let i = 0; i < 7; i++) state(app.context, 'tick()');
state(app.context, 'tick()');
for (let i = 0; i < 16; i++) state(app.context, 'tick()');
assert.equal(state(app.context, 'practicePhase'), 1, 'after two groove bars, practice phase should begin');
assert.equal(app.elements.phaseBadge.textContent, '练：节拍器');
for (let i = 0; i < 16; i++) state(app.context, 'tick()');
assert.equal(state(app.context, 'practicePhase'), 0, 'after two click bars, groove phase should return');

const oldData = {hat:Array(16).fill(0),rack:Array(16).fill(0),snare:Array(16).fill(0),floor:Array(16).fill(0),kick:Array(16).fill(0),rolls:{hat:Array(16).fill(false),rack:Array(16).fill(false),snare:Array(16).fill(false),floor:Array(16).fill(false),kick:Array(16).fill(false)}};
oldData.kick[0] = 3;
const oldHash = '#' + Buffer.from(JSON.stringify({steps:16,data:oldData})).toString('base64');
const migrated = makeContext(oldHash);
assert.equal(state(migrated.context, 'data.kick.length'), 32, 'old one-bar links should expand to two bars');
assert.equal(state(migrated.context, 'data.kick[0]'), 3, 'old first-bar notes should be preserved');
assert.equal(state(migrated.context, 'data.kick[16]'), 0, 'migrated second bar should start empty');

// The previous public release stored total cells as version:2, not cells per bar.
for (const subdivision of [8,12,16,24]) {
  const total=subdivision*2;
  const recorded=Object.fromEntries(['hat','rack','snare','floor','kick'].map(lane=>[lane,Array(total).fill(0)]));
  recorded.kick[total-1]=3;
  recorded.rolls=Object.fromEntries(['hat','rack','snare','floor','kick'].map(lane=>[lane,Array(total).fill(false)]));
  recorded.rolls.kick[total-1]=true;
  const publicHash='#'+Buffer.from(JSON.stringify({version:2,steps:total,data:recorded})).toString('base64');
  const restored=makeContext(publicHash);
  assert.equal(restored.grid.cells.length,total*5,'old public two-bar links must remain two bars');
  assert.equal(restored.elements.division.value,String(subdivision));
  assert.equal(state(restored.context,`data.kick[${total-1}]`),3);
  assert.equal(state(restored.context,`data.rolls.kick[${total-1}]`),true);
  state(restored.context,'saveHash()');
  const roundtrip=makeContext('#'+restored.context.location.hash.replace(/^#/,''));
  assert.equal(roundtrip.grid.cells.length,total*5,'new links must retain the same subdivision and length');
  assert.equal(state(roundtrip.context,`data.kick[${total-1}]`),3);
}

assert(/min="40" max="220" step="5" value="90"/.test(html), 'tempo slider must snap in 5 BPM steps');


// A different actual recording must be selected for every velocity, with no re-pitching.
function file(name, marker, size = 4) {
  return { name, size, async arrayBuffer() { return Uint8Array.of(marker,0,0,0).buffer; } };
}
assert.equal(state(app.context, "identifySample('kick-weak.wav').velocity"), 1);
assert.equal(state(app.context, "identifySample('rack_tom_accent.wav').lane"), 'rack');
assert.equal(state(app.context, "identifySample('closed-hat-normal.wav').velocity"), 2);
assert.equal(state(app.context, "identifySample('snare.wav')"), null, 'do not guess an unlabelled velocity');
const files = [];
for (const [i,lane] of ['hat','rack','snare','floor','kick'].entries()) {
  for (const [v,level] of ['weak','medium','strong'].entries()) files.push(file(`${lane}-${level}.wav`,i*3+v+1));
}
app.context.importFiles = files;
await state(app.context, 'importSampleFiles(importFiles)');
assert.equal(state(app.context, 'sampleCount()'),15);
assert.equal(app.elements.soundStatus.textContent,'采样音色 · 弱 / 中 / 强');
assert(app.elements.soundMessage.textContent.includes('无法保存'), 'storage failure must be shown honestly');
for (const [i,lane] of ['hat','rack','snare','floor','kick'].entries()) for (const v of [1,2,3]) {
  state(app.context, `hit('${lane}',${v},10)`);
  assert.equal(state(app.context, 'audio.sampleStarts.at(-1).buffer.marker'),i*3+v);
}
const previous = state(app.context, 'audio.sampleStarts.length');
state(app.context, "hit('kick',0,10)");
assert.equal(state(app.context, 'audio.sampleStarts.length'), previous, 'silent cells should trigger nothing');

// Double must use that same velocity sample twice in every subdivision.
for (const division of [8,12,16,24]) for (const v of [1,2,3]) {
  state(app.context, `steps=${division};data=blank();data.snare[0]=${v};data.rolls.snare[0]=true;listenPractice=false;metro=false;playing=true;countInStep=steps;current=-1;audio.sampleStarts=[];tick()`);
  const hits=state(app.context,'audio.sampleStarts');
  assert.equal(hits.length,2);
  assert.equal(hits[0].buffer,hits[1].buffer);
  assert.equal(hits[0].buffer.marker,6+v);
  assert(Math.abs(hits[1].time-hits[0].time-state(app.context,'stepMs()/2000'))<1e-9);
}
state(app.context,'stop()');

app.context.importFiles=[file('kick-weak.wav',90),file('snare-medium.wav',255)];
await state(app.context,'importSampleFiles(importFiles)');
assert.equal(state(app.context,'sampleBuffers.kick[1].marker'),13,'failed batch must preserve prior bank');
app.context.importFiles=[file('soundb0.obw',1)];
await state(app.context,'importSampleFiles(importFiles)');
assert(app.elements.soundMessage.textContent.includes('.obw'));
app.context.importFiles=[file('kick-weak.wav',1),file('kick_weak.wav',2)];
await state(app.context,'importSampleFiles(importFiles)');
assert(app.elements.soundMessage.textContent.includes('多个文件'));
app.context.importFiles=[file('kick-weak.wav',254)];
await state(app.context,'importSampleFiles(importFiles)');
assert(app.elements.soundMessage.textContent.includes('12 秒'));
assert.equal(state(app.context,'sampleBuffers.kick[1].marker'),13);
app.context.importFiles=[file('kick-weak.wav',1,9*1024*1024)];
await state(app.context,'importSampleFiles(importFiles)');
assert(app.elements.soundMessage.textContent.includes('8 MB'));

// Simulate persistence across two independent app sessions.
let saved;
const sampleStore={open(){
  const request={};
  queueMicrotask(()=>{
    request.result={
      close(){},
      transaction(_name,mode){
        const tx={objectStore(){return {
          get(){const read={};queueMicrotask(()=>{read.result=structuredClone(saved);read.onsuccess()});return read},
          put(records){saved=structuredClone(records)}
        }}};
        if(mode==='readwrite')queueMicrotask(()=>tx.oncomplete());
        return tx;
      }
    };
    request.onsuccess();
  });
  return request;
}};
const first=makeContext('',sampleStore);first.context.importFiles=files;
await state(first.context,'importSampleFiles(importFiles)');
assert(first.elements.soundMessage.textContent.includes('已保存在当前浏览器'));
const second=makeContext('',sampleStore);
await second.elements.play.onclick();
assert.equal(state(second.context,'sampleCount()'),15,'saved bank should decode before playback starts');
assert.equal(state(second.context,'sampleBuffers.snare[1].marker'),7);
state(second.context,'stop()');
await state(second.context,'clearSampleFiles()');
assert.equal(state(second.context,'sampleCount()'),15);
const cleared=makeContext('',sampleStore);await cleared.elements.play.onclick();
assert.equal(state(cleared.context,'sampleCount()'),15,'reset must restore the built-in recorded kit');
assert.equal(state(cleared.context,'data.snare[4]'),3,'import/reset must preserve rhythm');
// Stop while audio is starting must cancel the pending start.
const pending=makeContext();const pendingStart=pending.elements.play.onclick();state(pending.context,'stop()');await pendingStart;
assert.equal(state(pending.context,'playing'),false);
console.log('Groove Lab sample self-check: all tests passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
