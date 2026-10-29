"""Original transition impacts and whooshes for the reference-style edit."""
from pathlib import Path
import sys
import numpy as np

ROOT=Path(__file__).parent
sys.path.insert(0,str(ROOT/'.ttsdeps'))
import soundfile as sf
RATE=22050
DURATION=140
audio=np.zeros((RATE*DURATION,2),dtype=np.float32)
rng=np.random.default_rng(20261029)

def add_hit(t, strength=1.0):
    start=int(t*RATE)
    n=int(.55*RATE)
    u=np.arange(n)/RATE
    kick=np.sin(2*np.pi*(105*u-67*u*u))*np.exp(-u*17)*.34
    noise=rng.normal(0,1,n)
    smooth=np.convolve(noise,np.ones(13)/13,mode='same')
    swell=smooth*np.sin(np.pi*np.minimum(u/.55,1))**2*.20
    mono=(kick+swell)*strength
    end=min(start+n,len(audio))
    audio[start:end,0]+=mono[:end-start]
    audio[start:end,1]+=mono[:end-start]*.92

for t in [0,12,20,34,58,70,88,104,120,132]: add_hit(t,.9)
for t in [23,37,61,73,91,107]: add_hit(t,.62)
audio=np.clip(audio,-.8,.8)
sf.write(ROOT/'public'/'launch'/'transition-sfx.wav',audio,RATE)
print('created original transition effects')
