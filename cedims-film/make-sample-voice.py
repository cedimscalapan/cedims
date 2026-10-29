from pathlib import Path
import sys
sys.path.insert(0,str(Path('.ttsdeps').resolve()))
from kokoro_onnx import Kokoro
import soundfile as sf
from numpy import zeros, concatenate
lines=[
'Open the assigned teaching load.',
'Move to Upload to add a lesson plan PDF.',
'Then open Tracker to check the submission status.'
]
model=Kokoro('.tts-model/kokoro-v1.0.onnx','.tts-model/voices-v1.0.bin')
for i,line in enumerate(lines,1):
 a,rate=model.create(line,voice='af_heart',speed=0.88,lang='en-us')
 sf.write(f'public/sample-voice-{i}.wav',a,rate)
 print(i,len(a)/rate,flush=True)
