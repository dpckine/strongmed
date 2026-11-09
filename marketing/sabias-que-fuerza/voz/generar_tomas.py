# Genera 3 tomas por frase con Chatterbox Multilingual (voz masculina por defecto, licencia MIT).
# Uso: HF_HUB_DISABLE_XET=1 python generar_tomas.py guion.txt  (deja las tomas en cbout/)
import torch, torchaudio as ta, sys, os, json
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
lines=[l.strip() for l in open(sys.argv[1],encoding='utf-8') if l.strip()]
m=ChatterboxMultilingualTTS.from_pretrained(device="cpu")
os.makedirs('cbout',exist_ok=True)
for i,line in enumerate(lines,1):
    for s in range(3):
        torch.manual_seed(100+s)
        w=m.generate(line, language_id="es", exaggeration=0.55, cfg_weight=0.5, temperature=0.75)
        ta.save(f'cbout/{i}_{s}.wav', w, m.sr); print(i,s,round(w.shape[-1]/m.sr,2),flush=True)
