"""Build a reproducible single-file app and a complete offline package."""
from pathlib import Path
import re
import shutil
import struct
import zipfile
import json
import base64
import gzip

root = Path(__file__).resolve().parent
workspace = root.parent
if (root/'sample-report.json').exists() and (root/'samples').exists():
    entries=[]
    for item in json.loads((root/'sample-report.json').read_text()):
        entries.append({key:item[key] for key in ['lane','velocity','midi_velocity','name']})
        entries[-1]['data']=base64.b64encode((root/'samples'/item['name']).read_bytes()).decode('ascii')
else:
    sample_source=root/'index.html'
    if not sample_source.exists():
        sample_source=workspace/'groove-lab-mainroom'/'index.html'
    original=sample_source.read_text()
    packed=re.search(r'<script type="application/json" id="builtinSampleData">(.*?)</script>',original,re.S)
    if packed:
        entries=list(json.loads(packed.group(1)).values())
        for item in entries:
            compressed=b''.join((root/name).read_bytes() for name in item['parts']) if 'parts' in item else base64.b64decode(item['data'])
            item['data']=base64.b64encode(gzip.decompress(compressed)).decode('ascii')
    else:
        entries=json.loads(re.search(r'^const builtinSamples=(.*);$',original,re.M).group(1))
metadata=[]
packed={}
for item in entries:
    raw=base64.b64decode(item['data'])
    info={key:item[key] for key in ['lane','velocity','midi_velocity','name']}
    metadata.append({**info,'byteLength':len(raw)})
    packed[f"{item['lane']}:{item['velocity']}"]={**info,'compression':'gzip','data':base64.b64encode(gzip.compress(raw,compresslevel=9,mtime=0)).decode('ascii')}
builtin='const builtinSamples='+json.dumps(metadata,separators=(',',':'))+';'
sample_data='<script type="application/json" id="builtinSampleData">'+json.dumps(packed,separators=(',',':'))+'</script>'
css = (root / 'styles.css').read_text()
script = (root / 'editor.js').read_text() + '\n' + (root / 'sequencer.js').read_text() + '\n' + (root / 'vendor/pako_inflate.min.js').read_text() + '\n' + builtin + '\n' + (root / 'samples.js').read_text()
page = (root / 'template.html').read_text().replace('/* STYLES */', css).replace('<!-- SAMPLE_DATA -->',sample_data).replace('// SCRIPT', script)
(root / 'index.html').write_text(page)
(workspace / 'groove-lab-mainroom.html').write_text(page)
for filename in ['icon.svg', 'LICENSE']:
    if not (root / filename).exists():
        shutil.copyfile(workspace / 'groove-lab-mainroom' / filename, root / filename)

# MIDI format 0, channel 10, 960 PPQ, 120 BPM. Six bars between strikes.
def vlq(number):
    result = [number & 127]
    while number > 127:
        number >>= 7
        result.insert(0, (number & 127) | 128)
    return bytes(result)

instruments = [('kick',36),('snare',38),('hat',42),('rack',48),('rack2',47),('floor',43),('ride',51),('crash',49)]
layers = [('weak',25),('medium',85),('strong',120)]
events = [(0, b'\xff\x51\x03\x07\xa1\x20'), (0, b'\xff\x58\x04\x04\x02\x18\x08')]
name = b'Groove Lab Main Room 24 Hits - v25 85 120'
events.append((0, b'\xff\x03'+vlq(len(name))+name))
report = []
for lane,note in instruments:
    for level,velocity in layers:
        i = len(report)
        seconds = 2 + 12*i
        tick = seconds*1920
        marker = f'{lane}-{level}-v{velocity}'.encode()
        events += [(tick,b'\xff\x06'+vlq(len(marker))+marker),(tick,bytes([0x99,note,velocity])),(tick+192,bytes([0x89,note,0]))]
        report.append({'order':i+1,'lane':lane,'level':level,'velocity':velocity,'note':note,'seconds':seconds,'filename':f'{lane}-{level}.wav'})
events.append((290*1920,b'\xff\x2f\x00'))
track = bytearray()
previous = 0
for tick,event in sorted(events,key=lambda e:e[0]):
    track += vlq(tick-previous)+event
    previous=tick
midi = b'MThd'+struct.pack('>IHHH',6,0,1,960)+b'MTrk'+struct.pack('>I',len(track))+track
midi_name = 'groove-lab-mainroom-24-hits.mid'
(workspace / midi_name).write_bytes(midi)
(root / midi_name).write_bytes(midi)
(root / 'sampling-map.json').write_text(json.dumps(report,indent=2))
with zipfile.ZipFile(workspace / 'groove-lab-mainroom.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    archive.writestr('Start-Groove-Lab.cmd',(root/'Start-Groove-Lab.cmd').read_text().replace('\r\n','\n').replace('\n','\r\n'))
    archive.write(root/'开始使用.txt','开始使用.txt')
    for name in ['index.html','manifest.webmanifest','sw.js','icon.svg','icon-192.png','icon-512.png','.nojekyll','GITHUB-PUBLISHING.md','README.md','LICENSE','tests/self-check.cjs','tests/browser-check.cjs','tests/web-check.cjs',midi_name,'sampling-map.json','sampling-guide.md','template.html','styles.css','editor.js','sequencer.js','samples.js','build.py','build_web.py','download.html','prepare_samples.py','sample-report.json','vendor/pako_inflate.min.js','vendor/PAKO-LICENSE.txt']:
        archive.write(root/name,name)
with zipfile.ZipFile(workspace / 'groove-lab-mainroom.zip') as archive:
    assert archive.testzip() is None
    assert archive.read('index.html') == (workspace/'groove-lab-mainroom.html').read_bytes()
    assert archive.read('tests/self-check.cjs') == (root/'tests/self-check.cjs').read_bytes()
    launcher=archive.read('Start-Groove-Lab.cmd')
    assert launcher.startswith(b'@echo off\r\n')
    assert b'%~dp0index.html' in launcher
    assert b'\n' not in launcher.replace(b'\r\n',b'')
    assert archive.read('开始使用.txt') == (root/'开始使用.txt').read_bytes()
print(json.dumps({'html_bytes':len(page.encode()),'zip_bytes':(workspace/'groove-lab-mainroom.zip').stat().st_size,'midi_bytes':len(midi),'hits':len(report),'duration_seconds':290}))
