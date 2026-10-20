"""Prepare small static assets for Pages without changing the recorded audio."""
from pathlib import Path
import base64
import hashlib
import json
import re
import shutil

root = Path(__file__).resolve().parent
destination = root.parent / 'groove-lab-web'
destination.mkdir(exist_ok=True)
for directory in ('audio', 'downloads'):
    for old in (destination / directory).glob('*.bin'):
        old.unlink()
page = (root / 'index.html').read_text()
pattern = r'(<script type="application/json" id="builtinSampleData">)(.*?)(</script>)'
match = re.search(pattern, page, re.S)
bank = json.loads(match[2])
chunk_bytes = 256 * 1024

def split_asset(data, directory, prefix):
    paths = []
    for i, offset in enumerate(range(0, len(data), chunk_bytes)):
        name = f'{directory}/{prefix}-{i:02}.bin'
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data[offset:offset + chunk_bytes])
        paths.append(name)
    return paths

for key, entry in bank.items():
    data = base64.b64decode(entry['data']) if 'data' in entry else b''.join((root / p).read_bytes() for p in entry['parts'])
    digest = hashlib.sha256(data).hexdigest()
    entry.pop('data', None)
    entry.update(parts=split_asset(data, 'audio', f'{key.replace(":", "-")}-{digest[:12]}'), packedBytes=len(data), sha256=digest)
manifest = json.dumps(bank, separators=(',', ':'))
(destination / 'index.html').write_text(page[:match.start(2)] + manifest + page[match.end(2):])
for path in root.rglob('*'):
    relative = path.relative_to(root)
    if path.is_file() and '.git' not in relative.parts and relative.parts[0] not in ('audio', 'downloads') and path.name != 'index.html':
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

package = (root.parent / 'groove-lab-mainroom.zip').read_bytes()
digest = hashlib.sha256(package).hexdigest()
download = {'name':'groove-lab-mainroom.zip', 'bytes':len(package), 'sha256':digest, 'parts':split_asset(package, 'downloads', f'offline-{digest[:12]}')}
(destination / 'downloads/manifest.json').write_text(json.dumps(download, separators=(',', ':')))
print(json.dumps({'web_html_bytes':(destination/'index.html').stat().st_size, 'audio_bytes':sum(e['packedBytes'] for e in bank.values()), 'audio_parts':sum(len(e['parts']) for e in bank.values()), 'download_parts':len(download['parts']), 'zip_bytes':len(package), 'zip_sha256':digest}))
