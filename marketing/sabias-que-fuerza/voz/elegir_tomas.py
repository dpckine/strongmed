# Elige la mejor toma de cada frase (Whisper), la recorta, arma la pista y calcula los tiempos de escena.
import glob, re, json, unicodedata, difflib, sys, numpy as np, librosa, soundfile as sf
from faster_whisper import WhisperModel
OUT=sys.argv[1]
REF=["¿Sabías que tu músculo empieza a desaparecer antes de lo que crees?",
"Desde los 30 años, si no entrenas fuerza, pierdes entre un 3 y un 8 % de tu masa muscular por década.",
"La buena noticia: solo 30 a 60 minutos de fuerza a la semana se asocian a un 10 a 20 % menos de riesgo de muerte.",
"Y tu músculo funciona como un órgano: al contraerse, libera mioquinas, que ayudan a bajar la inflamación, controlar la glucosa, y cuidar tus huesos y tu cerebro.",
"Nunca es tarde para empezar. Empieza hoy a entrenar fuerza con tu kinesiólogo en StrongMed."]
norm=lambda s:re.sub(r'[^a-z0-9 ]','',unicodedata.normalize('NFKD',s.lower().replace('%',' ')).encode('ascii','ignore').decode()).split()
m=WhisperModel("small",device="cpu",compute_type="int8"); SR=24000
best=[]
for i in range(1,6):
    cands=[]
    for f in sorted(glob.glob(f'cbout/{i}_*.wav')):
        a,_=librosa.load(f,sr=SR); a,_=librosa.effects.trim(a,top_db=35)
        segs,_=m.transcribe(librosa.resample(a,orig_sr=SR,target_sr=16000),language='es',beam_size=5,word_timestamps=True)
        segs=list(segs); txt=' '.join(s.text for s in segs)
        words=[(w.word.strip(),w.start) for s in segs for w in s.words]
        r=difflib.SequenceMatcher(None,norm(txt),norm(REF[i-1])).ratio()
        cands.append((r,f,a,words,txt)); print(i,f,round(r,3),round(len(a)/SR,2),'|',txt,flush=True)
    best.append(max(cands,key=lambda c:c[0]))
GAP=0.55; t=0.3; OFF=[]; track=[np.zeros(int(t*SR))]
for r,f,a,w,txt in best:
    OFF.append(t); track+= [a, np.zeros(int(GAP*SR))]; t+=len(a)/SR+GAP
END=t-GAP; D=round(END+1.6,2)
voice=np.concatenate(track); voice=np.concatenate([voice,np.zeros(int(D*SR)-len(voice))]) if len(voice)<D*SR else voice
sf.write(f'{OUT}/voz-en-off-raw.wav',voice,SR)
S=[0]+[round(o-0.3,2) for o in OFF[1:]]
def wt(words,key):
    for w,s in words:
        if key in unicodedata.normalize('NFKD',w.lower()).encode('ascii','ignore').decode(): return s
    return None
w4=best[3][3]; ARR=[]
for k,fb in zip(['inflam','gluc','hues','cerebr'],[6.3,7.8,9.1,9.9]):
    s=wt(w4,k); ARR.append(round(OFF[3]-S[3]+(s if s is not None else fb)+0.15,2))
json.dump({'D':D,'S':S,'ARR':ARR},open(f'{OUT}/timing.json','w'))
f=lambda x:'00:00:%02d,%03d'%(int(x),round((x%1)*1000))
open(f'{OUT}/srt.srt','w').write(''.join(f"{i+1}\n{f(o)} --> {f(o+len(b[2])/SR)}\n{REF[i]}\n\n" for i,(o,b) in enumerate(zip(OFF,best))))
print('elegidas',[b[1] for b in best]); print(json.load(open(f'{OUT}/timing.json')))
