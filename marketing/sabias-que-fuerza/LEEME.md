# Video "¿Sabías que…?" — Entrenamiento de fuerza

Formato vertical 1080×1920, 39,5 s, 30 fps, **con voz en off** (voz neuronal masculina en español latino, Piper `es_MX-ald-medium`). Las personas animadas son las mismas figuras de ejercicios de la app (`js/sm-anim.js`), con el músculo que trabaja resaltado en verde.

`voz-en-off.srt` tiene los subtítulos con tiempos (para Instagram o CapCut). `voz/voz-en-off.wav` es solo la pista de voz.

## Guion de voz en off (≈ 2,5 palabras por segundo, tono cercano y con energía)

| Tiempo | Escena en pantalla | Voz en off |
|---|---|---|
| 0:00–0:05 | ¿Sabías que…? + sentadilla | "¿Sabías que tu músculo empieza a desaparecer antes de lo que crees?" |
| 0:05–0:13 | Dato 1: 3–8 % por década. Una persona camina sobre las barras y se va apagando | "Desde los 30 años, si no entrenas fuerza, pierdes entre un 3 y un 8 % de tu masa muscular por década." |
| 0:13–0:22 | Dato 2: peso muerto + anillo de hasta -20 % | "La buena noticia: solo 30 a 60 minutos de fuerza a la semana se asocian a un 10 a 20 % menos de riesgo de muerte." |
| 0:22–0:33 | Dato 3: curl de bíceps que libera mioquinas hacia sus beneficios | "Y tu músculo funciona como un órgano: al contraerse libera mioquinas, que ayudan a bajar la inflamación, controlar la glucosa y cuidar tus huesos y tu cerebro." |
| 0:33–0:39 | Estocada, swing y remo + CTA | "Nunca es tarde para empezar. Entrena fuerza con tu kinesiólogo en StrongMed." |

## Fuentes
- Volpi E. et al., Curr Opin Clin Nutr Metab Care, 2004.
- Momma H. et al., Br J Sports Med, 2022 (metaanálisis).
- Pedersen BK & Febbraio MA, Nat Rev Endocrinol, 2012.

## Volver a generar
1. Imagen: edita `scene.html` y ejecuta `node render.js video` → `video_sin_audio.mp4` (requiere Playwright y ffmpeg).
2. Voz: edita `voz/guion.txt` (números escritos en palabras) y ejecuta `python3 voz/voz.py <modelo.onnx>` → `sabias-que-fuerza.mp4`.
   Requiere `pip install piper-tts` y el modelo `es_MX-ald-medium` de huggingface.co/rhasspy/piper-voices.
   Si cambias el largo de una frase, ajusta `OFFS` en `voz/voz.py` y los tiempos `S` en `scene.html`.

`node render.js stills` genera capturas de prueba.
