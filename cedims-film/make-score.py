"""Generate an original restrained stereo score and interface accents."""
import math
import wave
from array import array
from pathlib import Path

RATE = 22050
DURATION = 60
OUT = Path(__file__).parent / "public" / "score.wav"
SCENES = [0, 7, 12, 17, 22, 27, 31, 36, 41, 46, 50, 56]
left = array("h")
right = array("h")

for n in range(RATE * DURATION):
    t = n / RATE
    # Three low sine tones form a quiet original bed.
    swell = min(1.0, t / 5, (60 - t) / 7)
    bed = (math.sin(2 * math.pi * 55 * t) * 0.18
           + math.sin(2 * math.pi * 82.41 * t) * 0.08
           + math.sin(2 * math.pi * 110 * t) * 0.035)
    pulse = 0.0
    if t < 7:
        phase = t % 0.75
        pulse = 0.14 * math.exp(-phase * 15) * math.sin(2 * math.pi * (85 - 35 * phase) * phase)
    elif t < 56:
        phase = (t - 7) % 2.0
        pulse = 0.075 * math.exp(-phase * 18) * math.sin(2 * math.pi * 130 * phase)
    tick = 0.0
    for mark in SCENES[1:]:
        d = t - mark
        if 0 <= d < 0.12:
            tick += 0.12 * math.exp(-d * 40) * math.sin(2 * math.pi * 960 * d)
    v = (bed * swell + pulse + tick) * 0.32
    pan = 0.04 * math.sin(t / 9)
    left.append(int(max(-1, min(1, v * (1 - pan))) * 32767))
    right.append(int(max(-1, min(1, v * (1 + pan))) * 32767))

interleaved = array("h")
for l, r in zip(left, right):
    interleaved.extend((l, r))
with wave.open(str(OUT), "wb") as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(interleaved.tobytes())
print(OUT)
