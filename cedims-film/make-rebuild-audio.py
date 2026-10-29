"""Original narration, score and edit accents for the Smart E-VISION rebuild."""
from pathlib import Path
import sys
import os
import tempfile

ROOT = Path(__file__).parent
os.environ['TEMP'] = str(ROOT / '.tts-temp')
os.environ['TMP'] = str(ROOT / '.tts-temp')
tempfile.tempdir = str(ROOT / '.tts-temp')
sys.path.insert(0, str(ROOT / '.ttsdeps'))
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

SCENES = [
    (8, "One missing lesson log. One deadline passing. Without a shared view, small gaps become hard to catch."),
    (8, "Now every record, reminder, and review can move through one clear workflow."),
    (7, "Introducing Smart E Vision. Instructional supervision, connected from classroom to district."),
    (10, "A teacher begins with an assigned teaching load. Subject, grade, term, and week are part of the workflow."),
    (12, "Choose the lesson document. The system reads its details. Review the suggested information, then submit."),
    (10, "The upload becomes a searchable record, with its date, status, and verification link in one place."),
    (12, "Supervisors open the actual file, review the lesson plan, and add remarks attached to that record."),
    (11, "Teachers can see when a file has been checked. No guessing where the feedback went."),
    (12, "At school level, missing submissions and review queues stand out immediately. Leaders know what needs attention first."),
    (14, "At district level, those records reveal patterns across schools and weeks. Follow up where support can make the most difference."),
    (11, "On a phone, the archive stays within reach. Scan the document's Q R code to open its verification record."),
    (11, "From an individual lesson plan to a clear district picture. Smart E Vision. Clear records. Shared responsibility."),
]

OUT = ROOT / 'public' / 'rebuild'
OUT.mkdir(parents=True, exist_ok=True)
model = Kokoro(str(ROOT / '.tts-model' / 'kokoro-v1.0.onnx'), str(ROOT / '.tts-model' / 'voices-v1.0.bin'))
voice = []
sample_rate = None
for i, (slot, words) in enumerate(SCENES):
    samples, sample_rate = model.create(words, voice='af_heart', speed=1.03, lang='en-us')
    samples = np.asarray(samples, dtype=np.float32)
    room = int(slot * sample_rate)
    print(f'{i+1:02d}: {len(samples)/sample_rate:.2f}s / {slot}s')
    if len(samples) > room - int(0.15 * sample_rate):
        print(f'WARNING: narration for scene {i+1} is tight')
    voice.append(np.pad(samples[:room], (0, max(0, room-len(samples)))))
sf.write(OUT / 'voice.wav', np.concatenate(voice), sample_rate)

RATE = 22050
DURATION = sum(slot for slot, _ in SCENES)
music = np.zeros((DURATION * RATE, 2), dtype=np.float32)
sfx = np.zeros_like(music)
rng = np.random.default_rng(29)
BEAT = 60 / 105

def add(dst, time, signal, pan=0):
    start = max(0, int(time * RATE))
    end = min(len(dst), start + len(signal))
    if end <= start:
        return
    x = signal[:end-start]
    dst[start:end, 0] += x * (1-pan)
    dst[start:end, 1] += x * (1+pan)

def tone(hz, seconds, amplitude, kind='bell'):
    t = np.arange(int(seconds * RATE), dtype=np.float32) / RATE
    if kind == 'pad':
        wave = np.sin(2*np.pi*hz*t) + .33*np.sin(2*np.pi*2*hz*t) + .12*np.sin(2*np.pi*3*hz*t)
        env = np.minimum(1, t/.24) * np.minimum(1, (seconds-t)/.35)
    elif kind == 'bass':
        wave = np.sin(2*np.pi*hz*t) + .24*np.sin(2*np.pi*2*hz*t)
        env = np.exp(-t*3.2) * np.minimum(1, t/.006)
    else:
        wave = np.sin(2*np.pi*hz*t) + .4*np.sin(2*np.pi*2*hz*t) + .15*np.sin(2*np.pi*4*hz*t)
        env = np.exp(-t*5.2) * np.minimum(1, t/.012)
    return wave * env * amplitude

