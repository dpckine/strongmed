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
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js';
  const FLOOR = A.FLOOR;
  const C = {
    bg: '#121417', floor: '#181b1f', grid: '#262b31', skin: '#dde2e8', hl: '#bbf426', hl2: '#d4ec95',
    shorts: '#1b1f25', shoe: '#2a3038', metal: '#c3ccd6', plate: '#1d2228', pad: '#353d48', padDark: '#262c34',
    cable: '#8a96a6', band: '#ff6b8b', wood: '#c08a55', teal: '#2f6f73', ball: '#3b4655', rope: '#c9a46a', orange: '#f59e0b'
  };
  // profundidad (medio ancho) de cada lado del cuerpo en 3D
  const ZARM = 15.5, ZLEG = 7;
  const ARMK = ['S', 'el', 'wr', 'hd', 'tg'], LEGK = ['H', 'kn', 'an', 'to', 'he'];
  const zOf = key => { const m = /^(S|el|wr|hd|tg|H|kn|an|to|he)([12])$/.exec(key || ''); if (!m) return 0; const w = ARMK.includes(m[1]) ? ZARM : ZLEG; return m[2] === '1' ? w : -w; };

  let loading = null;
  function loadThree() {
    if (G.THREE) return Promise.resolve(G.THREE);
    if (!loading) loading = new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = THREE_URL; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => (G.THREE ? ok(G.THREE) : ko(new Error('three')));
      s.onerror = () => { loading = null; ko(new Error('three')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();

  // ---------------------------------------------------------------- geometrías
  // superficie de revolución con sección elíptica: perfil [t, adelante, atrás, lateral]
  function profAt(prof, t) {
    let i = 0; while (i < prof.length - 2 && t > prof[i + 1][0]) i++;
    const a = prof[i], b = prof[i + 1], u = Math.min(1, Math.max(0, (t - a[0]) / ((b[0] - a[0]) || 1)));
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
  }
  function ringGeo(T, prof, t0, t1, p0, p1, nt, np, off) {
    const pos = [], idx = [];
    for (let i = 0; i <= nt; i++) {
      const t = t0 + (t1 - t0) * i / nt, r = profAt(prof, t);
      for (let j = 0; j <= np; j++) {
        const ph = p0 + (p1 - p0) * j / np, c = Math.cos(ph), s = Math.sin(ph);
        pos.push((r[2] + off) * s, t, ((c >= 0 ? r[0] : r[1]) + off) * c);
      }
    }
    for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) {
      const a = i * (np + 1) + j, b = a + np + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    if (Math.abs(p1 - p0 - 2 * Math.PI) < 1e-3) {     // costura: promedia normales
      const n = g.attributes.normal;
      for (let i = 0; i <= nt; i++) {
        const a = i * (np + 1), b = a + np;
        const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2, l = Math.hypot(x, y, z) || 1;
        n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
      }
    }
    return g;
  }
  const TAU = Math.PI * 2;
  // perfiles (radios en las mismas unidades del motor 2D)
  const PR = {
    torso: [[-0.2, 2, 3, 6], [-0.12, 5, 6.5, 11.5], [0.05, 6.8, 9.5, 12.5], [0.2, 6.2, 7.5, 11], [0.35, 6.3, 6.8, 10.8], [0.52, 6.8, 6.4, 11.8], [0.7, 8.6, 7.6, 13.2], [0.86, 7.8, 7.2, 14.6], [0.97, 6, 6, 14], [1.04, 4.2, 4.6, 9.5], [1.1, 3.4, 3.6, 5]],
    thigh: [[0, 7.4, 7.4, 7.6], [0.35, 8.2, 7.6, 7.4], [0.75, 6.1, 5.6, 5.8], [1, 4.8, 4.6, 4.8]],
    shin: [[0, 4.6, 5, 4.6], [0.3, 4.1, 6.4, 4.7], [0.7, 3.1, 3.5, 3.3], [1, 2.8, 2.8, 2.9]],
    upper: [[0, 5.4, 5.4, 5.8], [0.4, 5.3, 5.2, 4.7], [0.85, 3.8, 3.8, 3.9], [1, 3.5, 3.5, 3.7]],
    fore: [[0, 3.7, 3.7, 4.1], [0.3, 4.1, 3.9, 4.3], [1, 2.4, 2.4, 3]],
    neck: [[0, 4, 4, 4.4], [1, 3.3, 3.3, 3.5]],
    shoe: [[0, 2.8, 2.4, 2.9], [0.25, 3.6, 2.6, 3.6], [0.7, 2.4, 2.4, 3.5], [1, 1.3, 1.7, 2.5]],
    hand: [[0, 2.3, 2.3, 2.9], [0.4, 2.8, 2.8, 3.4], [1, 1.5, 1.5, 2.6]]
  };
  // zonas musculares: [clave, t0, t1, fi0, fi1] (fi = 0 adelante, π atrás)
  const ZONES = {
    torso: [['chest', 0.62, 0.95, -1.25, -0.07], ['chest', 0.62, 0.95, 0.07, 1.25], ['abs', 0.14, 0.56, -0.55, 0.55],
      ['lats', 0.42, 0.86, 1.3, 2.35], ['lats', 0.42, 0.86, -2.35, -1.3], ['upperback', 0.74, 1.08, 2.25, 4.03],
      ['lowback', 0.12, 0.42, 2.65, 3.63], ['glutes', -0.14, 0.2, 2.0, 4.28]],
    thigh: [['quads', 0.22, 0.92, -1.2, 1.2], ['hams', 0.18, 0.9, 2.1, 4.18], ['hipflex', 0.02, 0.32, -0.75, 0.75]],
    shin: [['tib', 0.1, 0.75, -0.9, 0.6], ['calves', 0.08, 0.6, 2.2, 4.08]],
    upper: [['biceps', 0.25, 0.85, -0.9, 0.9], ['triceps', 0.15, 0.85, 2.2, 4.08]],
    fore: [['forearm', 0.04, 0.7, 0, TAU]],
    neck: [['neck', 0, 1, 0, TAU]]
  };

  // ---------------------------------------------------------------- escena
  function makeScene(T, el, P) {
    const W = el.clientWidth || 320, H = el.clientHeight || 320;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(G.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene(); scene.background = new T.Color(C.bg);
    const cam = new T.PerspectiveCamera(32, W / H, 1, 6000);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a2f36, 1.15));
    const key = new T.DirectionalLight(0xffffff, 1.9); key.castShadow = true;
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

  // ---------------------------------------------------------------- reproductor 3D
  function start3D(T, P) {
    const el = P.el, tpl0 = A.tpl(P.tplName);
    const first = A.pose3(P.tplName, 0);
    if (first.custom) return false;
    const front = first.front, cx = first.cx;
    const LAT = front ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0);
    const V2 = (p, z) => front ? new T.Vector3(p[0] - cx, FLOOR - p[1], z || 0) : new T.Vector3(-(z || 0), FLOOR - p[1], p[0] - cx);
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
      skin: std(C.skin, 0.55, 0.04), hl: std(C.hl, 0.5, 0.02, C.hl), hl2: std(C.hl2, 0.55, 0.02), shorts: std(C.shorts, 0.8, 0), shoe: std(C.shoe, 0.7, 0), sole: std(C.hl, 0.6, 0, C.hl),
      metal: std(C.metal, 0.3, 0.85), plate: std(C.plate, 0.55, 0.3), pad: std(C.pad, 0.75, 0.05), padDark: std(C.padDark, 0.7, 0.2), cable: std(C.cable, 0.5, 0.5),
      band: std(C.band, 0.6, 0), wood: std(C.wood, 0.7, 0), teal: std(C.teal, 0.7, 0), ball: std(C.ball, 0.6, 0.05), rope: std(C.rope, 0.85, 0), orange: std(C.orange, 0.6, 0)
    };
    const body = new T.Group(), props = new T.Group(); S.scene.add(body); S.scene.add(props);
    const mesh = (g, m, parent) => { const o = new T.Mesh(g, typeof m === 'string' ? MAT[m] : m); o.matrixAutoUpdate = false; o.castShadow = true; o.receiveShadow = true; (parent || body).add(o); return o; };
    const hlMat = k => Ms[k] ? (Ms[k] < 1 ? MAT.hl2 : MAT.hl) : null;

    // segmento con volumen + zonas musculares iluminadas
    const GEO = {}; const geo = (name, f) => GEO[name] || (GEO[name] = f());
    function part(kind, t0, t1, extra) {
      const base = mesh(geo(kind, () => ringGeo(T, PR[kind], t0, t1, 0, TAU, kind === 'torso' ? 28 : 14, 28, 0)), 'skin');
      const list = [base];
      (ZONES[kind] || []).concat(extra || []).forEach((z, i) => {
        const m = hlMat(z[0]); if (!m) return;
        const off = (kind === 'torso' && z[2] < 0.25) || (kind === 'thigh' && z[1] < 0.3) ? 0.7 : 0.35;
        list.push(mesh(ringGeo(T, PR[kind], z[1], z[2], z[3], z[4], 10, 14, off), m));
      });
      if (kind === 'torso') list.push(mesh(geo('shortsT', () => ringGeo(T, PR.torso, -0.2, 0.22, 0, TAU, 8, 28, 0.3)), 'shorts'));
      if (kind === 'thigh') list.push(mesh(geo('shortsL', () => ringGeo(T, PR.thigh, 0, 0.3, 0, TAU, 5, 28, 0.3)), 'shorts'));
      if (kind === 'shoe') list.push(mesh(geo('sole', () => ringGeo(T, PR.shoe, 0.02, 0.98, 2.35, 3.93, 8, 8, 0.25)), 'sole'));
      return list;
    }
    const sphG = new T.SphereGeometry(1, 28, 20);
    // aductores: zona interna de cada muslo
    const inner = i => (front ? (i === 1 ? 1 : -1) : (i === 1 ? -1 : 1)) * Math.PI / 2;
    const BP = { torso: part('torso', -0.2, 1.1), neck: part('neck', 0, 1), head: mesh(sphG, 'skin'), jaw: mesh(sphG, 'skin') };
    for (const i of [1, 2]) {
      BP['th' + i] = part('thigh', 0, 1, [['adductors', 0.08, 0.7, inner(i) - 0.7, inner(i) + 0.7]]);
      BP['sh' + i] = part('shin', 0, 1); BP['ua' + i] = part('upper', 0, 1); BP['fa' + i] = part('fore', 0, 1);
      BP['ft' + i] = part('shoe', 0, 1); BP['hd' + i] = part('hand', 0, 1);
      BP['kn' + i] = mesh(sphG, 'skin'); BP['an' + i] = mesh(sphG, 'skin'); BP['el' + i] = mesh(sphG, 'skin'); BP['wr' + i] = mesh(sphG, 'skin');
      BP['dl' + i] = mesh(sphG, hlMat('delts') || 'skin'); BP['hp' + i] = mesh(sphG, 'shorts');
    }
    const tmpX = new T.Vector3(), tmpY = new T.Vector3(), tmpZ = new T.Vector3();
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
    const antOf = (a2, b2) => { if (front) return FWD; const u = [b2[0] - a2[0], b2[1] - a2[1]], l = Math.hypot(u[0], u[1]) || 1; return D2([u[1] / l, -u[0] / l]); };

    // ajusta la pose 2D → puntos 3D
    function joints(J) {
      if (front) {        // vista frontal: brazos un poco hacia afuera para que no atraviesen el tronco
        J = Object.assign({}, J);
        for (const i of [1, 2]) { const sg = Math.sign(J['S' + i][0] - J.shc[0]) || (i === 1 ? 1 : -1); for (const k of ARMK) if (J[k + i]) J[k + i] = [J[k + i][0] + sg * 3.5, J[k + i][1]]; }
      }
      return J;
    }
    const PT = (J, key) => V2(J[key], front ? 0 : zOf(key));

    function poseBody(J) {
      const hip = V2(J.hip, 0), shc = V2(J.shc, 0), up = shc.clone().sub(hip), Lt = up.length();
      const tf = front ? FWD : D2(J.n);
      frame(BP.torso, hip, up, Lt, tf);
      // cuello y cabeza
      const hd = V2(J.head, 0), nk = V2(J.neck, 0), hu = hd.clone().sub(nk).normalize();
      const nA = shc.clone().addScaledVector(up.clone().normalize(), -2), nB = nk.clone().addScaledVector(hu, 3);
      seg(BP.neck, nA, nB, tf);
      const hf = tf.clone().addScaledVector(hu, -tf.dot(hu)).normalize();
      ell(BP.head, hd.clone().addScaledVector(hf, 0.8), hu, hf, 7.2, 8.8, 8);
      ell(BP.jaw, hd.clone().addScaledVector(hu, -4.2).addScaledVector(hf, 2.6), hu, hf, 5.2, 4.2, 4.8);
      for (const i of [1, 2]) {
        const H = PT(J, 'H' + i), K = PT(J, 'kn' + i), An = PT(J, 'an' + i);
        const H2 = J['H' + i] || J.hip;
        seg(BP['th' + i], H, K, antOf(H2, J['kn' + i]));
        seg(BP['sh' + i], K, An, antOf(J['kn' + i], J['an' + i]));
        ball(BP['kn' + i], K, 5.1); ball(BP['an' + i], An, 3.2); ball(BP['hp' + i], H, 7.6);
        // pie (zapatilla)
        let he, to, fu;
        if (front) { he = An.clone().add(new T.Vector3(0, -2.4, -3.5)); to = An.clone().add(new T.Vector3((i === 1 ? 1 : -1) * 1.5, -2.4, 13)); fu = new T.Vector3(0, 1, 0); }
        else { he = PT(J, 'he' + i); to = PT(J, 'to' + i); const u = [J['to' + i][0] - J['he' + i][0], J['to' + i][1] - J['he' + i][1]], l = Math.hypot(...u) || 1; fu = D2([u[1] / l, -u[0] / l]); he.addScaledVector(fu, -1.6); to.addScaledVector(fu, -1.6); }
        seg(BP['ft' + i], he, to, fu);
        // brazo
        const Sh = PT(J, 'S' + i), E = PT(J, 'el' + i), W = PT(J, 'wr' + i), Hd = PT(J, 'hd' + i);
        const ua = antOf(J['S' + i], J['el' + i]), fa = antOf(J['el' + i], J['wr' + i]);
        seg(BP['ua' + i], Sh, E, ua); seg(BP['fa' + i], E, W, fa);
        const hv = Hd.clone().sub(W); if (hv.lengthSq() < 1) hv.copy(E).sub(W).multiplyScalar(-1);
        frame(BP['hd' + i], W, hv, Math.max(6, hv.length() + 1.5), fa);
        ball(BP['el' + i], E, 3.8); ball(BP['wr' + i], W, 2.7);
        const out = Sh.clone().sub(shc); out.y = 0; if (out.lengthSq() > 1e-4) out.normalize().multiplyScalar(1.2);
        ball(BP['dl' + i], Sh.clone().add(out).addScaledVector(up.clone().normalize(), -0.8), 6.8, 7.2, 6.8);
      }
    }

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
    function boxAB(a, b, th, wd, mat) { const m = prim('box', mat), d = b.clone().sub(a), l = d.length() || 0.01, y = d.clone().normalize(); const z = new T.Vector3().crossVectors(LAT, y).normalize(); m.matrix.makeBasis(LAT.clone().multiplyScalar(wd), y.multiplyScalar(l), z.multiplyScalar(th)).setPosition(a.clone().addScaledVector(d, 0.5)); m.matrixWorldNeedsUpdate = true; }
    function boxS(c2, along, h, lat, mat, z) { const m = prim('box', mat), c = V2(c2, z || 0); if (front) m.matrix.makeScale(along, h, lat); else m.matrix.makeScale(lat, h, along); m.matrix.setPosition(c); m.matrixWorldNeedsUpdate = true; }
    const latAt = (p2, z) => V2(p2, z);
    function at3(J, a, def) { a = a ?? def; if (typeof a === 'string') return { p: J[a], z: front ? 0 : zOf(a) }; if (typeof a === 'function') return { p: a(J), z: 0 }; return { p: a, z: 0 }; }
    const lerp = (a, b, u) => a + (b - a) * u;
    const PROP3 = {
      bench: (J, o) => {
        boxAB(V2(o.a), V2(o.b), 8, 26, 'pad');
        for (const x of (o.legs || [o.a[0] + 8, o.b[0] - 8])) { const y = o.a[1] + (o.b[1] - o.a[1]) * ((x - o.a[0]) / ((o.b[0] - o.a[0]) || 1)); for (const z of [-9, 9]) cyl(V2([x, y + 4], z), V2([x, FLOOR], z), 1.8, 'padDark'); }
        if (o.back) boxAB(V2(o.back[0]), V2(o.back[1]), 8, 26, 'pad');
      },
      box: (J, o) => boxS([o.x + o.w / 2, (o.y + FLOOR) / 2], o.w, FLOOR - o.y, 38, 'pad'),
      wall: (J, o) => boxS([o.x + (o.w || 8) / 2, (FLOOR - 40) / 2], o.w || 8, FLOOR + 40, 130, 'padDark'),
      table: (J, o) => { boxS([o.x + o.w / 2, o.y], o.w, 5, 40, 'pad'); for (const x of [o.x + 4, o.x + o.w - 4]) for (const z of [-15, 15]) cyl(V2([x, o.y], z), V2([x, FLOOR], z), 1.6, 'padDark'); },
      rails: (J, o) => { const p = at3(J, o.at, 'wr1').p; for (const z of [-24, 24]) { cyl(V2([p[0], p[1] + 2], z), V2([p[0], FLOOR], z), 1.6, 'padDark'); cyl(V2([p[0] - 22, p[1] + 2], z), V2([p[0] + 22, p[1] + 2], z), 1.8, 'metal'); } },
      twistball: (J, o) => { const c = [(J.hd1[0] + J.hd2[0]) / 2 + 3, (J.hd1[1] + J.hd2[1]) / 2 - 1]; sph(V2(c), 7 + 2 * (J.p.bs ?? 1), 'ball'); },
      hbar: (J, o) => { const hx = J.wr1 && Math.abs(J.wr1[1] - o.y) < 25 ? Math.min(o.x2, Math.max(o.x1, J.wr1[0])) : (o.x1 + o.x2) / 2; cyl(V2([hx, o.y], -42), V2([hx, o.y], 42), 1.6, 'metal'); for (const z of [-42, 42]) cyl(V2([hx, o.y], z), V2([hx, FLOOR], z), 2.2, 'padDark'); },
      pullbar: (J, o) => { cyl(V2([o.x, o.y], -40), V2([o.x, o.y], 40), 1.8, 'metal'); for (const z of [-40, 40]) cyl(V2([o.x, o.y], z), V2([o.x, FLOOR], z), 2.4, 'padDark'); },
      tower: (J, o) => { const top = o.top ?? 6; boxS([o.x, (top + FLOOR) / 2], 10, FLOOR - top, 12, 'padDark'); (o.pulleys || []).forEach(y => disc(V2([o.x, y]), LAT, 4, 3, 'metal')); },
      cable: (J, o) => { const a = at3(J, o.from), b = at3(J, o.to, 'hd1'); cyl(V2(a.p, a.z), V2(b.p, b.z), o.band ? 1.2 : 0.7, o.band ? 'band' : 'cable'); },
      band: (J, o) => { const a = at3(J, o.from), b = at3(J, o.to); cyl(V2(a.p, a.z), V2(b.p, b.z), 1.3, 'band'); },
      handle: (J, o) => { const a = at3(J, o.at, 'hd1'); sph(V2(a.p, a.z), 3, 'metal'); },
      barbell: (J, o) => {
        const p = at3(J, o.at, 'wr1').p, r = o.r || 13;
        cyl(latAt(p, -46), latAt(p, 46), 1.5, 'metal');
        for (const s of [-1, 1]) { disc(latAt(p, s * 31), LAT, r, 4.5, 'plate'); disc(latAt(p, s * 35.5), LAT, r * 0.72, 3.5, 'plate'); disc(latAt(p, s * 27.5), LAT, 2.6, 2.2, 'metal'); }
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
      pad: (J, o) => { const a = at3(J, o.a).p, b = at3(J, o.b).p; boxAB(V2(a), V2(b), o.w || 7, 24, 'pad'); },
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
      chain: (J, o) => { const a = at3(J, o.at, 'wr1'); for (const z of [-30, 30]) cyl(V2([a.p[0] + 2, a.p[1] + 8], z), V2([a.p[0] + 2, FLOOR], z), 1.8, 'metal'); }
    };
    function poseProps(J, tpl, Tm) {
      for (const k in used) used[k] = 0;
      for (const o of tpl.props || []) { const f = PROP3[o.type]; if (f) { try { f(J, o, Tm); } catch (e) { } } }
      for (const k in pool) for (let i = used[k] || 0; i < pool[k].length; i++) pool[k][i].visible = false;
    }

    // ---- cámara: encuadre según el recorrido completo del ejercicio
    const box = new T.Box3();
    for (let i = 0; i < 8; i++) { const J = joints(A.pose3(P.tplName, i / 8).J); for (const k of ['hip', 'shc', 'head', 'hd1', 'hd2', 'kn1', 'kn2', 'an1', 'an2', 'to1', 'to2', 'el1', 'el2']) if (J[k]) box.expandByPoint(PT(J, k)); }
    poseProps(joints(first.J), first.tpl, 0); props.updateMatrixWorld(true);
    if (props.children.length) { const pb = new T.Box3().setFromObject(props), lim = box.clone().expandByScalar(45); pb.intersect(lim); if (!pb.isEmpty()) box.union(pb); }
    box.expandByScalar(8); box.min.y = Math.min(box.min.y, 0);
    const ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    const rad = Math.max(size.y, Math.hypot(size.x, size.z) * 0.85) * 0.62 + 6;
    const VIEWS = front ? { front: 0, side: -90, back: 180, def: 28 } : { front: 0, side: -90, back: 180, def: -58 };
    const cam = { yaw: VIEWS.def, pitch: 12, dist: rad / Math.tan(16 * Math.PI / 180), ty: VIEWS.def, tp: 12, td: 0 };
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
      const ph = (P.clock / dur + P.off) % 1, R = A.pose3(P.tplName, ph), J = joints(R.J);
      poseBody(J); poseProps(J, R.tpl, P.clock);
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
  G.SM3D = { mount, load: loadThree };
})(window);
