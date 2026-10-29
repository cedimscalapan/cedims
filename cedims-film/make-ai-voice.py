from pathlib import Path
import sys
sys.path.insert(0,str(Path('.ttsdeps').resolve()))
from kokoro_onnx import Kokoro
import soundfile as sf
text=("Instructional records move through many hands. Each week brings teaching loads, lesson plans, deadlines, and follow-ups. "
"When these pieces are scattered, it takes longer to see what is complete, what still needs attention, and where support is needed. "
"C DIMS brings the work into one shared view for Calapan East District. Teachers begin with their assigned subjects, upload documents, and see the status of every submission. "
"A calendar keeps upcoming weeks visible. School leaders can review progress across their school, while district supervisors can see the wider picture across five schools. "
"From there, they can open the archive, follow a school folder, and examine trends in the data. The path from classroom record to district insight stays connected. "
"That means less searching, clearer follow-up, and more confident decisions. C DIMS. Clear records. Shared responsibility.")
model=Kokoro('.tts-model/kokoro-v1.0.onnx','.tts-model/voices-v1.0.bin')
samples,rate=model.create(text,voice='af_heart',speed=0.85,lang='en-us')
sf.write('public/voice.wav',samples,rate)
print('duration',len(samples)/rate,'sample rate',rate)