chords = [
    [164.81, 196.00, 246.94],  # Em
    [130.81, 164.81, 196.00],  # C
    [146.83, 196.00, 246.94],  # D
    [123.47, 146.83, 185.00],  # Bm
]
bar = BEAT * 4
for bar_i, bar_t in enumerate(np.arange(0, DURATION, bar)):
    chord = chords[bar_i % 4]
    section_gain = .58 if bar_t < 16 else (1.0 if bar_t < 78 else 1.15)
    if bar_t >= 115:
        section_gain *= .62
    for j, hz in enumerate(chord):
        add(music, bar_t, tone(hz, bar*1.16, .012*section_gain, 'pad'), pan=(j-1)*.16)
    root = chord[0]/4
    for beat_i in range(4):
        bt = bar_t + beat_i*BEAT
        add(music, bt, tone(root, .46, .065*section_gain, 'bass'))
        if bar_t >= 16 and bar_t < 115:
            t = np.arange(int(.36*RATE))/RATE
            kick = np.sin(2*np.pi*(105*t-55*t*t))*np.exp(-t*19)*(.19 if beat_i in (0,2) else .12)
            add(music, bt, kick)
            if beat_i in (1,3):
                n = rng.normal(0, 1, int(.18*RATE))
                env = np.exp(-np.arange(len(n))/RATE*24)
                add(music, bt, n*env*.035, pan=.05)
        for eighth in range(2):
            ht = bt + eighth*BEAT/2
            if ht >= 16 and ht < 115:
                n = rng.normal(0, 1, int(.055*RATE))
                env = np.exp(-np.arange(len(n))/RATE*76)
                add(music, ht, n*env*.009*section_gain, pan=(-.28 if eighth else .28))
    if bar_t >= 23 and bar_t < 115:
        for step, note in enumerate([0, 1, 2, 1, 0, 2, 1, 2]):
            add(music, bar_t+step*BEAT/2, tone(chord[note]*2, .42, .014*section_gain), pan=.18 if step%2 else -.18)

chapter_starts = [0, 8, 16, 23, 33, 45, 55, 67, 78, 90, 104, 115]
for i, start in enumerate(chapter_starts):
    t = np.arange(int(.55*RATE))/RATE
    hit = np.sin(2*np.pi*(85*t-42*t*t))*np.exp(-t*11)*.25
    add(sfx, start, hit, pan=(-.1 if i%2 else .1))
    if i in (2, 8, 9, 11):
        n = rng.normal(0, 1, int(.7*RATE))
        env = np.exp(-np.arange(len(n))/RATE*8)
        add(sfx, start, n*env*.043)

# Tactile clicks, document confirmation and QR reveal.
for i, t0 in enumerate([3, 6, 25.6, 29.2, 35.6, 39.5, 43.4, 48.2, 52.3,
                        58.4, 63.3, 70.4, 81.5, 85.5, 93.8, 99.7, 108.2, 111.4]):
    add(sfx, t0, tone(650 if i%3 else 880, .18, .045), pan=.25 if i%2 else -.25)
for t0 in [15.3, 44.3, 77.2, 103.2, 117.4]:
    d=.7
    t=np.arange(int(d*RATE))/RATE
    noise=rng.normal(0, 1, len(t))
    smooth=np.convolve(noise, np.ones(17)/17, mode='same')
    whoosh=smooth*np.sin(np.pi*t/d)**2*.12
    add(sfx, t0, whoosh, pan=-.22)

fade_in=np.clip(np.arange(len(music))/RATE/2.0, 0, 1)
fade_out=np.clip((DURATION-np.arange(len(music))/RATE)/3.0, 0, 1)
music *= np.minimum(fade_in, fade_out)[:, None]
sf.write(OUT / 'score.wav', np.clip(music, -.88, .88), RATE)
sf.write(OUT / 'sfx.wav', np.clip(sfx, -.88, .88), RATE)
print('generated', DURATION, 'seconds')
