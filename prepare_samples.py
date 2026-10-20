"""Cut the supplied 24-hit render without normalizing or changing drum pitch."""
from pathlib import Path
import argparse
import hashlib
import json
from math import gcd
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('wav', type=Path)
args = parser.parse_args()
rate, raw = wavfile.read(args.wav)
if raw.dtype not in (np.int16, np.int32, np.float32, np.float64):
    raise ValueError(f'Unsupported PCM representation: {raw.dtype}')
divisor = 2**31 if raw.dtype == np.int32 else 2**15 if raw.dtype == np.int16 else 1
signal = raw.astype(np.float64) / divisor
if signal.ndim != 2 or signal.shape[1] != 2:
    raise ValueError('Expected the exported stereo mix')
if len(signal) / rate < 290:
    raise ValueError('The 24-hit export is incomplete')
if np.any(np.abs(signal) >= .99999):
    raise ValueError('The supplied recording contains clipped samples')
mapping = json.loads((root / 'sampling-map.json').read_text())
output = root / 'samples'
output.mkdir(exist_ok=True)
report = []
for item in mapping:
    expected = item['seconds']
    left = round((expected - .15) * rate)
    right = min(len(signal), round((expected + 11.98) * rate))
    window = signal[left:right]
    peak = float(np.max(np.abs(window)))
    if peak < 1e-4:
        raise ValueError(f'Missing strike: {item["filename"]}')
    background = float(np.max(np.abs(window[:round(.1 * rate)])))
    # The strong Ride has a very quiet tail at the next weak Crash. Detect the
    # actual attack above that background, rather than calling its tail an onset.
    attack_threshold = max(2e-6, peak * .0001, background * 4)
    energy = np.max(np.abs(window), axis=1)
    active = np.flatnonzero(energy > attack_threshold)
    if not len(active):
        raise ValueError(f'Attack not found: {item["filename"]}')
    onset = (left + int(active[0])) / rate
    if abs(onset - expected) > .01:
        raise ValueError(f'Unexpected attack at {onset}: {item["filename"]}')
    # Use MIDI-aligned starts to retain all low-level attack samples. No fade-in.
    start = round((expected - .002) * rate) - left
    block = max(1, round(.01 * rate))
    envelopes = np.array([np.sqrt(np.mean(window[i:i+block] ** 2))
                          for i in range(0, len(window), block)])
    threshold = max(1e-6, peak * .00025)
    last = int(np.flatnonzero(envelopes > threshold)[-1])
    stop = min(len(window), max(start + round(.2*rate), (last+1)*block+round(.05*rate)))
    clip = window[start:stop].copy()
    # Fade only the already very quiet final 15 ms; preserve the cymbal decay.
    fade = min(round(.015 * rate), len(clip))
    clip[-fade:] *= np.linspace(1, 0, fade)[:, None]
    if rate != 44100:
        common = gcd(rate,44100)
        clip = resample_poly(clip,44100//common,rate//common)
    if np.max(np.abs(clip)) >= 1:
        raise ValueError('Resampling would clip; inspect the source recording')
    pcm = np.round(clip * 32767).astype(np.int16)
    path = output / item['filename']
    wavfile.write(path,44100,pcm)
    report.append({
        'lane':item['lane'],'velocity':item['order']%3 or 3,
        'midi_velocity':item['velocity'],'name':item['filename'],
        'onset_seconds':round(onset,6),'expected_seconds':expected,
        'duration':round(len(clip)/44100,6),'peak_dbfs':round(20*np.log10(peak),2),
        'tail_cut_rms_dbfs':round(20*np.log10(max(float(envelopes[min(last+1,len(envelopes)-1)]),1e-12)),2),
        'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()
    })
for lane in {row['lane'] for row in report}:
    layers = sorted((row for row in report if row['lane']==lane),key=lambda row:row['velocity'])
    assert len(layers)==3
    assert layers[0]['peak_dbfs'] < layers[1]['peak_dbfs'] < layers[2]['peak_dbfs'],lane
(root/'sample-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
print('Total trimmed WAV bytes:',sum(row['bytes'] for row in report))
