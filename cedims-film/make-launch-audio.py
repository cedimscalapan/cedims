"""Generate a local narration and original music bed for the launch film."""
from pathlib import Path
import sys, math, wave
from array import array

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / '.ttsdeps'))
from kokoro_onnx import Kokoro
import numpy as np
import soundfile as sf

SCENES = [
    (12, "Every week, instructional records move between teachers and supervisors. When lesson logs, deadlines, and follow-ups are scattered, the full picture is hard to see."),
    (8, "Meet Smart E Vision, the progressive web app for instructional supervision archiving in Calapan East District."),
    (14, "The work begins with a teaching load. Assigned subjects and weekly requirements give each teacher a clear place to start."),
    (24, "A teacher chooses a lesson document. Smart E Vision reads the file and suggests details such as the learning area, grade, term, and week. The teacher checks those details, then submits the record."),
    (12, "The document enters the archive with its status, date, and verification information connected to the submission."),
    (18, "A reviewer opens the actual file, examines the lesson plan, and records remarks. The teacher can see when the document has been checked."),
    (16, "School leaders can see missing work, documents waiting for remarks, and submissions that arrived on time or after the deadline."),
    (16, "District supervisors can look across schools, follow the records that need attention, and explore patterns that help guide technical assistance."),
    (12, "On a phone, the same archive remains accessible. A document's QR code opens its verification record and confirms the official file."),
    (8, "From classroom record to district insight. Smart E Vision. Clear records. Shared responsibility."),
]

out = ROOT / 'public' / 'launch'
out.mkdir(parents=True, exist_ok=True)
model = Kokoro(str(ROOT / '.tts-model' / 'kokoro-v1.0.onnx'), str(ROOT / '.tts-model' / 'voices-v1.0.bin'))
voice_segments = []
rate = None
for i, (slot, words) in enumerate(SCENES):
    samples, rate = model.create(words, voice='af_heart', speed=1.0, lang='en-us')
    samples = np.asarray(samples, dtype=np.float32)
    if len(samples) > int((slot - 0.3) * rate):
        print(f'WARNING scene {i+1} voice {len(samples)/rate:.1f}s exceeds {slot}s')
    voice_segments.append(np.pad(samples[:int(slot*rate)], (0, max(0, int(slot*rate)-len(samples)))))
    print(f'scene {i+1}: {len(samples)/rate:.1f}s / {slot}s')
sf.write(out / 'voice.wav', np.concatenate(voice_segments), rate)

MUSIC_RATE = 22050
duration = sum(s for s, _ in SCENES)
left, right = array('h'), array('h')
beat = 60 / 92
scene_marks = []
elapsed = 0
for seconds, _ in SCENES:
    scene_marks.append(elapsed)
    elapsed += seconds
for n in range(MUSIC_RATE * duration):
    t = n / MUSIC_RATE
    fade = min(1, t/4, (duration-t)/6)
    phase = t % beat
    low = (math.sin(2*math.pi*55*t)*0.36 + math.sin(2*math.pi*82.41*t)*0.14)
    pulse = math.exp(-phase*20) * math.sin(2*math.pi*(92-34*phase)*phase) * (0.35 if t > 12 else 0.15)
    shimmer = math.sin(2*math.pi*220*t)*math.sin(2*math.pi*0.13*t)*0.03
    mark = 0
    for sm in scene_marks[1:]:
        d = t-sm
        if 0 <= d < 0.2:
            mark += math.exp(-d*28)*math.sin(2*math.pi*850*d)*0.22
    v = (low+pulse+shimmer+mark)*0.17*fade
    pan = 0.05*math.sin(t/8)
    left.append(int(max(-1,min(1,v*(1-pan)))*32767))
    right.append(int(max(-1,min(1,v*(1+pan)))*32767))
pcm = array('h')
for a,b in zip(left,right): pcm.extend((a,b))
with wave.open(str(out/'score.wav'),'wb') as wav:
    wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(MUSIC_RATE); wav.writeframes(pcm.tobytes())
print(f'generated {duration} seconds')
