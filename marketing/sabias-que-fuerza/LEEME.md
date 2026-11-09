# Video "¿Sabías que…?" — Entrenamiento de fuerza

Formato vertical 1080×1920, ~34 s, 30 fps, con voz en off masculina en español (Chatterbox Multilingual, licencia MIT).
Las personas son el cuerpo 3D de la app (`js/sm-3d.js` + `modelos/cuerpo.glb`) haciendo los ejercicios de la biblioteca, con el músculo trabajado en verde.

- `sabias-que-fuerza.mp4`: video final con voz.
- `voz-en-off.srt`: subtítulos con tiempos (para Instagram o CapCut).
- `voz/voz-en-off.wav`: solo la pista de voz.

## Guion

| Escena | Voz en off |
|---|---|
| ¿Sabías que…? + sentadilla 3D | "¿Sabías que tu músculo empieza a desaparecer antes de lo que crees?" |
| Dato 1: 3–8 % por década. Caminata 3D que pierde color + barras por edad | "Desde los 30 años, si no entrenas fuerza, pierdes entre un 3 y un 8 % de tu masa muscular por década." |
| Dato 2: peso muerto 3D + anillo de hasta -20 % | "La buena noticia: solo 30 a 60 minutos de fuerza a la semana se asocian a un 10 a 20 % menos de riesgo de muerte." |
| Dato 3: curl de bíceps 3D que libera mioquinas hacia cada beneficio (aparecen cuando la voz los nombra) | "Y tu músculo funciona como un órgano: al contraerse libera mioquinas, que ayudan a bajar la inflamación, controlar la glucosa y cuidar tus huesos y tu cerebro." |
| Estocada, swing y remo en 3D + CTA | "Nunca es tarde para empezar. Empieza hoy a entrenar fuerza con tu kinesiólogo en StrongMed." |

## Fuentes
- Volpi E. et al., Curr Opin Clin Nutr Metab Care, 2004.
- Momma H. et al., Br J Sports Med, 2022 (metaanálisis).
- Pedersen BK & Febbraio MA, Nat Rev Endocrinol, 2012.


## Volver a generar
1. Voz: edita `voz/guion.txt` (números en palabras) y, en un entorno con `pip install chatterbox-tts faster-whisper librosa "setuptools<81"`:
   - `HF_HUB_DISABLE_XET=1 python voz/generar_tomas.py voz/guion.txt` → 3 tomas por frase en `cbout/`.
   - `HF_HUB_DISABLE_XET=1 python voz/elegir_tomas.py <carpeta>` → transcribe cada toma con Whisper, elige la que dice
     exactamente el guion, arma la pista y escribe `timing.json` (tiempos de escena sincronizados con la voz). Copia ese `timing.json` a `voz/`.
2. Imagen: `node render.js video <carpeta>` → `video_sin_audio.mp4` (requiere Playwright y ffmpeg; usa `voz/timing.json`).
3. Mezcla: `ffmpeg -i video_sin_audio.mp4 -i voz-en-off.wav -c:v copy -c:a aac -b:a 192k sabias-que-fuerza.mp4`.

`node render.js stills` genera capturas de prueba. Three.js se carga desde `marketing/vendor/` (copia local de three@0.147.0).
