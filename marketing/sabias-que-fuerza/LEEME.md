# Video "¿Sabías que…?" — Entrenamiento de fuerza

Formato vertical 1080×1920, 36 s, 30 fps. Las personas animadas son las mismas figuras de ejercicios de la app (`js/sm-anim.js`), con el músculo que trabaja resaltado en verde.

El video **no trae audio**: graba la voz en off con el guion de abajo (o usa la voz de texto a audio de CapCut o Instagram). Cada bloque calza con su escena.
`voz-en-off.srt` tiene el mismo texto con tiempos, para subtítulos o para importarlo en CapCut.

## Guion de voz en off (≈ 2,5 palabras por segundo, tono cercano y con energía)

| Tiempo | Escena en pantalla | Voz en off |
|---|---|---|
| 0:00–0:04 | ¿Sabías que…? + sentadilla | "¿Sabías que tu músculo empieza a desaparecer antes de lo que crees?" |
| 0:04–0:12 | Dato 1: 3–8 % por década. Una persona camina sobre las barras y se va apagando | "Desde los 30 años, si no entrenas fuerza, pierdes entre un 3 y un 8 % de tu masa muscular por década." |
| 0:12–0:21 | Dato 2: peso muerto + anillo de hasta -20 % | "La buena noticia: solo 30 a 60 minutos de fuerza a la semana se asocian a un 10 a 20 % menos de riesgo de muerte." |
| 0:21–0:30 | Dato 3: curl de bíceps que libera mioquinas hacia sus beneficios | "Y tu músculo funciona como un órgano: al contraerse libera mioquinas, que ayudan a bajar la inflamación, controlar la glucosa y cuidar tus huesos y tu cerebro." |
| 0:30–0:36 | Estocada, swing y remo + CTA | "Nunca es tarde para empezar. Entrena fuerza con tu kinesiólogo en StrongMed." |

## Fuentes
- Volpi E. et al., Curr Opin Clin Nutr Metab Care, 2004.
- Momma H. et al., Br J Sports Med, 2022 (metaanálisis).
- Pedersen BK & Febbraio MA, Nat Rev Endocrinol, 2012.

## Volver a generar
Edita `scene.html` y ejecuta `node render.js video` (requiere Playwright y ffmpeg); el resultado queda en `video_sin_audio.mp4`.
`node render.js stills` genera capturas de prueba.
