from pathlib import Path
import sys
sys.path.insert(0,str(Path('.ttsdeps').resolve()))
from kokoro_onnx import Kokoro
import soundfile as sf
m=Kokoro('.tts-model/kokoro-v1.0.onnx','.tts-model/voices-v1.0.bin')
for i,t in enumerate(['Change the reporting week. The district totals update with it.','Open trends to inspect uploads and missing lesson logs across schools.'],1):
 a,r=m.create(t,voice='af_heart',speed=0.88,lang='en-us')
 sf.write(f'public/live-recordings/voice-{i}.wav',a,r)
 print(i,len(a)/r,flush=True)
