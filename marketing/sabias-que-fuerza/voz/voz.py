"""Genera la voz en off (Piper, voz es_MX-claude-high) y la mezcla con el video.
Uso: python3 voz/voz.py <ruta_modelo.onnx>
Requiere: pip install piper-tts, ffmpeg y el modelo desde huggingface.co/rhasspy/piper-voices.
"""
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
model = sys.argv[1]
OFFS = [0.35, 5.15, 13.65, 22.15, 33.15]   # inicio de cada frase (s), calza con S en scene.html
lines = [l.strip() for l in open(os.path.join(here, 'guion.txt'), encoding='utf-8') if l.strip()]
segs = []
for i, line in enumerate(lines):
    out = os.path.join(here, f'seg{i+1}.wav')
    subprocess.run([sys.executable, '-m', 'piper', '-m', model, '--length-scale', '0.9', '--sentence-silence', '0.15', '-f', out],
                   input=line.encode(), check=True, stderr=subprocess.DEVNULL)
    segs.append(out)
inp = sum([['-i', s] for s in segs], [])
f = ''.join(f'[{i}]adelay={int(o*1000)}|{int(o*1000)}[a{i}];' for i, o in enumerate(OFFS))
f += ''.join(f'[a{i}]' for i in range(len(segs))) + f'amix=inputs={len(segs)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[v]'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inp, '-filter_complex', f, '-map', '[v]', '-ar', '48000', os.path.join(here, 'voz-en-off.wav')], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(root, 'video_sin_audio.mp4'), '-i', os.path.join(here, 'voz-en-off.wav'),
                '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', os.path.join(root, 'sabias-que-fuerza.mp4')], check=True)
for s in segs: os.remove(s)
print('listo: sabias-que-fuerza.mp4')
