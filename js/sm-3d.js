/* =====================================================================
   StrongMed × Kin At Home — Visor 3D de ejercicios (Three.js)
   Usa las mismas plantillas de js/sm-anim.js: la pose de perfil se lleva a 3D
   (cada lado del cuerpo con su profundidad) y se dibuja un maniquí con volumen,
   sombras y los músculos trabajados en verde. Si no hay WebGL o no carga
   Three.js, queda la animación 2D.
   ===================================================================== */
(function (G) {
  'use strict';
  const A = G.SMAnim;
  if (!A) return;
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js';
  const GLTF_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js';
  // cuerpo 3D esculpido con esqueleto (CC0). Para cambiarlo, reemplazar el archivo y subir ?v=
  const MODEL_URL = 'modelos/cuerpo.glb?v=2';
  const FLOOR = A.FLOOR;
  const C = {
    bg: '#121417', floor: '#181b1f', grid: '#262b31', skin: '#cfd3d8', hl: '#bbf426', hl2: '#d4ec95',
    shorts: '#1b1f25', shoe: '#2a3038', metal: '#c3ccd6', plate: '#1d2228', pad: '#353d48', padDark: '#262c34',
    cable: '#8a96a6', band: '#ff6b8b', wood: '#c08a55', teal: '#2f6f73', ball: '#3b4655', rope: '#c9a46a', orange: '#f59e0b'
  };
  // profundidad (medio ancho) de cada lado del cuerpo en 3D
  const ZARM = 21, ZLEG = 8.4;
  const ARMK = ['S', 'el', 'wr', 'hd', 'tg'], LEGK = ['H', 'kn', 'an', 'to', 'he'];
  // el codo y la mano quedan un poco por fuera del hombro (brazo natural, sin atravesar el tronco)
  const ZW = { S: ZARM, el: ZARM + 1.5, wr: ZARM + 1, hd: ZARM + 1, tg: ZARM + 1 };
  const zOf = key => { const m = /^(S|el|wr|hd|tg|H|kn|an|to|he)([12])$/.exec(key || ''); if (!m) return 0; const w = ZW[m[1]] ?? ZLEG; return m[2] === '1' ? w : -w; };

  let loading = null;
  function loadThree() {
    if (G.THREE) return Promise.resolve(G.THREE);
    if (!loading) loading = new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = THREE_URL; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => { if (!G.THREE) return ko(new Error('three')); const l = document.createElement('script'); l.src = GLTF_URL; l.async = true; l.crossOrigin = 'anonymous'; l.onload = l.onerror = () => ok(G.THREE); document.head.appendChild(l); };
      s.onerror = () => { loading = null; ko(new Error('three')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();

  // ---------------------------------------------------------------- geometrías
  // superficie esculpida: sección elíptica según un perfil [t, adelante, atrás, lateral],
  // con relieves musculares (abultamientos suaves) y extremos redondeados.
  function profAt(prof, t) {
    let i = 0; while (i < prof.length - 2 && t > prof[i + 1][0]) i++;
    const a = prof[i], b = prof[i + 1], u = Math.min(1, Math.max(0, (t - a[0]) / ((b[0] - a[0]) || 1)));
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
  }
  const TAU = Math.PI * 2, PI = Math.PI;
  const angd = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
  // perfiles (radios en las mismas unidades del motor 2D)
  const PR = {
    torso: [[-0.22, 7, 8, 11], [-0.1, 7.5, 9, 12.5], [0.05, 7.4, 9.6, 12.8], [0.2, 6.8, 8, 11.6], [0.33, 6.2, 6.8, 10.4], [0.42, 5.6, 5.8, 8.5], [0.5, 6.6, 6.6, 10.5], [0.62, 8.2, 7.4, 12.2], [0.78, 9.4, 8.2, 14.5], [0.9, 8.6, 7.8, 16.2], [0.98, 7, 7, 15.6], [1.04, 5, 5.5, 12]],
    thigh: [[0, 7, 7, 7], [0.35, 7.8, 7.4, 7.2], [0.75, 6.2, 5.8, 5.9], [1, 5, 4.8, 5]],
    shin: [[0, 4.6, 4.8, 4.6], [0.3, 4.1, 5.2, 4.5], [0.7, 3, 3.3, 3.1], [0.92, 2.6, 2.7, 2.9], [1, 2.7, 2.8, 3]],
    upper: [[0, 5.2, 5.2, 5.4], [0.4, 4.8, 4.8, 4.5], [0.85, 3.8, 3.8, 3.9], [1, 3.5, 3.5, 3.8]],
    fore: [[0, 3.6, 3.6, 4], [0.3, 3.7, 3.6, 4], [0.85, 2.4, 2.3, 3], [1, 2.3, 2.2, 2.9]],
    neck: [[0, 4.2, 4.4, 5], [0.4, 3.7, 3.8, 4], [1, 3.4, 3.5, 3.6]],
    foot: [[0, 2.3, 2, 2.2], [0.3, 2.8, 2, 2.9], [0.72, 1.6, 1.3, 3.2], [1, 0.9, 0.9, 2.6]],
    palm: [[0, 2.6, 2.6, 1.5], [0.5, 3.2, 3.2, 1.7], [1, 3, 3, 1.5]],
    finger: [[0, 0.85, 0.85, 0.85], [1, 0.72, 0.72, 0.72]],
    hand: [[0, 2.1, 2.1, 2.9], [0.35, 2.4, 2.4, 3.5], [0.75, 2, 2, 3.2], [1, 1.4, 1.4, 2.6]],
    head: [[0, 6.2, 6.6, 6], [0.45, 7.4, 7.8, 6.9], [0.75, 7.4, 7.7, 6.9], [1, 6.6, 6.9, 6.2]]
  };
  // contextura atlética: [adelante/atrás, lateral]
  const BULK = { torso: [1.1, 1.18], thigh: [1.3, 1.25], shin: [1.25, 1.2], upper: [1.38, 1.3], fore: [1.28, 1.2], neck: [1.0, 1.05] };
  for (const k in PR) { const [d, l] = BULK[k] || [1, 1]; PR[k] = PR[k].map(r => [r[0], r[1] * d, r[2] * d, r[3] * l]); }
  // largo nominal (para redondear los extremos) y redondeo [inicio, fin]
  const LEN = { thigh: 40, shin: 40, upper: 26, fore: 24, neck: 10, hand: 9, foot: 17, head: 21, torso: 46, palm: 7, finger: 3 };
  const CAP = { thigh: [1, 1], shin: [1, 1], upper: [1, 1], fore: [1, 1], palm: [0.5, 0.6], finger: [0.8, 1], foot: [1, 1], head: [0.12, 1], neck: [0, 0], torso: [0, 0] };
  // relieves: [t, fi, ancho en t, ancho en fi, altura]. fi = 0 adelante, π atrás; fi > 0 = lado interno
  const sym = (t, f, wt, wp, a) => [[t, f, wt, wp, a], [t, -f, wt, wp, a]];
  const BUMPS = {
    torso: [...sym(0.77, 0.55, 0.1, 0.5, 0.2), ...sym(0.64, 0.6, 0.035, 0.5, -0.05), [0.76, 0, 0.14, 0.12, -0.06],
      ...[0.53, 0.6].flatMap(t => sym(t, 0.24, 0.04, 0.2, 0.04)),
      ...sym(0.25, 1.15, 0.14, 0.35, 0.04), ...sym(0.62, 1.75, 0.16, 0.4, 0.08),
      ...sym(1.0, 2.2, 0.07, 0.7, 0.2), [0.9, PI, 0.12, 0.6, 0.05], ...sym(0.8, 2.4, 0.08, 0.35, 0.06),
      ...sym(0.3, 2.92, 0.14, 0.16, 0.07), [0.5, PI, 0.45, 0.07, -0.04], ...sym(0.0, 2.6, 0.1, 0.5, 0.16), ...sym(0.08, 1.75, 0.09, 0.4, 0.05)],
    thigh: [[0.45, 0, 0.28, 0.8, 0.08], [0.8, 0.85, 0.12, 0.55, 0.14], [0.5, -1.25, 0.25, 0.6, 0.07], [0.45, PI, 0.28, 0.9, 0.07], [0.2, 1.57, 0.2, 0.6, 0.08], [0.97, 0, 0.06, 0.45, 0.1]],
    shin: [[0.27, 2.75, 0.14, 0.55, 0.22], [0.24, -2.75, 0.13, 0.5, 0.16], [0.3, -0.5, 0.2, 0.5, 0.05], [0.97, 1.57, 0.04, 0.35, 0.1], [0.99, -1.57, 0.04, 0.35, 0.08]],
    upper: [[0.5, 0, 0.22, 0.7, 0.16], [0.4, 2.64, 0.22, 0.6, 0.1], [0.3, -2.4, 0.2, 0.55, 0.12], [0.5, -1.57, 0.25, 0.8, 0.05]],
    fore: [[0.22, -0.9, 0.2, 0.6, 0.16], [0.25, 0.9, 0.2, 0.7, 0.1], [0.2, PI, 0.25, 0.8, 0.05]],
    neck: [...sym(0.5, 0.5, 0.3, 0.3, 0.06), [0.1, PI, 0.15, 1.0, 0.1]],
    foot: [[0.15, 0, 0.15, 0.6, 0.08], [0.6, 1.4, 0.2, 0.5, 0.06]],
    head: [[0.55, PI, 0.3, 1, 0.03]]
  };
  function sculptGeo(T, kind, inn, t0, t1, p0, p1, nt, np, off, caps) {
    const prof = PR[kind], bumps = BUMPS[kind] || [];
    const R = (t, ph) => {
      const r = profAt(prof, t), c = Math.cos(ph), s = Math.sin(ph);
      let k = 1;
      for (const b of bumps) { const dt = (t - b[0]) / b[2]; if (dt * dt > 9) continue; const dp = angd(ph, b[1] * inn) / b[3]; k += b[4] * Math.exp(-dt * dt - dp * dp); }
      return [(r[2] * k + off) * s, ((c >= 0 ? r[0] : r[1]) * k + off) * c];
    };
    // filas: [t del perfil, posición a lo largo, escala del redondeo]
    const rows = [], NC = 5, cp = Array.isArray(caps) ? caps : caps && CAP[kind] || [0, 0], L = LEN[kind] || 30;
    const capLen = t => { const r = profAt(prof, t); return (r[0] + r[1] + 2 * r[2]) / 4 / L; };
    if (cp[0]) for (let m = NC; m >= 1; m--) { const th = m / NC * PI / 2; rows.push([t0, t0 - capLen(t0) * cp[0] * Math.sin(th), Math.cos(th)]); }
    for (let i = 0; i <= nt; i++) { const t = t0 + (t1 - t0) * i / nt; rows.push([t, t, 1]); }
    if (cp[1]) for (let m = 1; m <= NC; m++) { const th = m / NC * PI / 2; rows.push([t1, t1 + capLen(t1) * cp[1] * Math.sin(th), Math.cos(th)]); }
    const pos = [], idx = [];
    for (const [t, y, sc] of rows) for (let j = 0; j <= np; j++) { const ph = p0 + (p1 - p0) * j / np, q = R(t, ph); pos.push(q[0] * sc, y, q[1] * sc); }
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < np; j++) { const a = i * (np + 1) + j, b = a + np + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    if (Math.abs(p1 - p0 - TAU) < 1e-3) {     // costura: promedia normales
      const n = g.attributes.normal;
      for (let i = 0; i < rows.length; i++) {
        const a = i * (np + 1), b = a + np;
        const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2, l = Math.hypot(x, y, z) || 1;
        n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
      }
    }
    return g;
  }
  // zonas musculares: [clave, t0, t1, fi0, fi1] (fi = 0 adelante, π atrás, fi > 0 lado interno)
  const ZONES = {
    torso: [['chest', 0.64, 0.98, -1.25, -0.07], ['chest', 0.64, 0.98, 0.07, 1.25], ['abs', 0.5, 0.63, -0.6, 0.6], ['abs', 0.12, 0.3, -0.6, 0.6],
      ['lats', 0.52, 0.9, 1.3, 2.35], ['lats', 0.52, 0.9, -2.35, -1.3], ['upperback', 0.76, 1.02, 2.25, 4.03],
      ['lowback', 0.1, 0.3, 2.5, 3.78], ['glutes', -0.14, 0.2, 2.0, 4.28]],
    thigh: [['quads', 0.22, 0.92, -1.2, 1.2], ['hams', 0.18, 0.9, 2.1, 4.18], ['hipflex', 0.02, 0.32, -0.75, 0.75], ['adductors', 0.08, 0.7, 0.87, 2.27]],
    shin: [['tib', 0.1, 0.75, -0.6, 0.9], ['calves', 0.08, 0.6, 2.2, 4.08]],
    upper: [['biceps', 0.25, 0.85, -0.9, 0.9], ['triceps', 0.15, 0.85, 2.2, 4.08]],
    fore: [['forearm', 0.04, 0.7, 0, TAU]],
    neck: [['neck', 0, 1, 0, TAU]]
  };

  // ---------------------------------------------------------------- escena
  function makeScene(T, el, P) {
    // mismas luces y colores que en versiones nuevas de Three.js
    if (T.ColorManagement && 'legacyMode' in T.ColorManagement) T.ColorManagement.legacyMode = false;
    const W = el.clientWidth || 320, H = el.clientHeight || 320;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(G.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    if ('physicallyCorrectLights' in renderer) renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace; else renderer.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene(); scene.background = new T.Color(C.bg);
    const cam = new T.PerspectiveCamera(32, W / H, 1, 6000);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a2f36, 0.85));
    const key = new T.DirectionalLight(0xffffff, 2.5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0008; key.shadow.normalBias = 0.6;
    scene.add(key); scene.add(key.target);
    const rim = new T.DirectionalLight(new T.Color(C.hl), 0.4); scene.add(rim);
    const fill = new T.DirectionalLight(0xbfd2ff, 0.35); scene.add(fill);
    // piso con grilla y brillo de la marca
    const floor = new T.Mesh(new T.CircleGeometry(1400, 64), new T.MeshBasicMaterial({ color: C.floor }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const shade = new T.Mesh(new T.CircleGeometry(1400, 64), new T.ShadowMaterial({ opacity: 0.5 }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = 0.1; shade.receiveShadow = true; scene.add(shade);
    const grid = new T.GridHelper(1600, 64, C.grid, C.grid); grid.position.y = 0.15; grid.material.transparent = true; grid.material.opacity = 0.4; scene.add(grid);
    scene.fog = new T.Fog(C.bg, 600, 1400);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(187,244,38,.13)'); gr.addColorStop(1, 'rgba(187,244,38,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    const glow = new T.Mesh(new T.CircleGeometry(1, 48), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.3; scene.add(glow);
    return { renderer, scene, cam, key, rim, fill, glow };
  }

  // ¿La figura 2D mira hacia la izquierda? En 2D no se nota, pero en 3D deja al cuerpo boca arriba
  // cuando debía ir boca abajo (o al revés). Se detecta por hacia dónde se doblan rodillas y codos:
  // en una figura bien orientada la rodilla se dobla hacia atrás y el codo hacia adelante.
  const FLIPS = {};
  function flipOf(name) {
    if (name in FLIPS) return FLIPS[name];
    let s = 0;
    const cr = (a, b, c) => { if (!a || !b || !c) return 0; const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]], l = Math.hypot(...u) * Math.hypot(...v) || 1, x = (u[0] * v[1] - u[1] * v[0]) / l; return Math.abs(x) > 0.15 ? x : 0; };
    try {
      for (let i = 0; i < 12; i++) {
        const R = A.pose3(name, i / 12); if (!R || R.custom || R.front) { FLIPS[name] = 1; return 1; }
        const J = R.J;
        for (const k of [1, 2]) { s += cr(J['H' + k] || J.hip, J['kn' + k], J['an' + k]); s -= 0.6 * cr(J['S' + k], J['el' + k], J['wr' + k]); }
      }
    } catch (e) { }
    return (FLIPS[name] = s < -1.2 ? -1 : 1);
  }

  // ---------------------------------------------------------------- reproductor 3D
  function start3D(T, P) {
    const el = P.el, tpl0 = A.tpl(P.tplName);
    const first = A.pose3(P.tplName, 0);
    if (first.custom) return false;
    const front = first.front, cx = first.cx;
    const LAT = front ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0);
    // lift3: sube todo (cuerpo e implementos) sin despegar del suelo lo que está apoyado en él (p. ej. una barra alta)
    const LIFT = tpl0.lift3 || 0, yOf = y => FLOOR - y + (LIFT && y < FLOOR - 0.5 ? LIFT : 0);
    const V2 = (p, z) => front ? new T.Vector3(p[0] - cx, yOf(p[1]), z || 0) : new T.Vector3(-(z || 0), yOf(p[1]), p[0] - cx);
    const D2 = v => front ? new T.Vector3(v[0], -v[1], 0) : new T.Vector3(0, -v[1], v[0]);   // dirección 2D → 3D
    const FWD = new T.Vector3(0, 0, 1);

    const wrap = document.createElement('div'); wrap.className = 'sm3d';
    wrap.style.cssText = 'position:absolute;inset:0;touch-action:pan-y;cursor:grab';
    const S = makeScene(T, el, P);
    S.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    wrap.appendChild(S.renderer.domElement);
    const Ms = A.muscleSet(P.hl);

    // materiales
    const std = (c, r, m, e) => new T.MeshStandardMaterial({ color: c, roughness: r ?? 0.6, metalness: m ?? 0.05, emissive: e ? new T.Color(e) : 0x000000, emissiveIntensity: e ? 0.22 : 0 });
    const MAT = {
      skin: std(C.skin, 0.48, 0), hl: std(C.hl, 0.5, 0.02, C.hl), hl2: std(C.hl2, 0.55, 0.02), shorts: std(C.shorts, 0.8, 0), shoe: std(C.shoe, 0.7, 0), sole: std(C.hl, 0.6, 0, C.hl),
      metal: std(C.metal, 0.3, 0.85), plate: std(C.plate, 0.55, 0.3), pad: std(C.pad, 0.75, 0.05), padDark: std(C.padDark, 0.7, 0.2), cable: std(C.cable, 0.5, 0.5),
      band: std(C.band, 0.6, 0), wood: std(C.wood, 0.7, 0), teal: std(C.teal, 0.7, 0), ball: std(C.ball, 0.6, 0.05), rope: std(C.rope, 0.85, 0), orange: std(C.orange, 0.6, 0)
    };
    MAT.wall = std(C.padDark, 0.8, 0.1); MAT.wall.transparent = true; MAT.wall.opacity = 0.55; MAT.wall.depthWrite = false;
    const body = new T.Group(), props = new T.Group(); S.scene.add(body); S.scene.add(props);
    const mesh = (g, m, parent) => { const o = new T.Mesh(g, typeof m === 'string' ? MAT[m] : m); o.matrixAutoUpdate = false; o.castShadow = true; o.receiveShadow = true; (parent || body).add(o); return o; };
    const hlMat = k => Ms[k] ? (Ms[k] < 1 ? MAT.hl2 : MAT.hl) : null;

    // segmento con volumen + zonas musculares iluminadas
    const GEO = {}; const geo = (name, f) => GEO[name] || (GEO[name] = f());
    // inn: +1 / -1 indica hacia qué lado (local) queda la cara interna de cada brazo y pierna
    // pieza con volumen + zonas musculares iluminadas
    function part(kind, inn, t0, t1, o) {
      o = o || {};
      const RES = { torso: [24, 44], head: [26, 36], finger: [3, 10], palm: [6, 16] }[kind] || [20, 32];
      const list = [mesh(geo(kind + inn + t0, () => sculptGeo(T, kind, inn, t0, t1, 0, TAU, RES[0], RES[1], o.off || 0, o.caps ?? true)), 'skin')];
      if (o.zones !== false) (ZONES[kind] || []).forEach(z0 => {
        const m = hlMat(z0[0]); if (!m) return;
        const z = kind === 'torso' ? z0 : [z0[0], Math.max(z0[1], t0 + 0.02), Math.min(z0[2], t1 - 0.02), z0[3], z0[4]]; if (z[2] - z[1] < 0.05) return;
        const fm = (z[1] + z[2]) / 2, off = kind === 'torso' ? (fm > 0.25 && fm < 0.6 ? -0.15 : 0.4) : 0.35;
        const p0 = inn > 0 ? z[3] : -z[4], p1 = inn > 0 ? z[4] : -z[3];
        list.push(mesh(sculptGeo(T, kind, inn, z[1], z[2], p0, p1, 12, 16, off, false), m));
      });
      return list;
    }
    const sphG = new T.SphereGeometry(1, 28, 20);
    const inner = i => (front ? (i === 1 ? 1 : -1) : (i === 1 ? -1 : 1));
    // maniquí articulado musculoso: piezas separadas unidas por esferas (como un maniquí de madera)
    const BP = {
      torso: [...part('torso', 1, 0.5, 1.02, { caps: [0.5, 0.9], zones: true }), ...part('torso', 1, -0.2, 0.32, { caps: [0.6, 0.5], zones: false })],
      neck: mesh(sphG, 'skin'), waist: mesh(sphG, hlMat('abs') || 'skin'), head: part('head', 1, 0, 1)
    };    // dedos de la mano cerrada o relajada
    const FING = [[3.2, 2.6], [3.5, 2.8], [3.3, 2.6], [2.6, 2.1]];
    const holds = (tpl0.props || []).some(o => /^(barbell|db|kb|cable|handle|plate|landmine|stick|rope|sled|crutch|chain|pullbar|hbar|rails|yoke|bike|rower)$/.test(o.type));
    for (const i of [1, 2]) {
      const s = inner(i);
      BP['th' + i] = part('thigh', s, 0.16, 0.88); BP['sh' + i] = part('shin', s, 0.1, 0.92);
      BP['ua' + i] = part('upper', s, 0.2, 0.86); BP['fa' + i] = part('fore', s, 0.14, 0.9);
      BP['sb' + i] = mesh(sphG, hlMat('delts') || 'skin'); BP['hb' + i] = mesh(sphG, 'skin');
      BP['ft' + i] = part('foot', 1, 0, 1); BP['pm' + i] = part('palm', s, 0, 1);
      BP['fg' + i] = Array.from({ length: 10 }, () => mesh(geo('finger', () => sculptGeo(T, 'finger', 1, 0, 1, 0, TAU, 3, 10, 0, true)), 'skin'));
      BP['kn' + i] = mesh(sphG, 'skin'); BP['an' + i] = mesh(sphG, 'skin'); BP['el' + i] = mesh(sphG, 'skin'); BP['wr' + i] = mesh(sphG, 'skin');
    }    const tmpX = new T.Vector3(), tmpY = new T.Vector3(), tmpZ = new T.Vector3();
    function frame(o, A3, yv, len, zh, sx, sz) {   // ubica un segmento: eje y a lo largo, z hacia "adelante"
      tmpY.copy(yv).normalize();
      tmpZ.copy(zh).addScaledVector(tmpY, -zh.dot(tmpY));
      if (tmpZ.lengthSq() < 1e-6) { tmpZ.set(tmpY.y, -tmpY.x, 0); if (tmpZ.lengthSq() < 1e-6) tmpZ.set(1, 0, 0); }
      tmpZ.normalize(); tmpX.crossVectors(tmpY, tmpZ);
      const list = Array.isArray(o) ? o : [o];
      for (const m of list) { m.matrix.makeBasis(tmpX.clone().multiplyScalar(sx || 1), tmpY.clone().multiplyScalar(len), tmpZ.clone().multiplyScalar(sz || sx || 1)).setPosition(A3); m.matrixWorldNeedsUpdate = true; }
    }
    function ball(o, c, rx, ry, rz) { o.matrix.makeScale(rx, ry ?? rx, rz ?? rx).setPosition(c); o.matrixWorldNeedsUpdate = true; }
    function ell(o, c, yv, zh, rx, ry, rz) { frame(o, c, yv, ry, zh, rx, rz); }
    const seg = (o, a, b, zh) => { const d = b.clone().sub(a), l = d.length() || 0.01; frame(o, a, d, l, zh); return d; };
    let FL = flipOf(P.tplName);     // -1: la figura 2D mira a la izquierda → en 3D se gira 180° sobre el eje del tronco
    const antOf = (a2, b2) => { if (front) return FWD; const u = [b2[0] - a2[0], b2[1] - a2[1]], l = Math.hypot(u[0], u[1]) || 1; return D2([FL * u[1] / l, -FL * u[0] / l]); };
    // pie: dirección de la punta y empeine (si la figura está girada, la punta se refleja respecto de la canilla)
    function footDir(J, i) {
      let u = [J['to' + i][0] - J['an' + i][0], J['to' + i][1] - J['an' + i][1]];
      if (FL < 0) { const a = [J['an' + i][0] - J['kn' + i][0], J['an' + i][1] - J['kn' + i][1]], la = Math.hypot(...a) || 1; a[0] /= la; a[1] /= la; const d = u[0] * a[0] + u[1] * a[1]; u = [2 * d * a[0] - u[0], 2 * d * a[1] - u[1]]; }
      const l = Math.hypot(...u) || 1;
      return { to: D2([u[0] / l, u[1] / l]), up: D2([FL * u[1] / l, -FL * u[0] / l]), len: l };
    }

    // ajusta la pose 2D → puntos 3D
    function joints(J) {
      if (FL < 0) J = Object.assign({}, J, { n: [-J.n[0], -J.n[1]] });
      if (front) {        // vista frontal: brazos un poco hacia afuera para que no atraviesen el tronco
        J = Object.assign({}, J);
        for (const i of [1, 2]) { const sg = Math.sign(J['S' + i][0] - J.shc[0]) || (i === 1 ? 1 : -1); for (const k of ARMK) if (J[k + i]) J[k + i] = [J[k + i][0] + sg * 6.5, J[k + i][1]]; }
      }
      return J;
    }
    // agarre de barra: manos más abiertas que los hombros y codo recalculado en 3D
    const GRIP = 27; let OV = {};
    const zk = key => OV[key + 'z'] ?? (front ? 0 : zOf(key));
    const PT = (J, key) => OV[key] ? OV[key].clone() : V2(J[key], zk(key));
    const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // vista frontal: lo que en 2D se dibujó acortado (brazo hacia adelante, muslo de alguien sentado, tronco
    // inclinado) se convierte en profundidad real hacia la cámara
    const dep = (a, b, L) => { if (!a || !b) return 0; const l = d2(a, b); return l < L * 0.96 ? Math.sqrt(L * L - l * l) : 0; };
    function frontDepth(J) {
      const L = A.L, zt = dep(J.hip, J.shc, L.torso) * (J.p && J.p.recl ? -1 : 1);
      for (const k of ['shc', 'neck', 'head']) OV[k + 'z'] = zt;
      for (const i of [1, 2]) {
        const ze = zt + dep(J['S' + i], J['el' + i], L.ua), zw = ze + dep(J['el' + i], J['wr' + i], L.fa);
        OV['S' + i + 'z'] = zt; OV['el' + i + 'z'] = ze; for (const k of ['wr', 'hd', 'tg']) OV[k + i + 'z'] = zw;
        const zn = dep(J['H' + i] || J.hip, J['kn' + i], L.th), ds = dep(J['kn' + i], J['an' + i], L.sh);
        // canilla acortada: con el pie en el suelo va hacia atrás (sentadilla); con el pie en el aire, hacia adelante
        const za = J['an' + i] && J['an' + i][1] < FLOOR - 10 ? zn + ds : Math.max(0, zn - ds);
        OV['kn' + i + 'z'] = zn; for (const k of ['an', 'to', 'he']) OV[k + i + 'z'] = za;
      }
    }
    // vista lateral: un brazo o una pierna dibujados más cortos (escorzo) van hacia el costado (abducción:
    // aperturas, codos abiertos en press con mancuernas, manos en los hombros); se recupera esa profundidad hacia afuera
    function sideDepth(J) {
      const L = A.L;
      for (const i of [1, 2]) {
        const sg = i === 1 ? 1 : -1, de = dep(J['S' + i], J['el' + i], L.ua), dw = dep(J['el' + i], J['wr' + i], L.fa);
        // p.fi: el antebrazo acortado va hacia adentro (manos junto a la cabeza con codos abiertos, p. ej. face pull)
        if (de || dw) { const ze = sg * (ZW.el + de), zw = ze + sg * dw * (J.p && J.p.fi ? -1 : 1); OV['el' + i + 'z'] = ze; for (const k of ['wr', 'hd', 'tg']) OV[k + i + 'z'] = zw; }
        const dk = dep(J['H' + i] || J.hip, J['kn' + i], L.th), da = dep(J['kn' + i], J['an' + i], L.sh);
        if (dk || da) { const zn = sg * (ZLEG + dk), za = zn + sg * da; OV['kn' + i + 'z'] = zn; for (const k of ['an', 'to', 'he']) OV[k + i + 'z'] = za; }
      }
    }
    function gripFix(J, tpl) {
      OV = {};
      if (front) { frontDepth(J); return; }
      sideDepth(J);
      // barra o implemento tomado con las dos manos a un ancho dado (grip: landmine con ambas manos en la punta)
      const bb = (tpl.props || []).find(o => o.type === 'barbell' || o.grip !== undefined); if (!bb) return;
      let bp; try { bp = A.at(J, bb.at || 'wr1'); } catch (e) { return; }
      if (!bp) return;
      for (const i of [1, 2]) {
        const w = J['wr' + i], s2 = J['S' + i], e2 = J['el' + i];
        if (!w || d2(w, bp) > 16) continue;
        const sg = i === 1 ? 1 : -1, z = sg * (bb.grip || GRIP);
        for (const k of ['wr', 'hd', 'tg']) OV[k + i + 'z'] = z;
        const S = V2(s2, sg * ZARM), Wt = V2(w, z), l1 = d2(s2, e2), l2 = d2(e2, w);
        const ax = Wt.clone().sub(S); let d = ax.length() || 0.01; ax.normalize(); d = Math.min(d, l1 + l2 - 0.1);
        const a = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
        const out = new T.Vector3(-sg, 0, 0);
        // mano detrás del hombro (barra en la espalda): codo hacia abajo y atrás; si no, como en la animación 2D
        const behind = (w[0] - s2[0]) * J.n[0] + (w[1] - s2[1]) * J.n[1] < 0;
        const pole = behind ? new T.Vector3(0, -1, 0).addScaledVector(D2(J.n), -0.45).addScaledVector(out, 0.5)
          : V2(e2, sg * ZARM).sub(S.clone().add(Wt).multiplyScalar(0.5)).addScaledVector(out, 0.25 * l1);
        pole.addScaledVector(ax, -pole.dot(ax)); if (pole.lengthSq() < 1e-6) pole.copy(out); pole.normalize();
        OV['el' + i] = S.clone().addScaledVector(ax, a).addScaledVector(pole, h);
      }
    }

    function poseBody(J) {
      const hip = V2(J.hip, 0), shc = V2(J.shc, 0), up = shc.clone().sub(hip), Lt = up.length();
      const tf = front ? FWD : D2(J.n);
      frame(BP.torso, hip, up, Lt, tf);
      // cuello y cabeza
      const hd = V2(J.head, 0), nk = V2(J.neck, 0), hu = hd.clone().sub(nk).normalize();
      const nA = shc.clone().addScaledVector(up.clone().normalize(), -2), nB = nk.clone().addScaledVector(hu, 3);
      ball(BP.neck, nk.clone().addScaledVector(hu, -1), 4.8);
      ell(BP.waist, hip.clone().addScaledVector(up, 0.415), up, tf, 10.5, 5.6, 7.2);
      const hf = tf.clone().addScaledVector(hu, -tf.dot(hu)).normalize();
      frame(BP.head, nk.clone().addScaledVector(hu, 3.2).addScaledVector(hf, 0.6), hu, 18.5, hf);
      for (const i of [1, 2]) {
        const H = PT(J, 'H' + i), K = PT(J, 'kn' + i), An = PT(J, 'an' + i);
        const H2 = J['H' + i] || J.hip;
        seg(BP['th' + i], H, K, antOf(H2, J['kn' + i]));
        seg(BP['sh' + i], K, An, antOf(J['kn' + i], J['an' + i]));
        ball(BP['kn' + i], K, 5.4); ball(BP['an' + i], An, 3.3); ball(BP['hb' + i], H, 7.6);
        // pie (zapatilla)
        let he, to, fu;
        if (front) { he = An.clone().add(new T.Vector3(0, -2.4, -3.5)); to = An.clone().add(new T.Vector3((i === 1 ? 1 : -1) * 1.5, -2.4, 13)); fu = new T.Vector3(0, 1, 0); }
        else { he = PT(J, 'he' + i); to = PT(J, 'to' + i); const u = [J['to' + i][0] - J['he' + i][0], J['to' + i][1] - J['he' + i][1]], l = Math.hypot(...u) || 1; fu = D2([u[1] / l, -u[0] / l]); he.addScaledVector(fu, -1.6); to.addScaledVector(fu, -1.6); }
        seg(BP['ft' + i], he, to, fu);
        // brazo
        // el brazo nace un poco bajo el borde del hombro, así el tronco lo cubre (trapecio)
        const Sh = PT(J, 'S' + i).addScaledVector(up, -3.2 / (Lt || 1)), E = PT(J, 'el' + i), W = PT(J, 'wr' + i), Hd = PT(J, 'hd' + i);
        const ua = antOf(J['S' + i], J['el' + i]), fa = antOf(J['el' + i], J['wr' + i]);
        seg(BP['ua' + i], Sh, E, ua); seg(BP['fa' + i], E, W, fa);
        const hv = Hd.clone().sub(W); if (hv.lengthSq() < 1) hv.copy(E).sub(W).multiplyScalar(-1);
        // mano: palma + cuatro dedos y pulgar (cerrados si sostiene algo)
        const hy = hv.clone().normalize(), hz = fa.clone().addScaledVector(hy, -fa.dot(hy));
        if (hz.lengthSq() < 1e-6) hz.set(0, 1, 0); hz.normalize();
        const pn = new T.Vector3().crossVectors(hy, hz).multiplyScalar(inner(i));
        frame(BP['pm' + i], W.clone().addScaledVector(hy, 0.6), hy, 7, hz);
        const F = BP['fg' + i], PE = W.clone().addScaledVector(hy, 7.4), c1 = (holds ? 72 : 18) * Math.PI / 180, c2 = (holds ? 165 : 45) * Math.PI / 180;
        const dirc = c => hy.clone().multiplyScalar(Math.cos(c)).addScaledVector(pn, Math.sin(c));
        FING.forEach(([l1, l2], k) => {
          const b = PE.clone().addScaledVector(hz, 2.2 - k * 1.45).addScaledVector(hy, k === 3 ? -0.6 : 0).addScaledVector(pn, 0.3);
          const p1 = b.clone().addScaledVector(dirc(c1), l1), p2 = p1.clone().addScaledVector(dirc(c2), l2);
          seg(F[k * 2], b, p1, hz); seg(F[k * 2 + 1], p1, p2, hz);
        });
        const tb = W.clone().addScaledVector(hy, 2.4).addScaledVector(hz, 2.6).addScaledVector(pn, 0.6);
        const td = hy.clone().multiplyScalar(0.6).addScaledVector(hz, 0.55).addScaledVector(pn, holds ? 0.8 : 0.25).normalize();
        const t1 = tb.clone().addScaledVector(td, 3), t2 = t1.clone().addScaledVector(td.clone().addScaledVector(pn, 0.9).normalize(), 2.4);
        seg(F[8], tb, t1, hz); seg(F[9], t1, t2, hz);
        ball(BP['wr' + i], W, 3);
        ball(BP['el' + i], E, 4.6); ball(BP['sb' + i], Sh, 7.6);
      }
    }

    // ---- cuerpo esculpido (modelo 3D con esqueleto): si carga, reemplaza al maniquí hecho con piezas
    // Cada hueso se orienta hacia el punto de la animación (cadera → hombros, hombro → codo, etc.).
    // Sirve con esqueletos tipo Rigify, MakeHuman "game engine", Unreal o Mixamo.
    const MODEL = { ok: false }; let MODEL_CURL = G.SM3D_CURL || 1;
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const SIDE = (l, r) => ({ L: l, R: r });
    const ROLE_NAMES = {
      hips: ['hips', 'mixamorighips', 'pelvis', 'spine'], spine1: ['spine001', 'spine01', 'mixamorigspine', 'spine'], spine2: ['spine002', 'spine02', 'spine1', 'mixamorigspine1'],
      spine3: ['spine003', 'spine03', 'spine2', 'mixamorigspine2'], neck: ['spine004', 'neck01', 'neck', 'mixamorigneck'], head: ['spine005', 'head', 'mixamorighead'],
      upper: SIDE(['upperarml', 'upperarmL', 'leftarm', 'mixamorigleftarm'], ['upperarmr', 'rightarm', 'mixamorigrightarm']),
      fore: SIDE(['forearml', 'lowerarml', 'leftforearm', 'mixamorigleftforearm'], ['forearmr', 'lowerarmr', 'rightforearm', 'mixamorigrightforearm']),
      hand: SIDE(['handl', 'lefthand', 'mixamoriglefthand'], ['handr', 'righthand', 'mixamorigrighthand']),
      thigh: SIDE(['thighl', 'leftupleg', 'mixamorigleftupleg'], ['thighr', 'rightupleg', 'mixamorigrightupleg']),
      shin: SIDE(['shinl', 'calfl', 'leftleg', 'mixamorigleftleg'], ['shinr', 'calfr', 'rightleg', 'mixamorigrightleg']),
      foot: SIDE(['footl', 'leftfoot', 'mixamorigleftfoot'], ['footr', 'rightfoot', 'mixamorigrightfoot'])
    };
    const V3 = T.Vector3, Q = T.Quaternion, M4 = new T.Matrix4();
    function basisQ(d, u, out) {
      const y = d.clone().normalize(), z = u.clone().addScaledVector(y, -u.dot(y));
      if (z.lengthSq() < 1e-8) { z.set(y.y, -y.x, 0); if (z.lengthSq() < 1e-8) z.set(0, 0, 1); }
      z.normalize(); const x = new V3().crossVectors(y, z);
      M4.makeBasis(x, y, z); return (out || new Q()).setFromRotationMatrix(M4);
    }
    // contextura fit: infla suavemente hombros, pecho, espalda, brazos y piernas y afina la cintura
    // (cm a lo largo de la normal, según hueso, posición a lo largo del hueso y lado: adelante/atrás/afuera)
    const cl = x => x < 0 ? 0 : x > 1 ? 1 : x, bell = (x, c, w) => { const z = (x - c) / w; return Math.exp(-z * z); };
    const FIT = {
      upperarm: (t, f, l) => 0.35 + 1.1 * bell(t, 0.1, 0.22) * cl(0.4 + l) + 0.8 * bell(t, 0.55, 0.22) * cl(f) + 0.8 * bell(t, 0.42, 0.28) * cl(-f),
      lowerarm: t => 0.12 + 0.5 * bell(t, 0.2, 0.28),
      clavicle: (t, f, l, u) => 0.7 * cl(u) * bell(t, 0.5, 0.6) + 0.9 * bell(t, 1.05, 0.3),
      spine_03: (t, f, l, u, ax) => 1.5 * cl(f) * bell(ax, 0.45, 0.35) * bell(t, 0.25, 0.35) + 1.2 * bell(ax, 0.9, 0.25) * cl(0.5 - f) * bell(t, 0.2, 0.45) + 0.6 * cl(-f) * bell(t, 0.4, 0.4),
      spine_02: (t, f, l, u, ax) => 0.8 * bell(ax, 0.85, 0.3) * cl(0.4 - f) + 0.15 * cl(f),
      spine_01: (t, f, l, u, ax) => -0.75 * bell(ax, 1, 0.4),
      pelvis: (t, f, l, u, ax) => 0.6 * cl(-f) * bell(ax, 0.45, 0.4) * bell(t, -0.4, 0.6),
      thigh: (t, f, l) => 0.45 * bell(t, 0.5, 0.3) * cl(0.4 + f - 0.6 * l) - 0.3 * cl(l) * bell(t, 0.2, 0.25) + 0.5 * cl(f) * bell(t, 0.6, 0.28) + 0.3 * cl(-f) * bell(t, 0.4, 0.3),
      calf: (t, f) => 0.85 * cl(-f) * bell(t, 0.25, 0.18) + 0.2 * bell(t, 0.3, 0.3),
      neck: (t, f) => 0.45 * cl(0.3 - f) * bell(t, 0, 0.7)
    };
    function fitBody(mesh, fwd, left, k) {
      const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      if (!nor || !si || !sw) return;
      const bones = mesh.skeleton.bones, ix = new Map(bones.map((b, i) => [b, i]));
      const P = mesh.skeleton.boneInverses.map(m => new V3().setFromMatrixPosition(m.clone().invert()));
      const info = bones.map((b, i) => {
        const n = b.name.toLowerCase(), side = /_l$/.test(n) ? 1 : /_r$/.test(n) ? -1 : 0, base = n.replace(/_[lr]$/, '');
        const fn = FIT[base] || FIT[base.replace(/_0\d$/, '')]; if (!fn) return null;
        const c = b.children.find(c => ix.has(c) && !/thumb|index|pinky|ring|middle|ball/.test(c.name)) || b.children.find(c => ix.has(c));
        const d = c ? P[ix.get(c)].clone().sub(P[i]) : new V3(0, 0.1, 0), len = d.length(); d.normalize();
        return { fn, side, d, len, p: P[i] };
      });
      if (!info.some(Boolean)) return;
      const v = new V3(), rel = new V3(), n = new V3(), gc = (at, i, c) => c === 0 ? at.getX(i) : c === 1 ? at.getY(i) : c === 2 ? at.getZ(i) : at.getW(i);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i); let a = 0;
        for (let c = 0; c < 4; c++) {
          const w = gc(sw, i, c); if (w < 1e-3) continue;
          const I = info[gc(si, i, c)]; if (!I) continue;
          rel.copy(v).sub(I.p); const along = rel.dot(I.d), t = along / (I.len || 0.1); rel.addScaledVector(I.d, -along);
          const rl = rel.length() || 1, f = rel.dot(fwd) / rl, x = rel.dot(left) / rl;
          a += w * I.fn(t, f, I.side ? x * I.side : Math.abs(x), rel.y / rl, Math.abs(x));
        }
        if (a) { n.fromBufferAttribute(nor, i); v.addScaledVector(n, a * 0.01 * k); pos.setXYZ(i, v.x, v.y, v.z); }
      }
      g.computeVertexNormals(); g.computeBoundingSphere();
    }
    function setupModel(gltf) {
      const root = gltf.scene; let skinned = null;
      root.traverse(o => { if (o.isSkinnedMesh && !skinned) skinned = o; });
      if (!skinned) return false;
      const bones = skinned.skeleton.bones, byName = new Map(bones.map(b => [norm(b.name), b]));
      const find = list => { for (const n of list) { const b = byName.get(norm(n)); if (b) return b; } return null; };
      const R = {};
      for (const k in ROLE_NAMES) { const v = ROLE_NAMES[k]; if (Array.isArray(v)) R[k] = find(v); else { R[k + 'L'] = find(v.L); R[k + 'R'] = find(v.R); } }
      if (!R.hips || !R.upperL || !R.upperR || !R.thighL || !R.thighR || !R.shinL || !R.foreL) return false;
      root.updateMatrixWorld(true);
      const wp = b => b.getWorldPosition(new V3()), wq = b => b.getWorldQuaternion(new Q());
      // orientación del personaje en reposo
      const left = wp(R.upperL).sub(wp(R.upperR)).normalize(), upW = new V3(0, 1, 0), fwd = new V3().crossVectors(left, upW).normalize();
      const legLen = wp(R.thighL).distanceTo(wp(R.shinL)) + wp(R.shinL).distanceTo(wp(R.footL || R.shinL));
      const scale = 80 / (legLen || 1);
      // dirección de reposo de cada hueso: hacia el siguiente hueso de la cadena (o su eje Y)
      const next = { hips: 'spine1', spine1: 'spine2', spine2: 'spine3', spine3: 'neck', neck: 'head' };
      for (const s of ['L', 'R']) Object.assign(next, { ['upper' + s]: 'fore' + s, ['fore' + s]: 'hand' + s, ['thigh' + s]: 'shin' + s, ['shin' + s]: 'foot' + s });
      const rest = {};
      for (const k in R) {
        const b = R[k]; if (!b) continue;
        const q = wq(b), n = next[k] && R[next[k]];
        let d = n ? wp(n).sub(wp(b)) : new V3(0, 1, 0).applyQuaternion(q);
        if (k === 'hips' && R.spine1 && R.spine3) d = wp(R.spine3).sub(wp(b));
        d.normalize();
        const u = /^foot/.test(k) ? upW.clone() : fwd.clone();
        rest[k] = { q, d, u, len: n ? wp(n).distanceTo(wp(b)) : 0.15 };
      }
      // manos: línea de nudillos (índice → meñique) en reposo, para girar el puño según el implemento
      const fing = {};
      for (const s of ['L', 'R']) {
        const ls = s.toLowerCase(), list = [];
        for (const f of ['index', 'middle', 'ring', 'pinky']) for (const n of [1, 2, 3]) { const b = byName.get(f + '0' + n + ls); if (b) list.push(b); }
        fing[s] = list;
        const i1 = byName.get('index01' + ls), p1 = byName.get('pinky01' + ls);
        if (rest['hand' + s] && i1 && p1) rest['hand' + s].k = wp(p1).sub(wp(i1)).normalize();
      }
      fitBody(skinned, fwd, left, 1.6 * (legLen || 0.8) / 0.8);
      // colores por músculo: cada vértice toma el músculo según su hueso principal y su posición
      const g = skinned.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const roleOf = new Map(); for (const k in R) if (R[k]) roleOf.set(R[k], k);
      const roleUp = b => { while (b) { if (roleOf.has(b)) return roleOf.get(b); b = b.parent; } return null; };
      const boneRole = bones.map(b => {
        const r = roleOf.get(b); if (r) return r;
        const n = norm(b.name);
        if (/shoulder|clavicle/.test(n)) return 'shoulder' + (/l$|left/.test(n) ? 'L' : 'R');
        if (/pelvis/.test(n)) return 'hips';
        return roleUp(b);
      });
      const col = new Float32Array(pos.count * 3), sk = new T.Color(C.skin), hl1 = new T.Color(C.hl), hl2c = new T.Color(C.hl2);
      const v = new V3(), hipH = wp(R.hips);
      skinned.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i++) {
        let bi = 0, bw = -1; const gc = (at, c) => c === 0 ? at.getX(i) : c === 1 ? at.getY(i) : c === 2 ? at.getZ(i) : at.getW(i);
        for (let c = 0; c < 4; c++) { const w = gc(sw, c); if (w > bw) { bw = w; bi = gc(si, c); } }
        const role = boneRole[bi] || '', base = role.replace(/[LR]$/, ''), side = role.endsWith('L') ? 1 : -1;
        v.fromBufferAttribute(pos, i).applyMatrix4(skinned.matrixWorld);
        let mus = null;
        const rr = rest[role] || { d: upW, len: 0.15 }, b = R[role] || bones[bi];
        if (b) {
          const rel = v.clone().sub(wp(b)), t = rel.dot(rr.d) / (rr.len || 0.1), fr = rel.dot(fwd), lat = rel.dot(left) * side;
          if (base === 'thigh') mus = t < 0.15 && fr < 0 ? 'glutes' : fr > 0.01 ? (t < 0.3 ? 'hipflex' : 'quads') : lat < -0.01 && Math.abs(fr) < 0.04 ? 'adductors' : 'hams';
          else if (base === 'shin') mus = fr < 0 ? 'calves' : 'tib';
          else if (base === 'upper') mus = t < 0.28 ? 'delts' : fr > 0 ? 'biceps' : 'triceps';
          else if (base === 'fore' || base === 'hand') mus = base === 'fore' ? 'forearm' : null;
          else if (base === 'shoulder') mus = lat > 0.04 ? 'delts' : 'upperback';
          else if (base === 'neck' || base === 'head') mus = base === 'neck' ? 'neck' : null;
          else if (base === 'hips' || base === 'spine1') mus = fr > 0 ? (v.y > hipH.y ? 'abs' : 'hipflex') : (v.y < hipH.y + 0.04 ? 'glutes' : 'lowback');
          else if (base === 'spine2') mus = fr > 0 ? 'abs' : (Math.abs(rel.dot(left)) > 0.08 ? 'lats' : 'lowback');
          else if (base === 'spine3') mus = fr > 0 ? (t > 0.15 ? 'chest' : 'abs') : (Math.abs(rel.dot(left)) > 0.07 ? 'lats' : 'upperback');
        }
        const lv = mus && Ms[mus], c = lv ? (lv < 1 ? hl2c : hl1) : sk;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      root.traverse(o => { if (o.isMesh) { o.material = new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0 }); o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      const grp = new T.Group(); grp.add(root); grp.scale.setScalar(scale); S.scene.add(grp);
      // dedos: cerrados sobre el implemento si el ejercicio usa barra, mancuerna, polea…; si no, un poco flexionados
      const FCURL = holds ? 1.25 : 0.25;
      for (const b of bones) {
        const n = norm(b.name); if (!/finger|^f(index|middle|ring|pinky)|index|middle|ring|pinky|thumb/.test(n)) continue;
        const th = /thumb/.test(n) ? 0.45 : 1;
        b.quaternion.multiply(new Q().setFromAxisAngle(new V3(1, 0, 0), FCURL * th * (MODEL_CURL || 1)));
      }
      Object.assign(MODEL, { ok: true, grp, R, rest, fwd, left, fing });
      body.visible = false;
      return true;
    }
    const qa = new Q(), qb = new Q(), qp = new Q();
    function aim(k, dT, uT) {
      const b = MODEL.R[k], r = MODEL.rest[k]; if (!b || !r || dT.lengthSq() < 1e-6) return;
      basisQ(dT, uT, qa); basisQ(r.d, r.u, qb); qa.multiply(qb.invert()).multiply(r.q);       // rotación nueva en el mundo
      b.parent.getWorldQuaternion(qp); b.quaternion.copy(qp.invert().multiply(qa));
      b.updateMatrixWorld(true);
    }
    // mano con la línea de nudillos en la dirección kT (así el mango pasa por dentro del puño)
    function aimK(k, dT, kT) {
      const b = MODEL.R[k], r = MODEL.rest[k]; if (!b || !r || !r.k || dT.lengthSq() < 1e-6) return false;
      basisQ(dT, kT, qa); basisQ(r.d, r.k, qb); qa.multiply(qb.invert()).multiply(r.q);
      b.parent.getWorldQuaternion(qp); b.quaternion.copy(qp.invert().multiply(qa));
      b.updateMatrixWorld(true); return true;
    }
    // centro del puño: promedio de las falanges (con los dedos cerrados queda dentro del hueco)
    function gripPt(s) {
      const L = MODEL.fing[s]; if (!L || !L.length) return null;
      const c = new V3(), t = new V3(); for (const b of L) c.add(b.getWorldPosition(t)); return c.multiplyScalar(1 / L.length);
    }
    // qué manos sujetan un implemento con mango transversal
    const HELD = /^(barbell|db|kb|stick|cable|handle|landmine)$/;
    function heldHands(J, tpl) {
      const h = {};
      for (const o of tpl.props3 || tpl.props || []) {
        // pec fly: cada mano en su manilla vertical (agarre neutro)
        if (o.type === 'pecdeck') { h[1] = h[2] = 1; h.kv = 'up'; continue; }
        // cuerda: agarre neutro, pulgares hacia atrás
        if (o.type === 'cable' && o.rope) h.kv = 'rope';
        if (!HELD.test(o.type) || o.band) continue;
        if (o.type === 'barbell') { let bp = null; try { bp = A.at(J, o.at || 'wr1'); } catch (e) { } if (bp) for (const i of [1, 2]) if (J['wr' + i] && d2(J['wr' + i], bp) <= 16) h[i] = 1; continue; }
        const a = o.type === 'cable' ? (o.to || 'hd1') : (o.at || 'hd1'); if (typeof a !== 'string') continue;
        const m = /^(hd|wr|tg)([12])$/.exec(a); if (!m || !J[a]) continue; h[m[2]] = 1;
        const oth = m[2] === '1' ? 2 : 1;
        // cable con polea propia a un costado (fz): cada mano tira de su cable, no hay barra entre ambas
        if ((o.type === 'stick' || o.grip !== undefined || (o.type === 'cable' && o.fz === undefined)) && J['hd' + oth] && d2(J['hd' + oth], J[a]) < 10) h[oth] = h.two = 1;
      }
      return h;
    }
    // los implementos se ubican en el puño real del modelo
    const inv2 = G => front ? { p: [G.x + cx, FLOOR - G.y], z: G.z } : { p: [G.z + cx, FLOOR - G.y], z: -G.x };
    function snapProps(J, tpl) {
      const g = MODEL.grip; if (!g || !(g[1] || g[2])) return J;
      J = Object.assign({}, J); const q = {};
      for (const i of [1, 2]) if (g[i]) { q[i] = inv2(g[i]); for (const k of ['hd', 'wr']) { J[k + i] = q[i].p; OV[k + i + 'z'] = q[i].z; } }
      if (q[1] && q[2] && ((MODEL.held && MODEL.held.two) || (tpl.props || []).some(o => o.type === 'barbell' || o.type === 'stick'))) { const m = [(q[1].p[0] + q[2].p[0]) / 2, (q[1].p[1] + q[2].p[1]) / 2]; J.wr1 = J.wr2 = J.hd1 = J.hd2 = m; }
      return J;
    }
    function poseModel(J, tpl) {
      const M = MODEL; M.grp.position.set(0, 0, 0); M.grp.quaternion.identity(); M.grp.updateMatrixWorld(true);
      const held = tpl ? heldHands(J, tpl) : {}, hs = {};
      const hip = V2(J.hip, 0), shc = PT(J, 'shc'), up = shc.clone().sub(hip);
      const tf = front ? FWD : D2(J.n);
      for (const k of ['hips', 'spine1', 'spine2', 'spine3']) aim(k, up, tf);
      const hd = PT(J, 'head'), nk = PT(J, 'neck'), hu = hd.clone().sub(nk);
      aim('neck', hu, tf); aim('head', hu, tf);
      const leftT = new V3().crossVectors(up, tf);
      for (const i of [1, 2]) {
        const s = PT(J, 'S' + i).sub(shc).dot(leftT) > 0 ? 'L' : 'R';
        const Sh = PT(J, 'S' + i), E = PT(J, 'el' + i), W = PT(J, 'wr' + i), Hd = PT(J, 'hd' + i);
        const ua = antOf(J['S' + i], J['el' + i]), fa = antOf(J['el' + i], J['wr' + i]);
        aim('upper' + s, E.clone().sub(Sh), ua); aim('fore' + s, W.clone().sub(E), fa);
        const hv = Hd.clone().sub(W);
        if (hv.lengthSq() > 0.5) {
          // línea de nudillos: vertical en manillas verticales; con cuerda, perpendicular a la mano en el plano del movimiento
          const kT = held.kv === 'up' ? new V3(0, 1, 0) : held.kv === 'rope' ? new V3().crossVectors(hv, leftT).normalize()
            : front ? FWD.clone().negate() : leftT.clone().multiplyScalar(s === 'L' ? 1 : -1);
          if (!(held[i] && aimK('hand' + s, hv, kT))) aim('hand' + s, hv, fa);
        }
        if (held[i]) hs[i] = s;
        const H = PT(J, 'H' + i), K = PT(J, 'kn' + i), An = PT(J, 'an' + i);
        const ls = PT(J, 'H' + i).sub(hip).dot(leftT) > 0 ? 'L' : 'R';
        aim('thigh' + ls, K.clone().sub(H), antOf(J['H' + i] || J.hip, J['kn' + i]));
        aim('shin' + ls, An.clone().sub(K), antOf(J['kn' + i], J['an' + i]));
        let to, fu;
        if (front) { to = new V3(0, -0.3, 1); fu = new V3(0, 1, 0); }
        else { const f = footDir(J, i); to = f.to; fu = f.up; }
        aim('foot' + ls, to, fu);
      }
      // la cadera del modelo queda en la cadera de la animación
      const hp = M.R.hips.getWorldPosition(new V3());
      M.grp.position.copy(hip.clone().sub(hp)); M.grp.updateMatrixWorld(true);
      // roll3: gira el cuerpo sobre el eje del tronco (p. ej. acostado de lado) y lo apoya en el suelo
      const roll = tpl && tpl.roll3;
      if (roll) {
        const q = new Q().setFromAxisAngle(up.clone().normalize(), roll * Math.PI / 180);
        M.grp.position.sub(hip).applyQuaternion(q).add(hip); M.grp.quaternion.premultiply(q); M.grp.updateMatrixWorld(true);
        let lo = 1e9; for (const k of ['upperL', 'upperR', 'thighL', 'thighR']) if (M.R[k]) lo = Math.min(lo, M.R[k].getWorldPosition(new V3()).y);
        M.grp.position.y += 9 - lo; M.grp.updateMatrixWorld(true);
      }
      M.grip = {}; M.held = held; for (const i in hs) M.grip[i] = gripPt(hs[i]);
    }
    if (T.GLTFLoader) new T.GLTFLoader().load(MODEL_URL, gl => { try { setupModel(gl); } catch (e) { console.warn('SM3D modelo', e); } }, undefined, () => { });

    // ---- implementos (reutiliza mallas cada cuadro)
    const PG = { cyl: new T.CylinderGeometry(1, 1, 1, 20), hex: new T.CylinderGeometry(1, 1, 1, 6), disc: new T.CylinderGeometry(1, 1, 1, 36), sph: sphG, box: new T.BoxGeometry(1, 1, 1) };
    const pool = {}, used = {};
    function prim(kind, mat) {
      const k = kind + '|' + mat; const arr = pool[k] || (pool[k] = []); const n = used[k] || 0; used[k] = n + 1;
      let m = arr[n]; if (!m) { m = mesh(PG[kind], mat, props); arr.push(m); }
      m.visible = true; return m;
    }
    const UP = new T.Vector3(0, 1, 0);
    function cyl(a, b, r, mat, kind) { const m = prim(kind || 'cyl', mat), d = b.clone().sub(a), l = d.length() || 0.01, perp = Math.abs(d.y) / l > 0.9 ? new T.Vector3(1, 0, 0) : UP; frame(m, a.clone().addScaledVector(d, 0.5), d, l, perp, r, r); }
    function disc(c, axis, r, th, mat, kind) { const a = axis.clone().normalize(); cyl(c.clone().addScaledVector(a, -th / 2), c.clone().addScaledVector(a, th / 2), r, mat, kind || 'disc'); }
    function sph(c, r, mat, ry, rz) { ball(prim('sph', mat), c, r, ry, rz); }
    function boxAB(a, b, th, wd, mat, ax) { const W = ax || LAT, m = prim('box', mat), d = b.clone().sub(a), l = d.length() || 0.01, y = d.clone().normalize(); const z = new T.Vector3().crossVectors(W, y).normalize(); m.matrix.makeBasis(W.clone().multiplyScalar(wd), y.multiplyScalar(l), z.multiplyScalar(th)).setPosition(a.clone().addScaledVector(d, 0.5)); m.matrixWorldNeedsUpdate = true; }
    function boxS(c2, along, h, lat, mat, z) { const m = prim('box', mat), c = V2(c2, z || 0); if (front) m.matrix.makeScale(along, h, lat); else m.matrix.makeScale(lat, h, along); m.matrix.setPosition(c); m.matrixWorldNeedsUpdate = true; }
    const latAt = (p2, z) => V2(p2, z);
    function at3(J, a, def) { a = a ?? def; if (typeof a === 'string') return { p: J[a], z: zk(a) }; if (typeof a === 'function') { const p = a(J); return { p, z: nearZ(J, p) }; } return { p: a, z: 0 }; }
    // profundidad de un punto calculado: la de la articulación más cercana (solo vista frontal)
    function nearZ(J, p) {
      if (!front || !p) return 0; let best = 1e9, z = 0;
      for (const k in OV) { if (!k.endsWith('z')) continue; const q = J[k.slice(0, -1)]; if (!q) continue; const d = d2(q, p); if (d < best) { best = d; z = OV[k]; } }
      return best < 25 ? z : 0;
    }
    const lerp = (a, b, u) => a + (b - a) * u;
    const PROP3 = {
      bench: (J, o) => {
        boxAB(V2(o.a), V2(o.b), 8, 26, 'pad');
        for (const x of (o.legs || [o.a[0] + 8, o.b[0] - 8])) { const y = o.a[1] + (o.b[1] - o.a[1]) * ((x - o.a[0]) / ((o.b[0] - o.a[0]) || 1)); for (const z of [-9, 9]) cyl(V2([x, y + 4], z), V2([x, FLOOR], z), 1.8, 'padDark'); }
        if (o.back) boxAB(V2(o.back[0]), V2(o.back[1]), 8, 26, 'pad');
      },
      // de frente el cajón queda detrás (como respaldo) para no tapar el cuerpo
      box: (J, o) => front ? boxS([o.x + o.w / 2, (o.y + FLOOR) / 2], o.w, FLOOR - o.y, 34, 'pad', 8) : boxS([o.x + o.w / 2, (o.y + FLOOR) / 2], o.w, FLOOR - o.y, 38, 'pad'),
      // pared: semitransparente y corrida hacia el lado contrario a la cámara para no tapar el cuerpo
      wall: (J, o) => boxS([o.x + (o.w || 8) / 2, (FLOOR - 40) / 2], o.w || 8, FLOOR + 40, 110, 'wall', front ? 0 : -38),
      // paralelas para fondos: dos barras a los lados del cuerpo
      pbars: (J, o) => { for (const z of [-23, 23]) { cyl(V2([o.x1, o.y], z), V2([o.x2, o.y], z), 2, 'metal'); for (const x of [o.x1 + 4, o.x2 - 4]) cyl(V2([x, o.y], z), V2([x, FLOOR], z), 2.2, 'padDark'); } },
      table: (J, o) => { boxS([o.x + o.w / 2, o.y], o.w, 5, 40, 'pad'); for (const x of [o.x + 4, o.x + o.w - 4]) for (const z of [-15, 15]) cyl(V2([x, o.y], z), V2([x, FLOOR], z), 1.6, 'padDark'); },
      rails: (J, o) => { const p = at3(J, o.at, 'wr1').p; for (const z of [-24, 24]) { cyl(V2([p[0], p[1] + 2], z), V2([p[0], FLOOR], z), 1.6, 'padDark'); cyl(V2([p[0] - 22, p[1] + 2], z), V2([p[0] + 22, p[1] + 2], z), 1.8, 'metal'); } },
      twistball: (J, o) => { const c = [(J.hd1[0] + J.hd2[0]) / 2 + 3, (J.hd1[1] + J.hd2[1]) / 2 - 1]; sph(V2(c), 7 + 2 * (J.p.bs ?? 1), 'ball'); },
      hbar: (J, o) => { const hx = J.wr1 && Math.abs(J.wr1[1] - o.y) < 25 ? Math.min(o.x2, Math.max(o.x1, J.wr1[0])) : (o.x1 + o.x2) / 2; cyl(V2([hx, o.y], -42), V2([hx, o.y], 42), 1.6, 'metal'); for (const z of [-42, 42]) cyl(V2([hx, o.y], z), V2([hx, FLOOR], z), 2.2, 'padDark'); },
      pullbar: (J, o) => { cyl(V2([o.x, o.y], -40), V2([o.x, o.y], 40), 1.8, 'metal'); for (const z of [-40, 40]) cyl(V2([o.x, o.y], z), V2([o.x, FLOOR], z), 2.4, 'padDark'); },
      // z: torre corrida hacia un costado (p. ej. dos poleas a los lados del cuerpo)
      tower: (J, o) => { const top = o.top ?? 6; boxS([o.x, (top + FLOOR) / 2], 10, FLOOR - top, 12, 'padDark', o.z || 0); (o.pulleys || []).forEach(y => disc(V2([o.x, y], o.z), LAT, 4, 3, 'metal')); },
      cable: (J, o) => {
        const a = at3(J, o.from), to = o.to || 'hd1', b = at3(J, to);
        if (o.fz !== undefined) a.z = o.fz;
        // las dos manos juntas en la polea: barra o agarre entre ambas y el cable al centro
        const two = !front && o.fz === undefined && typeof to === 'string' && /^(hd|wr)1$/.test(to) && J.hd2 && Math.hypot(J.hd1[0] - J.hd2[0], J.hd1[1] - J.hd2[1]) < 10;
        // cuerda: el cable llega a un nudo y de ahí salen dos cabos, uno a cada mano
        if (two && o.rope) {
          // nudo a 18 unidades delante de las manos: la cuerda pasa por delante de la cara, no a través de ella
          const ab = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) || 1, kf = Math.min(0.5, 18 / ab);
          const k = [b.p[0] + (a.p[0] - b.p[0]) * kf, b.p[1] + (a.p[1] - b.p[1]) * kf], kn = V2(k, 0);
          for (const i of [1, 2]) { const h = at3(J, 'hd' + i); const hz = h.z || (i === 1 ? ZARM : -ZARM); cyl(kn, V2(h.p, hz), 1.3, 'rope'); sph(V2(h.p, hz), 1.8, 'rope'); }
          cyl(V2(a.p, a.z), kn, 0.7, 'cable'); return;
        }
        if (two && !o.band) { const w = ZARM + 7; cyl(V2(b.p, -w), V2(b.p, w), 1.5, 'metal'); b.z = 0; }
        cyl(V2(a.p, a.z), V2(b.p, b.z), o.band ? 1.2 : 0.7, o.band ? 'band' : 'cable');
      },
      band: (J, o) => { const a = at3(J, o.from), b = at3(J, o.to); cyl(V2(a.p, a.z), V2(b.p, b.z), 1.3, 'band'); },
      handle: (J, o) => { const a = at3(J, o.at, 'hd1'); sph(V2(a.p, a.z), 3, 'metal'); },
      barbell: (J, o) => {
        const p = at3(J, o.at, 'wr1').p, r = o.r || 13;
        if (o.hex) {        // barra hexagonal: marco grande que rodea al cuerpo, asas a la altura de las manos y mangas afuera
          const H = [[-38, 0], [-15, -34], [15, -34], [38, 0], [15, 34], [-15, 34]].map(([dx, z]) => V2([p[0] + dx, p[1]], z));
          H.forEach((v, i) => cyl(v, H[(i + 1) % 6], 1.6, 'metal'));
          for (const s of [-1, 1]) {
            cyl(latAt([p[0] - 9, p[1]], s * 27), latAt([p[0] + 9, p[1]], s * 27), 1.9, 'metal');
            for (const dx of [-9, 9]) cyl(latAt([p[0] + dx, p[1]], s * 27), latAt([p[0] + dx, p[1]], s * 34), 1.4, 'metal');
            cyl(latAt(p, s * 34), latAt(p, s * 68), 1.5, 'metal'); disc(latAt(p, s * 50), LAT, r, 4.5, 'plate'); disc(latAt(p, s * 54.5), LAT, r * 0.72, 3.5, 'plate');
          }
          return;
        }
        // discos por fuera del agarre (manos a ±27) para que no se toquen; wide: barra más larga (sumo, pies entre los discos)
        const k = o.wide ? 1.3 : 1;
        cyl(latAt(p, -58 * k), latAt(p, 58 * k), 1.5, 'metal');
        for (const s of [-1, 1]) { disc(latAt(p, s * 42 * k), LAT, r, 4.5, 'plate'); disc(latAt(p, s * (42 * k + 4.5)), LAT, r * 0.72, 3.5, 'plate'); disc(latAt(p, s * (42 * k - 3.5)), LAT, 2.6, 2.2, 'metal'); }
      },
      // bloques bajo los discos (rack pull)
      blocks: (J, o) => { for (const z of o.z) boxS([o.x, (o.y + FLOOR) / 2], o.w, FLOOR - o.y, o.d, 'pad', z); },
      // un cajón bajo cada pie (déficit con los pies separados)
      footbox: (J, o) => { for (const i of [1, 2]) { const a = at3(J, 'an' + i); boxS([a.p[0] + 3, (o.y + FLOOR) / 2], o.w, FLOOR - o.y, o.d, 'pad', a.z); } },
      // máquina de abductores / aductores (vista frontal): asiento, respaldo, almohadillas en las rodillas,
      // brazos de palanca bajo los muslos, apoyapiés y torre de pesas atrás
      hipmachine: (J, o) => {
        const hx = J.hip[0], sy = J.hip[1] + 6, kz = Math.max(zk('kn1'), zk('kn2'), 20), back = -12;
        boxS([hx, sy + 3], 46, 6, kz - back, 'pad', (kz + back) / 2);
        // respaldo inclinado como el tronco, con cabezal
        const r0 = V2([hx, sy], back - 3), r1 = V2([hx, J.shc[1]], zk('shc') + back - 3), rd = r1.clone().sub(r0).normalize();
        boxAB(r0, r1.clone().addScaledVector(rd, 22), 7, 40, 'pad', new T.Vector3(1, 0, 0));
        boxS([hx, (sy + 6 + FLOOR) / 2], 14, FLOOR - sy - 6, 14, 'padDark', back + 8);
        boxS([hx, FLOOR - 1], 50, 2, 40, 'padDark', back);
        boxS([hx, (40 + FLOOR) / 2], 50, FLOOR - 40, 10, 'padDark', back - 22);
        for (const i of [1, 2]) {
          // almohadilla al costado de la rodilla, separada del muslo para que la pierna no la atraviese
          const kn = J['kn' + i], z = zk('kn' + i), an = J['an' + i], sg = (kn[0] < hx ? -1 : 1) * (o.mode === 'out' ? 1 : -1), px = kn[0] + sg * 11;
          boxS([px, kn[1] - 2], 4, 22, 10, 'pad', z);
          cyl(V2([px, kn[1] + 8], z), V2([hx + (kn[0] < hx ? -6 : 6), sy + 12], 0), 1.8, 'metal');
          cyl(V2([an[0] - 8, an[1] + 5], zk('an' + i)), V2([an[0] + 8, an[1] + 5], zk('an' + i)), 1.6, 'metal');
          const h = J['hd' + i]; if (h) cyl(V2([h[0], h[1] - 2], zk('hd' + i) - 6), V2([h[0], h[1] - 2], zk('hd' + i) + 6), 1.5, 'metal');
        }
      },
      // contractora (vista frontal): asiento, respaldo, marco sobre la cabeza, brazo de palanca desde arriba
      // de cada hombro hasta la almohadilla del antebrazo y torre de pesas atrás
      pecdeck: (J, o) => {
        const hx = J.hip[0], sy = J.hip[1] + 6, back = -12, XA = new T.Vector3(1, 0, 0), top = J.shc[1] - 34;
        boxS([hx, sy + 3], 40, 6, 30, 'pad', 3);
        boxS([hx, (sy + 6 + FLOOR) / 2], 12, FLOOR - sy - 6, 12, 'padDark', back + 4);
        boxS([hx, FLOOR - 2], 60, 4, 50, 'padDark', 0);
        boxAB(V2([hx, sy - 2], back - 2), V2([hx, J.shc[1] - 8], back - 2), 7, 34, 'pad', XA);
        boxS([hx, (top + FLOOR) / 2], 12, FLOOR - top, 10, 'padDark', back - 22);
        cyl(V2([hx - 36, top], back - 22), V2([hx + 36, top], back - 22), 2.4, 'padDark');
        // brazos de pec fly: giran sobre un eje vertical encima de cada hombro y bajan a una manilla vertical en la mano
        cyl(V2([hx, top], back - 22), V2([hx, top], 0), 2.4, 'padDark');
        for (const i of [1, 2]) {
          const S = J['S' + i], h = J['hd' + i], z = zk('hd' + i), pv = V2([S[0], top], 0);
          cyl(V2([S[0], top - 3], 0), V2([S[0], top + 3], 0), 3, 'metal');
          cyl(pv, V2([h[0], top], z), 1.8, 'metal');
          cyl(V2([h[0], top], z), V2([h[0], h[1] - 9], z), 1.8, 'metal');
          cyl(V2([h[0], h[1] - 9], z), V2([h[0], h[1] + 9], z), 1.5, 'metal');
        }
      },
      // máquina hack: rieles inclinados detrás de la espalda, patas, base, almohadillas sobre los hombros y manillas
      hackframe: (J, o) => {
        const [a, b] = o.rail;
        for (const z of [-18, 18]) {
          cyl(V2(a, z), V2(b, z), 2.4, 'padDark');
          cyl(V2(a, z), V2([a[0], FLOOR], z), 2.4, 'padDark'); cyl(V2([b[0] + 8, b[1] + 11], z), V2([b[0] - 2, FLOOR], z), 2.4, 'padDark');
          cyl(V2([b[0] - 6, FLOOR - 2], z), V2([a[0] + 40, FLOOR - 2], z), 2.4, 'padDark');
        }
        const t = J.t, s0 = A.mv(J.shc, t, 4), s1 = A.mv(s0, t - 90, 9);
        for (const z of [-12, 12]) { boxAB(V2(s0, z), V2(s1, z), 6, 8, 'pad'); }
        for (const z of [-24, 24]) cyl(V2(A.mv(s0, t + 90, 2), z), V2(A.mv(A.mv(s0, t + 90, 2), t - 90, 14), z), 1.4, 'metal');
        boxAB(V2(A.mv(J.hip, t + 90, 9)), V2(A.mv(J.shc, t + 90, 9)), 8, 26, 'pad');
      },
      // máquina de remo con apoyo de pecho: almohadilla, columna, palancas que bajan desde el eje hasta cada manilla y pesas
      rowmachine: (J, o) => {
        const [px, py0, py1] = o.pad, c = o.col, pv = o.piv;
        boxAB(V2([px, py0]), V2([px, py1]), 7, 24, 'pad');
        cyl(V2([px + 4, (py0 + py1) / 2]), V2([c, (py0 + py1) / 2]), 2, 'padDark');
        boxS([c, (pv[1] - 8 + FLOOR) / 2], 10, FLOOR - pv[1] + 8, 12, 'padDark');
        boxS([c + 22, (pv[1] + 6 + FLOOR) / 2], 16, FLOOR - pv[1] - 6, 22, 'padDark');
        boxS([c + 4, FLOOR - 2], 60, 4, 40, 'padDark');
        cyl(V2(pv, -26), V2(pv, 26), 2.2, 'metal');
        for (const i of [1, 2]) {
          const h = at3(J, 'hd' + i), sg = i === 1 ? 1 : -1, z = h.z || sg * ZARM;
          cyl(V2(pv, sg * 24), V2([h.p[0] + 3, h.p[1] - 4], z), 2, 'metal');
          cyl(V2([h.p[0] + 1, h.p[1] - 9], z), V2([h.p[0] + 1, h.p[1] + 6], z), 1.5, 'metal');
        }
      },
      plate: (J, o) => { const a = at3(J, o.at); disc(V2(a.p, a.z), LAT, o.r || 9, 3, 'plate'); },
      db: (J, o) => {
        const a = at3(J, o.at, 'hd1'), k = o.k || 1;
        cyl(V2(a.p, a.z - 6.5), V2(a.p, a.z + 6.5), 1.4 * k, 'metal');
        for (const s of [-1, 1]) disc(V2(a.p, a.z + s * 8.5), LAT, 6.2 * k, 4.5 * k, 'plate', 'hex');
      },
      kb: (J, o) => {
        const a = at3(J, o.at, 'hd1'), h = a.p; let d = [0, 1];
        if (o.along) { const w = at3(J, o.along).p, e = at3(J, o.from).p, v = [w[0] - e[0], w[1] - e[1]], m = Math.hypot(...v) || 1; d = [v[0] / m, v[1] / m]; }
        if (o.up) d = [-d[0], -d[1]];
        const c = [h[0] + d[0] * 9, h[1] + d[1] * 9];
        sph(V2(c, a.z), 8, 'plate'); cyl(V2(h, a.z - 3), V2(h, a.z + 3), 1.2, 'metal');
      },
      ball: (J, o) => { const a = at3(J, o.at); sph(V2(a.p, a.z), o.r || 9, 'ball'); },
      roller: (J, o) => { const a = at3(J, o.at); cyl(V2(a.p, -18), V2(a.p, 18), o.r || 7, 'teal'); },
      stick: (J, o) => { const a = at3(J, o.at, 'hd1'); cyl(V2(a.p, -55), V2(a.p, 55), 1.2, 'wood'); },
      landmine: (J, o) => {
        const pv = V2(at3(J, o.pivot).p), a = at3(J, o.at, 'hd1'), h = V2(a.p, a.z), d = h.clone().sub(pv).normalize(), e = h.clone().addScaledVector(d, 12);
        cyl(pv, e, 1.6, 'metal'); disc(e, d, 10, 4, 'plate'); sph(pv, 3.5, 'padDark');
      },
      platform: (J, o) => { const p = at3(J, o.at, 'an1').p, d = A.dir(o.a); boxAB(V2([p[0] - d[0] * 18, p[1] - d[1] * 18]), V2([p[0] + d[0] * 18, p[1] + d[1] * 18]), 5, 30, 'pad'); },
      pad: (J, o) => { const a = at3(J, o.a), b = at3(J, o.b), bk = front && o.layer === 'back' ? -14 : null; boxAB(V2(a.p, bk ?? a.z), V2(b.p, bk ?? b.z), o.w || 7, 24, 'pad'); },
      rope: (J, o, Tm) => {
        const a = at3(J, o.from), b = at3(J, o.to);
        for (const z of (front ? [0] : [-10, 10])) {
          let prev = null;
          for (let i = 0; i <= 16; i++) { const u = i / 16, x = lerp(a.p[0], b.p[0], u), y = lerp(a.p[1], b.p[1], u) + Math.sin(u * 12 - Tm * 14 + (o.ph || 0) + z) * 7 * (1 - u) * (0.4 + 0.6 * Math.abs(Math.sin(Tm * 3 + (o.ph || 0)))); const q = V2([x, y], lerp(z, z * 1.6, u)); if (prev) cyl(prev, q, 1.5, 'rope'); prev = q; }
        }
      },
      sled: (J, o) => { const h = at3(J, o.at, 'hd1').p, x = h[0] + (o.dx || 4); boxS([x + 17, FLOOR - 15], 34, 22, 30, 'pad'); cyl(V2(h), V2([x + 6, FLOOR - 24]), 1.5, 'metal'); },
      yoke: (J, o) => { const s = [J.shc[0] - 3, J.shc[1] - 4]; cyl(V2(s, -44), V2(s, 44), 1.8, 'metal'); for (const z of [-34, 34]) { disc(V2(s, z), LAT, 14, 4, 'plate'); cyl(V2(s, z * 0.85), V2([s[0], FLOOR], z * 0.85), 2, 'padDark'); } },
      rower: (J, o) => { boxAB(V2([20, FLOOR - 8]), V2([170, FLOOR - 8]), 4, 14, 'pad'); disc(V2([168, FLOOR - 28]), LAT, 17, 6, 'padDark'); const h = at3(J, 'hd1'); cyl(V2(h.p, 0), V2([160, FLOOR - 32]), 0.7, 'cable'); },
      bike: (J, o) => {
        const c = o.crank, sp = o.seat, hb = o.bar;
        cyl(V2([sp[0], sp[1] + 6]), V2(c), 2.2, 'pad'); cyl(V2(c), V2([hb[0] - 4, hb[1] + 4]), 2.2, 'pad');
        cyl(V2([c[0] + 10, c[1]]), V2([c[0] - 8, FLOOR]), 2, 'pad'); cyl(V2([sp[0], sp[1] + 6]), V2([sp[0] - 8, FLOOR]), 2, 'pad');
        boxAB(V2([c[0] - 30, FLOOR - 2]), V2([c[0] + 34, FLOOR - 2]), 3, 22, 'padDark');
        boxS([sp[0], sp[1] + 3], 18, 4, 10, 'padDark'); cyl(V2([hb[0] - 4, hb[1] + 4], -12), V2([hb[0] - 4, hb[1] + 4], 12), 1.4, 'metal');
        disc(V2(c), LAT, 7, 3, 'metal'); if (o.fan) disc(V2([c[0] + 30, c[1] - 14]), LAT, 20, 4, 'padDark');
      },
      stairs: (J, o, Tm) => { for (let i = 0; i < 4; i++) { const y = FLOOR - 14 * (i + 1) + ((Tm * 30) % 14); boxS([129, y], 42, 3, 34, 'pad'); } boxS([128, FLOOR - 35], 56, 70, 4, 'padDark', -20); },
      hurdle: (J, o) => { cyl(V2([o.x, o.y], -16), V2([o.x, o.y], 16), 1.4, 'orange'); for (const z of [-16, 16]) cyl(V2([o.x, o.y], z), V2([o.x, FLOOR], z), 1.2, 'orange'); },
      foam: (J, o) => boxS([o.x + (o.w || 40) / 2, FLOOR - 4], o.w || 40, 8, 50, 'teal'),
      bosu: (J, o) => sph(V2([o.x, FLOOR]), 22, 'teal', 14, 22),
      slant: (J, o) => boxAB(V2([o.x, FLOOR - 1]), V2([o.x + o.w, FLOOR - o.h]), 4, 34, 'pad'),
      crutch: (J, o) => { const a = at3(J, o.at); cyl(V2([a.p[0] + (o.dx || 0), a.p[1] - 6], a.z), V2([a.p[0] + (o.dx || 0) * 1.6, FLOOR], a.z), 1.6, 'metal'); },
      // cadenas colgando de las mangas, por fuera de los discos: la parte que no cuelga queda amontonada en el suelo
      chain: (J, o) => {
        const a = at3(J, o.at, 'wr1').p, len = 56, hang = Math.min(len, FLOOR - 2 - a[1]);
        for (const z of [-52, 52]) {
          for (let d = 0; d <= hang; d += 2.6) sph(V2([a[0], a[1] + d], z), 1.5, 'metal', 1.5, 1);
          for (let d = 0, n = 0; d < len - hang; d += 2.6, n++) sph(V2([a[0] - 4 + (n % 4) * 2.6, FLOOR - 1.5 - Math.floor(n / 8) * 2], z + (Math.floor(n / 4) % 2 ? 3 : 0)), 1.5, 'metal', 1.5, 1);
        }
      }
    };
    function poseProps(J, tpl, Tm) {
      for (const k in used) used[k] = 0;
      for (const o of tpl.props3 || tpl.props || []) { const f = PROP3[o.type]; if (f) { try { f(J, o, Tm); } catch (e) { } } }
      for (const k in pool) for (let i = used[k] || 0; i < pool[k].length; i++) pool[k][i].visible = false;
    }

    // ---- cámara: encuadre según el recorrido completo del ejercicio
    const box = new T.Box3();
    for (let i = 0; i < 8; i++) { const J = joints(A.pose3(P.tplName, i / 8).J); for (const k of ['hip', 'shc', 'head', 'hd1', 'hd2', 'kn1', 'kn2', 'an1', 'an2', 'to1', 'to2', 'el1', 'el2']) if (J[k]) box.expandByPoint(PT(J, k)); }
    poseProps(joints(first.J), first.tpl, 0); props.updateMatrixWorld(true);
    if (props.children.length) { const pb = new T.Box3().setFromObject(props), lim = box.clone().expandByScalar(45); pb.intersect(lim); if (!pb.isEmpty()) box.union(pb); }
    box.expandByScalar(8); box.min.y = Math.min(box.min.y, 0);
    const ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    const rad = Math.max(size.y, Math.hypot(size.x, size.z) * 0.85) * 0.54 + 6;
    // cuerpo acostado o en plancha: cámara más de perfil y algo más alta para que se entienda la postura
    const lying = !front && Math.abs(Math.cos((first.J.t || 180) * Math.PI / 180)) < 0.5, p0 = lying ? 20 : 12;
    const VIEWS = front ? { front: 0, side: -90, back: 180, def: 28 } : { front: 0, side: -90, back: 180, def: lying ? -76 : -58 };
    const cam = { yaw: VIEWS.def, pitch: p0, dist: rad / Math.tan(16 * Math.PI / 180), ty: VIEWS.def, tp: p0, td: 0 };
    cam.td = cam.dist; S.scene.fog.near = cam.dist * 1.4; S.scene.fog.far = cam.dist * 3.4;
    S.glow.scale.setScalar(Math.max(size.x, size.z) * 0.9 + 40); S.glow.position.x = ctr.x; S.glow.position.z = ctr.z;
    const sc = S.key.shadow.camera, R0 = rad * 1.6; sc.left = -R0; sc.right = R0; sc.top = R0; sc.bottom = -R0; sc.near = 1; sc.far = rad * 8; sc.updateProjectionMatrix();
    function placeCam() {
      const y = cam.yaw * Math.PI / 180, p = cam.pitch * Math.PI / 180;
      S.cam.position.set(ctr.x + Math.sin(y) * Math.cos(p) * cam.dist, ctr.y + Math.sin(p) * cam.dist, ctr.z + Math.cos(y) * Math.cos(p) * cam.dist);
      S.cam.lookAt(ctr);
      // luz principal sigue a la cámara (arriba a la derecha), contraluz verde atrás
      const ky = y + 0.7;
      S.key.position.set(ctr.x + Math.sin(ky) * rad * 3, ctr.y + rad * 4, ctr.z + Math.cos(ky) * rad * 3); S.key.target.position.copy(ctr);
      S.rim.position.set(ctr.x - Math.sin(y) * rad * 3, ctr.y + rad * 1.5, ctr.z - Math.cos(y) * rad * 3);
      S.fill.position.set(ctr.x + Math.sin(y - 1.4) * rad * 3, ctr.y + rad, ctr.z + Math.cos(y - 1.4) * rad * 3);
    }
    P.view = v => { const t = VIEWS[v]; if (t === undefined) return; P.spin = false; let d = ((t - cam.yaw) % 360 + 540) % 360 - 180; cam.ty = cam.yaw + d; cam.tp = v === 'side' ? 6 : 12; if (P.onSpin) P.onSpin(false); };

    // ---- arrastrar para girar, rueda para acercar
    let drag = null;
    wrap.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: cam.ty, pitch: cam.tp, moved: false }; });
    wrap.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; P.spin = false; if (P.onSpin) P.onSpin(false); try { wrap.setPointerCapture(e.pointerId); } catch (er) { } wrap.style.cursor = 'grabbing'; }
      if (drag.moved) { cam.ty = drag.yaw - dx * 0.45; cam.tp = Math.max(-8, Math.min(70, drag.pitch + dy * 0.3)); }
    });
    const endDrag = () => { if (drag && drag.moved) wrap._dragged = true; drag = null; wrap.style.cursor = 'grab'; };
    wrap.addEventListener('pointerup', endDrag); wrap.addEventListener('pointercancel', () => { drag = null; });
    wrap.addEventListener('click', e => { if (wrap._dragged) { wrap._dragged = false; e.stopPropagation(); } });
    wrap.addEventListener('wheel', e => { e.preventDefault(); cam.td = Math.max(rad * 1.6, Math.min(rad * 7, cam.td * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });

    // ---- etiquetas (agarre, ISO) y marca
    const over = document.createElement('div');
    over.style.cssText = 'position:absolute;left:10px;top:10px;display:flex;flex-direction:column;gap:5px;pointer-events:none;z-index:1';
    over.innerHTML = [].concat(P.badge || []).filter(Boolean).map(t => `<span style="font:800 10px/1 Inter,Arial,sans-serif;letter-spacing:.3px;text-transform:uppercase;color:${C.hl};background:rgba(12,13,14,.82);border:1px solid rgba(187,244,38,.5);border-radius:99px;padding:5px 9px;align-self:flex-start">${String(t).replace(/[&<>]/g, '')}</span>`).join('') + (tpl0.pulse ? `<span style="font:800 10px/1 Inter,Arial,sans-serif;color:#0c0d0e;background:${C.hl};border-radius:99px;padding:5px 9px;align-self:flex-start">ISOMÉTRICO</span>` : '');
    const mark = document.createElement('div');
    mark.style.cssText = 'position:absolute;left:12px;bottom:10px;font:800 10px/1 Inter,Arial,sans-serif;color:#fff;opacity:.55;pointer-events:none;letter-spacing:.3px';
    mark.innerHTML = `STRONG<span style="color:${C.hl}">MED</span>`;
    wrap.appendChild(over); wrap.appendChild(mark);

    // ---- reemplaza el SVG 2D
    const svg = el.querySelector(':scope > svg'); if (svg) svg.remove();
    el.insertBefore(wrap, el.firstChild);
    P.is3d = true;

    let raf = 0, last = 0, vis = true;
    const io = G.IntersectionObserver ? new IntersectionObserver(es => { vis = es[0].isIntersecting; }, { rootMargin: '60px' }) : null;
    if (io) io.observe(el);
    const ro = G.ResizeObserver ? new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (w && h) { S.renderer.setSize(w, h, false); S.cam.aspect = w / h; S.cam.updateProjectionMatrix(); } }) : null;
    if (ro) ro.observe(el);
    function dispose() {
      cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect();
      S.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      Object.values(MAT).forEach(m => m.dispose());
      S.renderer.dispose(); try { S.renderer.forceContextLoss(); } catch (e) { }
    }
    P.dispose = dispose;
    const dur = tpl0.dur || 2.6;
    function tick(ts) {
      raf = requestAnimationFrame(tick);
      if (!document.body.contains(el)) { dispose(); return; }
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
      if (!vis) return;
      if (!P.paused) P.clock += dt * P.speed;
      if (P.spin) cam.ty -= dt * 22;
      const k = 1 - Math.pow(0.0015, dt);
      cam.yaw += (cam.ty - cam.yaw) * k; cam.pitch += (cam.tp - cam.pitch) * k; cam.dist += (cam.td - cam.dist) * k;
      const ph = (P.clock / dur + P.off) % 1, R = A.pose3(P.tplName, ph); FL = flipOf(P.tplName); let J = joints(R.J);
      gripFix(J, R.tpl); if (MODEL.ok) { poseModel(J, R.tpl); J = snapProps(J, R.tpl); } else poseBody(J); poseProps(J, R.tpl, P.clock);
      placeCam();
      S.renderer.render(S.scene, S.cam);
    }
    raf = requestAnimationFrame(tick);
    return true;
  }

  // Monta la animación: primero 2D (inmediato) y, si hay WebGL, pasa a 3D cuando carga Three.js
  function mount(el, tplName, hl, opts = {}) {
    const P = A.mount(el, tplName, hl, Object.assign({}, opts, { spin: false }));
    P.tplName = tplName; P.badge = opts.badge; P.hl = hl; P.clock = P.clock || 0;
    const tpl = A.tpl(tplName);
    if (!hasGL || tpl.custom || opts.flat) return P;
    loadThree().then(T => {
      if (!document.body.contains(el)) return;
      A.unmount(P);
      try { if (start3D(T, P) && opts.onReady) opts.onReady(P); }
      catch (e) { console.warn('SM3D', e); A.mount(el, tplName, hl, opts); }
    }).catch(() => { });
    return P;
  }
  G.SM3D = { mount, load: loadThree, flipOf };
})(window);
