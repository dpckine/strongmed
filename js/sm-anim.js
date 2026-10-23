/* =====================================================================
   StrongMed × Kin At Home — Motor de animación 2D de ejercicios
   Figura articulada (cinemática directa + inversa), implementos y
   bucle tipo GIF. Las plantillas de movimiento están en anim-templates.js
   ===================================================================== */
(function (G) {
  'use strict';

  const L = { torso: 46, neck: 7, head: 8.5, ua: 26, fa: 24, hand: 7, th: 40, sh: 40, ft: 13 };
  const FLOOR = 184;
  const RAD = Math.PI / 180;
  const OFF = [-3.5, -1.5];                 // desplazamiento del lado lejano (profundidad)
  const COL = {
    near: '#e8edf3', far: '#6b7686', hl: '#bbf426', hlFar: '#7a9c1c',
    metal: '#cbd5e1', plate: '#1d2228', plateRim: '#8a96a6', pad: '#353d48', padDark: '#262c34',
    cable: '#8a96a6', band: '#ff6b8b', wood: '#c08a55', floor: '#2a2f35'
  };

  const dir = a => [Math.sin(a * RAD), Math.cos(a * RAD)];
  const ang = (dx, dy) => Math.atan2(dx, dy) / RAD;
  const mv = (p, a, l) => { const d = dir(a); return [p[0] + d[0] * l, p[1] + d[1] * l]; };
  const lerp = (a, b, u) => a + (b - a) * u;
  const lerpAng = (a, b, u) => { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * u; };
  const f1 = n => Math.round(n * 10) / 10;
  const pt = p => f1(p[0]) + ',' + f1(p[1]);

  // Cinemática inversa de dos segmentos. s = +1/-1 elige el lado del codo/rodilla.
  function ik(P, T, l1, l2, s) {
    const dx = T[0] - P[0], dy = T[1] - P[1];
    let d = Math.hypot(dx, dy);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.05), l1 + l2 - 0.05);
    const base = ang(dx, dy);
    const c = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const a1 = base + s * Math.acos(c) / RAD;
    const J = mv(P, a1, l1);
    const T2 = mv(P, base, d);
    return [a1, ang(T2[0] - J[0], T2[1] - J[1])];
  }

  const ANGLES = new Set(['t', 'h', 'a1', 'e1', 'a2', 'e2', 'l1', 'k1', 'l2', 'k2', 'f1', 'f2', 'w1', 'w2']);
  const DEF = { view: 'side', x: 100, y: 100, t: 180, h: 0, sh: 0, pr: 0, a1: 4, e1: 8, l1: 0, k1: 0, pf: true, w1: 0, w2: 0 };

  // Grupos de campos excluyentes por extremidad
  const LIMB = {
    1: { ang: ['a1', 'e1'], tgt: ['H1', 'h1'] }, 2: { ang: ['a2', 'e2'], tgt: ['H2', 'h2'] },
    3: { ang: ['l1', 'k1'], tgt: ['F1'] }, 4: { ang: ['l2', 'k2'], tgt: ['F2'] }
  };

  // Hereda campos de la pose anterior respetando la exclusividad ángulo/objetivo
  function inherit(prev, cur) {
    const out = Object.assign({}, prev);
    for (const k in LIMB) {
      const g = LIMB[k];
      const hasAng = g.ang.some(f => f in cur), hasTgt = g.tgt.some(f => f in cur);
      if (hasAng) g.tgt.forEach(f => delete out[f]);
      if (hasTgt) { g.ang.forEach(f => delete out[f]); g.tgt.forEach(f => { if (!(f in cur)) delete out[f]; }); }
    }
    if ('S' in cur) delete out.t;
    if ('t' in cur) delete out.S;
    return Object.assign(out, cur);
  }

  // ---------------------------------------------------------------- resolver pose
  function solve(p) {
    const front = p.view === 'front';
    const hip = [p.x, p.y];
    let t = p.S ? ang(p.S[0] - p.x, p.S[1] - p.y) : p.t;
    const u = dir(t), n = dir(t - 90);           // u: a lo largo del tronco, n: perpendicular (adelante / derecha)
    let shc = mv(hip, t, L.torso);
    if (p.sh) shc = [shc[0] + u[0] * p.sh, shc[1] + u[1] * p.sh];
    if (p.pr) shc = [shc[0] + n[0] * p.pr, shc[1] + n[1] * p.pr];
    let S1, S2, H1, H2;
    if (front) {
      S1 = [shc[0] + n[0] * 13, shc[1] + n[1] * 13]; S2 = [shc[0] - n[0] * 13, shc[1] - n[1] * 13];
      H1 = [hip[0] + n[0] * 7, hip[1] + n[1] * 7]; H2 = [hip[0] - n[0] * 7, hip[1] - n[1] * 7];
    } else {
      S1 = shc; S2 = [shc[0] + OFF[0], shc[1] + OFF[1]]; H1 = hip; H2 = [hip[0] + OFF[0], hip[1] + OFF[1]];
    }
    const mirrorPt = q => { // reflejo respecto del eje del tronco (vista frontal)
      const v = [q[0] - hip[0], q[1] - hip[1]]; const along = v[0] * u[0] + v[1] * u[1];
      return [hip[0] + 2 * along * u[0] - v[0], hip[1] + 2 * along * u[1] - v[1]];
    };
    const r = { t, front, hip, shc, S1, S2, H1, H2, u, n };

    // ---- brazos
    const arm = i => {
      const root = i === 1 ? S1 : S2;
      let sp = { a: p['a' + i], e: p['e' + i], H: p['H' + i], h: p['h' + i], s: p['e' + i + 's'], us: p['us' + i], fs: p['fs' + i] };
      if (i === 2 && sp.a === undefined && !sp.H && !sp.h) {           // copia del brazo cercano
        const q = { a: p.a1, e: p.e1, H: p.H1, h: p.h1, s: p.e1s, us: p.us1, fs: p.fs1 };
        if (front) {
          q.a = q.a !== undefined ? 2 * t - q.a : undefined; q.e = q.e !== undefined ? 2 * t - q.e : undefined;
          if (q.H) q.H = mirrorPt(q.H); if (q.h) q.h = [q.h[0], -q.h[1]]; q.s = -(q.s ?? 1);
        } else if (q.H) q.H = [q.H[0] + OFF[0], q.H[1] + OFF[1]];
        sp = q;
      }
      const us = sp.us ?? 1, fs = sp.fs ?? 1;
      let a = sp.a, e = sp.e, tgt = null;
      if (sp.H) tgt = sp.H;
      else if (sp.h) tgt = [root[0] + u[0] * sp.h[0] + n[0] * sp.h[1], root[1] + u[1] * sp.h[0] + n[1] * sp.h[1]];
      if (tgt) { const s = sp.s ?? (front ? (i === 1 ? 1 : -1) : -1);[a, e] = ik(root, tgt, L.ua * us, L.fa * fs, s); }
      if (a === undefined) { a = DEF.a1; e = DEF.e1; }
      const el = mv(root, a, L.ua * us), wr = mv(el, e, L.fa * fs);
      let hd = mv(wr, e + (p['w' + i] || 0), L.hand * Math.min(1, fs + 0.3));
      // mano apoyada en el suelo: palma plana y dedos hacia adelante
      if (!front && tgt && tgt[1] >= 175) hd = [wr[0] + L.hand, Math.min(wr[1], FLOOR - 2)];
      // la mano no atraviesa el suelo: gira en la muñeca hasta apoyarse
      else if (!front && hd[1] > FLOOR - 1.5 && wr[1] < FLOOR - 1.5) {
        const lh = Math.hypot(hd[0] - wr[0], hd[1] - wr[1]), c = Math.acos(Math.max(-1, Math.min(1, (FLOOR - 1.5 - wr[1]) / lh))) / RAD;
        hd = mv(wr, hd[0] >= wr[0] ? c : -c, lh);
      }
      r['a' + i] = a; r['e' + i] = e; r['el' + i] = el; r['wr' + i] = wr; r['hd' + i] = hd; r['tg' + i] = tgt || wr;
    };
    // ---- piernas
    const leg = i => {
      const j = i === 1 ? 1 : 2, root = j === 1 ? H1 : H2;
      let sp = { l: p['l' + j], k: p['k' + j], F: p['F' + j], s: p['k' + j + 's'], ts: p['ts' + j], ss: p['ss' + j], f: p['f' + j] };
      if (j === 2 && sp.l === undefined && !sp.F) {
        const q = { l: p.l1, k: p.k1, F: p.F1, s: p.k1s, ts: p.ts1, ss: p.ss1, f: p.f2 ?? p.f1 };
        if (front) {
          q.l = q.l !== undefined ? 360 - q.l : undefined; q.k = q.k !== undefined ? 360 - q.k : undefined;
          if (q.F) q.F = [2 * hip[0] - q.F[0], q.F[1]]; q.s = -(q.s ?? 1);
        } else if (q.F) q.F = [q.F[0] + OFF[0], q.F[1]];
        sp = q;
      }
      const ts = sp.ts ?? 1, ss = sp.ss ?? 1;
      let l = sp.l, k = sp.k;
      if (sp.F) { const s = sp.s ?? (front ? (j === 1 ? 1 : -1) : 1);[l, k] = ik(root, sp.F, L.th * ts, L.sh * ss, s); }
      if (l === undefined) { l = 0; k = 0; }
      let kn = mv(root, l, L.th * ts), an = mv(kn, k, L.sh * ss);
      if (front && sp.F) {          // en vista frontal la rodilla se proyecta hacia la cámara
        const d = Math.hypot(sp.F[0] - root[0], sp.F[1] - root[1]);
        if (d < L.th + L.sh - 0.5) {
          const v = [(sp.F[0] - root[0]) / d, (sp.F[1] - root[1]) / d], side = j === 1 ? 1 : -1;
          const sag = Math.sqrt(Math.max(0, L.th * L.th - d * d / 4)) * 0.22;
          const perp = [v[1] * side, -v[0] * side];
          kn = [root[0] + v[0] * d * 0.5 + perp[0] * sag * (perp[0] * side > 0 ? 1 : -1), root[1] + v[1] * d * 0.5 + perp[1] * sag * (perp[0] * side > 0 ? 1 : -1)];
          an = sp.F; l = ang(kn[0] - root[0], kn[1] - root[1]); k = ang(an[0] - kn[0], an[1] - kn[1]);
        }
      }
      let fa;
      if (front) fa = (j === 1 ? 1 : -1) * 70 + (sp.f !== undefined && p.pf === false ? sp.f - 85 : 0) + (p.pf === false ? k : 0);
      else fa = p.pf === false ? k + (sp.f ?? 85) : (sp.f ?? 78);
      // la punta del pie no atraviesa el suelo: el pie gira en el tobillo hasta apoyarse
      if (!front && an[1] < FLOOR - 2 && an[1] + Math.cos(fa * RAD) * L.ft > FLOOR - 2) {
        const c = Math.acos(Math.max(-1, Math.min(1, (FLOOR - 2 - an[1]) / L.ft))) / RAD;
        fa = Math.sin(fa * RAD) >= 0 ? c : -c;
      }
      const toe = mv(an, fa, front ? 7 : L.ft), heel = mv(an, fa + 180, front ? 1 : 3.5);
      r['l' + j] = l; r['k' + j] = k; r['kn' + j] = kn; r['an' + j] = an; r['to' + j] = toe; r['he' + j] = heel;
    };
    arm(1); arm(2); leg(1); leg(2);
    r.head = mv(shc, t + (p.h || 0), L.neck + L.head);
    r.neck = mv(shc, t + (p.h || 0), L.neck);
    r.hipTop = mv(hip, t - 90, 9);
    r.p = p;
    return r;
  }

  // ---------------------------------------------------------------- interpolación
  function resolvedSpec(p) {   // añade ángulos resueltos para poder mezclar FK/IK
    const r = solve(p);
    const far = {};
    if (!('a2' in p) && !p.H2 && !p.h2) Object.assign(far, { us2: p.us1, fs2: p.fs1, w2: p.w1 });
    if (!('l2' in p) && !p.F2) Object.assign(far, { ts2: p.ts1, ss2: p.ss1, f2: p.f2 ?? p.f1 });
    for (const k in far) if (far[k] === undefined) delete far[k];
    const out = Object.assign({}, p, far, { t: r.t, a1: r.a1, e1: r.e1, a2: r.a2, e2: r.e2, l1: r.l1, k1: r.k1, l2: r.l2, k2: r.k2 });
    // ángulo del pie explícito: si falta en una pose, la mezcla no salta al valor de la otra
    const fd = p.pf === false ? 85 : 78;
    if (out.f1 === undefined) out.f1 = fd;
    if (out.f2 === undefined) out.f2 = ('l2' in p || p.F2) ? fd : out.f1;
    // vista lateral: si la extremidad lejana copia a la cercana que va a un apoyo (mano o pie fijos),
    // sigue copiándola en la mezcla; sus ángulos quedan aparte solo para transiciones con poses que sí los definen
    if (p.view !== 'front') {
      if (!('a2' in p) && !p.H2 && !p.h2 && (p.H1 || p.h1)) { out._a2 = out.a2; out._e2 = out.e2; delete out.a2; delete out.e2; }
      if (!('l2' in p) && !p.F2 && p.F1) { out._l2 = out.l2; out._k2 = out.k2; delete out.l2; delete out.k2; }
    }
    if (p.view === 'front') {      // en frontal se conservan los objetivos de pie (rodilla proyectada)
      if (p.F1) { delete out.l1; delete out.k1; }
      if (p.F2 || (p.F1 && !('l2' in p))) { delete out.l2; delete out.k2; }
    }
    return out;
  }
  const SCALE = /^(us|fs|ts|ss)[12]$/;
  function mix(A, B, u) {
    for (const k of ['a2', 'e2', 'l2', 'k2']) {
      if (A[k] === undefined && B[k] !== undefined && A['_' + k] !== undefined) A = Object.assign({}, A, { [k]: A['_' + k] });
      if (B[k] === undefined && A[k] !== undefined && B['_' + k] !== undefined) B = Object.assign({}, B, { [k]: B['_' + k] });
    }
    const out = {};
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
    for (const k of keys) {
      let a = A[k], b = B[k];
      if (SCALE.test(k)) { a = a ?? 1; b = b ?? 1; }     // escorzo ausente = 1 (no salta)
      if (a === undefined) { out[k] = b; continue; }
      if (b === undefined) { out[k] = a; continue; }
      if (typeof a === 'number' && typeof b === 'number') out[k] = ANGLES.has(k) ? lerpAng(a, b, u) : lerp(a, b, u);
      else if (Array.isArray(a) && Array.isArray(b)) out[k] = a.map((v, i) => lerp(v, b[i], u));
      else out[k] = u < 0.5 ? a : b;
    }
    // vista lateral: cada articulación se interpola en su rango anatómico (no por el camino más corto),
    // así el brazo sube por delante y la pierna no "da la vuelta"
    if (A.view !== 'front' && B.view !== 'front' && typeof A.t === 'number' && typeof B.t === 'number') {
      const nrm = (x, lo) => ((x - lo) % 360 + 360) % 360 + lo;
      const T = out.t;
      for (const i of [1, 2]) {
        const a = 'a' + i, e = 'e' + i, l = 'l' + i, kk = 'k' + i;
        if ([A[a], B[a], A[e], B[e]].every(v => typeof v === 'number')) {
          const ra = lerp(nrm(A[a] - A.t + 180, -110), nrm(B[a] - B.t + 180, -110), u);
          const re = lerp(nrm(A[e] - A[a], -70), nrm(B[e] - B[a], -70), u);
          out[a] = ra + T - 180; out[e] = out[a] + re;
        }
        if ([A[l], B[l], A[kk], B[kk]].every(v => typeof v === 'number')) {
          const rl = lerp(nrm(A[l] - A.t + 180, -130), nrm(B[l] - B.t + 180, -130), u);
          const rk = lerp(nrm(A[kk] - A[l], -200), nrm(B[kk] - B[l], -200), u);
          out[l] = rl + T - 180; out[kk] = out[l] + rk;
        }
      }
    }
    for (const k in LIMB) {           // objetivo presente solo en una pose -> usar ángulos
      for (const f of LIMB[k].tgt) if (!(f in A) || !(f in B)) delete out[f];
    }
    if (!('S' in A) || !('S' in B)) delete out.S;
    return out;
  }

  const ease = {
    sine: u => 0.5 - Math.cos(Math.PI * u) / 2,
    linear: u => u,
    out: u => 1 - (1 - u) * (1 - u),
    in: u => u * u
  };

  // Prepara una plantilla: hereda campos y precalcula specs resueltos
  // ritmo uniforme para ejercicios de fuerza de 2 posiciones: pausa · movimiento · pausa · movimiento
  // la fase concéntrica (vencer la carga) es más rápida que la excéntrica (bajar controlado), como en un entrenamiento real
  const TEMPO = { hold: 0.35, move: 1.45, con: 1.1, ecc: 1.8 };
  const LOADS = /^(barbell|db|kb|plate|chain|platform|landmine)$/;
  // +1: ir de la pose 0 a la 1 vence la carga (sube el peso, se estira el cable o sube el cuerpo); -1: al revés; 0: no se sabe
  function liftDir(tpl, J0, J1) {
    let w = 0, any = false;
    const pa = (J, a) => { try { return at(J, a); } catch (e) { return null; } };
    for (const o of tpl.props || []) {
      if (LOADS.test(o.type)) {
        const d = o.at || (o.type === 'barbell' ? 'wr1' : 'hd1'), a = pa(J0, d), b = pa(J1, d);
        if (Array.isArray(a) && Array.isArray(b)) { w += a[1] - b[1]; any = true; }
      } else if ((o.type === 'cable' || o.type === 'band') && o.from) {
        const a0 = pa(J0, o.from), b0 = pa(J0, o.to || 'hd1'), a1 = pa(J1, o.from), b1 = pa(J1, o.to || 'hd1');
        if ([a0, b0, a1, b1].every(Array.isArray)) { w += Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) - Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); any = true; }
      }
    }
    if (any) return Math.abs(w) > 2 ? Math.sign(w) : 0;
    const com = J => 0.08 * J.head[1] + 0.5 * (J.hip[1] + J.shc[1]) / 2 + 0.2 * (J.hip[1] + J.kn1[1]) / 2 + 0.09 * (J.kn1[1] + J.an1[1]) / 2 + 0.1 * (J.S1[1] + J.wr1[1]) / 2;
    const dy = com(J0) - com(J1);
    return Math.abs(dy) > 4 ? Math.sign(dy) : 0;
  }
  function compile(tpl) {
    if (tpl._c) return tpl._c;
    if (tpl.frames && tpl.frames.length === 2 && !tpl.pulse && !tpl.free && (tpl.dur === undefined || tpl.dur >= 1.8)) {
      tpl._raw = tpl.frames.slice();
      const [f0, f1] = tpl.frames;
      const p0 = inherit(Object.assign({}, DEF, tpl.base || {}), f0), p1 = inherit(p0, f1);
      let up = 0; try { up = liftDir(tpl, solve(p0), solve(p1)); } catch (e) { }
      const m01 = up > 0 ? TEMPO.con : up < 0 ? TEMPO.ecc : TEMPO.move, m10 = up > 0 ? TEMPO.ecc : up < 0 ? TEMPO.con : TEMPO.move;
      tpl._up = up;
      tpl = Object.assign(tpl, { frames: [Object.assign({}, f0, { d: TEMPO.hold }), Object.assign({}, f0, { d: m01 }), Object.assign({}, f1, { d: TEMPO.hold }), Object.assign({}, f1, { d: m10 })], dur: 2 * TEMPO.hold + m01 + m10, ease: 'sine' });
    }
    const base = Object.assign({}, DEF, tpl.base || {});
    let prev = base;
    const frames = tpl.frames.map(f => { prev = inherit(prev, f); return prev; });
    const specs = frames.map(f => resolvedSpec(f));
    const w = tpl.frames.map(f => f.d || 1);
    const total = w.reduce((a, b) => a + b, 0);
    tpl._c = { specs, w, total, dur: tpl.dur || 2.6, ease: ease[tpl.ease || 'sine'], cut: tpl.frames.map(f => !!f.cut), frames };
    return tpl._c;
  }

  function poseAt(tpl, phase) {
    const c = compile(tpl);
    const n = c.specs.length;
    if (n === 1) return { spec: c.specs[0], seg: 0, u: 0 };
    let x = (phase % 1) * c.total, i = 0;
    while (i < n - 1 && x >= c.w[i]) { x -= c.w[i]; i++; }
    const j = (i + 1) % n;
    let u = x / c.w[i];
    if (c.cut[j]) u = u < 0.92 ? 0 : 1;       // salto instantáneo
    const fe = c.frames[i].ease ? ease[c.frames[i].ease] : c.ease;
    u = fe(Math.min(1, Math.max(0, u)));
    return { spec: mix(c.specs[i], c.specs[j], u), seg: i, u };
  }

  // ---------------------------------------------------------------- contacto con el suelo
  // Un pie o una mano apoyados no se deslizan: durante cada apoyo el punto de contacto queda fijo
  // y la pierna o el brazo se reajustan por cinemática inversa (como ocurre en la realidad).
  const LOCK_N = 96, CONTACT = FLOOR - 2.5;
  const CHAINS = [['an1', 'H1', 'kn1', ['to1', 'he1']], ['an2', 'H2', 'kn2', ['to2', 'he2']], ['wr1', 'S1', 'el1', ['hd1']], ['wr2', 'S2', 'el2', ['hd2']]];
  function lockTrack(tpl) {
    if (tpl._lk !== undefined) return tpl._lk;
    tpl._lk = null;
    if (solve(poseAt(tpl, 0).spec).front) return null;
    const Js = []; for (let i = 0; i < LOCK_N; i++) Js.push(solve(poseAt(tpl, i / LOCK_N).spec));
    const tr = {};
    for (const [eff, , , pts] of CHAINS) {
      const cp = Js.map(J => { let b = null; for (const k of pts) if (J[k] && J[k][1] > CONTACT && (!b || J[k][1] > J[b][1] + 0.5)) b = k; return b; });
      if (cp.every(c => !c)) continue;
      const d = new Array(LOCK_N).fill(0);
      let st = cp.findIndex((c, i) => c && !cp[(i - 1 + LOCK_N) % LOCK_N]);
      const all = st < 0; if (all) st = 0;
      for (let n = 0; n < LOCK_N; n++) {
        const j = (st + n) % LOCK_N;
        if (!cp[j] || (n > 0 && cp[(j - 1 + LOCK_N) % LOCK_N])) continue;     // solo al inicio de cada apoyo
        const run = []; let k = j; while (cp[k] && run.length < LOCK_N) { run.push(k); k = (k + 1) % LOCK_N; }
        let mx = 0, pk = cp[j], ref = Js[j][pk][0], pv = 0;
        const dl = run.map(q => { if (cp[q] !== pk) { pk = cp[q]; ref = Js[q][pk][0] + pv; } pv = ref - Js[q][pk][0]; mx = Math.max(mx, Math.abs(pv)); return pv; });
        if (mx > 16) continue;            // reubicación grande: es un paso, no un apoyo fijo
        run.forEach((q, m) => { d[q] = dl[m]; });
        if (!all) for (let m = 1; m <= 6; m++) { const q = (run[run.length - 1] + m) % LOCK_N; if (cp[q]) break; d[q] = pv * (1 - m / 7); }
      }
      if (d.some(v => Math.abs(v) > 0.3)) { d.cp = cp; tr[eff] = d; }
    }
    return (tpl._lk = Object.keys(tr).length ? tr : null);
  }
  function lockJ(tpl, phase, J) {
    const tr = lockTrack(tpl); if (!tr || J.front) return J;
    const x = ((phase % 1) + 1) % 1 * LOCK_N, i = Math.floor(x) % LOCK_N, u = x - Math.floor(x);
    const ikPt = (R, T, l1, l2, s) => mv(R, ik(R, T, l1, l2, s)[0], l1);
    for (const [eff, root, mid, pts] of CHAINS) {
      const d = tr[eff]; if (!d) continue;
      const dx = d[i] + (d[(i + 1) % LOCK_N] - d[i]) * u; if (Math.abs(dx) < 0.05) continue;
      const R = J[root], E = J[eff], M = J[mid], l1 = Math.hypot(M[0] - R[0], M[1] - R[1]), l2 = Math.hypot(E[0] - M[0], E[1] - M[1]);
      let T = [E[0] + dx, E[1]], P = null;
      // apoyado en la punta del pie: los dedos quedan fijos y el pie gira (el tobillo sube o baja), la pierna no se dobla
      if (eff[0] === 'a' && d.cp[i] === 'to' + eff[2]) {
        const to = J['to' + eff[2]], lf = Math.hypot(to[0] - E[0], to[1] - E[1]), r = Math.hypot(E[0] - R[0], E[1] - R[1]);
        P = [to[0] + dx, to[1]];
        const q = Math.hypot(P[0] - R[0], P[1] - R[1]);
        if (q < r + lf && q > Math.abs(r - lf)) {
          const a = (r * r - lf * lf + q * q) / (2 * q), h = Math.sqrt(Math.max(0, r * r - a * a)), ux = (P[0] - R[0]) / q, uy = (P[1] - R[1]) / q;
          const c1 = [R[0] + ux * a - uy * h, R[1] + uy * a + ux * h], c2 = [R[0] + ux * a + uy * h, R[1] + uy * a - ux * h];
          const d1 = Math.hypot(c1[0] - T[0], c1[1] - T[1]), d2 = Math.hypot(c2[0] - T[0], c2[1] - T[1]);
          T = d1 < d2 ? c1 : c2;                // la solución más cercana: el talón sigue detrás de los dedos
        } else P = null;
      }
      const ma = ikPt(R, T, l1, l2, 1), mb = ikPt(R, T, l1, l2, -1);
      const nm = Math.hypot(ma[0] - M[0], ma[1] - M[1]) < Math.hypot(mb[0] - M[0], mb[1] - M[1]) ? ma : mb;
      const ne = mv(nm, ang(T[0] - nm[0], T[1] - nm[1]), l2), ddx = ne[0] - E[0], ddy = ne[1] - E[1];
      J[mid] = nm; J[eff] = ne;
      if (P) {                       // pie girado sobre los dedos
        const k = eff[2], lf = Math.hypot(P[0] - ne[0], P[1] - ne[1]) || 1;
        J['to' + k] = P; J['he' + k] = [ne[0] - (P[0] - ne[0]) / lf * 3.5, ne[1] - (P[1] - ne[1]) / lf * 3.5];
      } else for (const k of pts) if (J[k]) J[k] = [J[k][0] + ddx, J[k][1] + ddy];
      if (eff[0] === 'w') { const k = 'tg' + eff[2]; if (J[k]) J[k] = [J[k][0] + ddx, J[k][1] + ddy]; }
    }
    return J;
  }

  // ---------------------------------------------------------------- dibujo
  const line = (a, b, w, c, extra = '') => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
  const poly = (pts, w, c, extra = '') => `<polyline points="${pts.map(pt).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const circ = (p, r, fill, stroke = 'none', sw = 0, extra = '') => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;

  // ---------------------------------------------------------------- figura tipo maniquí
  // Músculos que se pueden iluminar (en verde): quads, hams, glutes, adductors, hipflex, calves, tib,
  // chest, abs, lats, upperback, lowback, delts, biceps, triceps, forearm, neck.
  // Claves antiguas (th, sh, ft, ua, fa, torso, head) se traducen a grupos de músculos.
  const OLDHL = { th: ['quads', 'hams'], sh: ['calves', 'tib'], ft: ['calves'], ua: ['biceps', 'triceps', 'delts'], fa: ['forearm'], torso: ['chest', 'abs'], head: ['neck'] };
  const SKIN = { near: '#e9edf2', nearSh: '#b8c0cb', far: '#7d8796', farSh: '#5e6875', line: '#0c0d0e' };
  function muscleSet(hl) {
    const M = {};
    for (const k in hl || {}) { const v = hl[k]; if (!v) continue; (OLDHL[k] || [k]).forEach(m => { M[m] = Math.max(M[m] || 0, v === 2 ? 0.45 : 1); }); }
    return M;
  }
  const P = (p) => f1(p[0]) + ' ' + f1(p[1]);
  const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  // segmento con volumen: A→B con anchos wa (inicio), wm (vientre, en fracción fm) y wb (fin).
  // "ant" = lado anterior (+1 / -1 según la normal). Devuelve caminos completo / mitad anterior / mitad posterior.
  function limb(A, B, wa, wm, wb, fm, antBulge, postBulge) {
    const d = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(d[0], d[1]) || 1, u = [d[0] / L, d[1] / L];
    const n = [u[1], -u[0]];          // normal: lado "anterior" (rotar 90° a la izquierda en pantalla)
    const M = add(A, u, L * fm);
    const a1 = add(A, n, wa / 2), a2 = add(A, n, -wa / 2), b1 = add(B, n, wb / 2), b2 = add(B, n, -wb / 2);
    const m1 = add(M, n, wm / 2 * (1 + antBulge)), m2 = add(M, n, -wm / 2 * (1 + postBulge));
    const c1a = add(m1, u, -L * 0.18), c1b = add(m1, u, L * 0.18), c2a = add(m2, u, -L * 0.18), c2b = add(m2, u, L * 0.18);
    const front = `M${P(A)} L${P(a1)} C${P(c1a)} ${P(c1a)} ${P(m1)} C${P(c1b)} ${P(c1b)} ${P(b1)} L${P(B)} Z`;
    const back = `M${P(A)} L${P(a2)} C${P(c2a)} ${P(c2a)} ${P(m2)} C${P(c2b)} ${P(c2b)} ${P(b2)} L${P(B)} Z`;
    const full = `M${P(a1)} C${P(c1a)} ${P(c1a)} ${P(m1)} C${P(c1b)} ${P(c1b)} ${P(b1)} A${f1(wb / 2)} ${f1(wb / 2)} 0 0 1 ${P(b2)} C${P(c2b)} ${P(c2b)} ${P(m2)} C${P(c2a)} ${P(c2a)} ${P(a2)} A${f1(wa / 2)} ${f1(wa / 2)} 0 0 1 ${P(a1)} Z`;
    return { full, front, back, n };
  }
  // pinta un segmento: base + sombra posterior + músculos iluminados (anterior/posterior)
  // pv: true = vista frontal; 'front' / 'back' = figura girada de frente o de espalda; 'mirror' = lateral visto desde el otro lado
  function paint(seg, far, Ms, antKey, postKey, pv) {
    const base = far ? SKIN.far : SKIN.near, shade = far ? SKIN.farSh : SKIN.nearSh;
    let s = `<path d="${seg.full}" fill="${base}"/>`;
    s += `<path d="${pv === 'mirror' ? seg.front : seg.back}" fill="${shade}" opacity=".55"/>`;
    const lit = (key, path) => { const v = key && Ms[key]; if (!v) return ''; return `<path d="${path}" fill="${far ? COL.hlFar : COL.hl}" opacity="${v < 1 ? 0.55 : 1}"${v >= 1 && !far ? ' filter="url(#glow)"' : ''}/>`; };
    if (pv === true) { const k = [].concat(antKey || [], postKey || []).find(x => Ms[x]); if (k) s += lit(k, seg.full); }
    else if (pv === 'front' || pv === 'back') { const k = [].concat(pv === 'front' ? antKey || [] : postKey || []).find(x => Ms[x]); if (k) s += lit(k, seg.full); }
    else {
      const A = pv === 'mirror' ? postKey : antKey, B = pv === 'mirror' ? antKey : postKey;
      [].concat(A || []).forEach(k => { s += lit(k, seg.front); }); [].concat(B || []).forEach(k => { s += lit(k, seg.back); });
    }
    return s;
  }
  const pvOf = J => J.front ? true : (J.pm || false);
  function drawLeg(J, i, far, Ms) {
    const H = J['H' + i] || J.hip, K = J['kn' + i], A = J['an' + i];
    const th = limb(H, K, 15, 15.5, 10.5, 0.4, 0.12, 0.08);
    const sh = limb(K, A, 10, 10.5, 6.5, 0.3, 0.02, 0.28);
    let s = paint(th, far, Ms, ['quads', 'hipflex'], ['hams', 'adductors'], pvOf(J));
    s += paint(sh, far, Ms, ['tib'], ['calves'], pvOf(J));
    if (!J.front && (J.rot ? J.rot.glv[i] : i === 1)) {   // glúteo: volumen posterior de la cadera
      const g = J.rot ? J.rot.gl[i] : add(add(J.hip, J.n, -6.5), J.u, -1.5), gl = Ms.glutes;
      const rx = J.rot ? 4.5 + 3.7 * Math.abs(J.rot.c) : 8.2, fill = gl ? (far ? COL.hlFar : COL.hl) : (far ? SKIN.far : SKIN.near);
      s += `<ellipse cx="${f1(g[0])}" cy="${f1(g[1])}" rx="${f1(rx)}" ry="9" transform="rotate(${f1(-(J.t - 180))} ${f1(g[0])} ${f1(g[1])})" fill="${fill}" opacity="${gl && gl < 1 ? .7 : 1}"${gl >= 1 && !far ? ' filter="url(#glow)"' : ''}/>`;
    }
    // pie (zapatilla)
    const he = J['he' + i], to = J['to' + i];
    s += `<path d="${limb(he, to, 6.5, 6, 5, 0.5, 0, 0).full}" fill="${far ? '#4a525e' : '#c9d0da'}"/>`;
    s += circ(K, 5.2, far ? SKIN.far : SKIN.near);
    return s;
  }
  function drawArm(J, i, far, Ms) {
    const S = J['S' + i], E = J['el' + i], W = J['wr' + i], Hd = J['hd' + i];
    const ua = limb(S, E, 11.5, 10.5, 7.5, 0.35, 0.18, 0.14);
    const fa = limb(E, W, 7.5, 8, 5.5, 0.28, 0.1, 0.06);
    let s = paint(ua, far, Ms, ['biceps'], ['triceps'], pvOf(J));
    s += paint(fa, far, Ms, ['forearm'], ['forearm'], pvOf(J));
    s += circ(E, 3.9, far ? SKIN.far : SKIN.near);
    // mano: puño redondeado orientado según la muñeca
    s += `<path d="${limb(W, Hd, 6, 6.5, 5.5, 0.5, 0, 0).full}" fill="${far ? SKIN.far : '#dfe4ea'}"/>`;
    // deltoides (cúpula del hombro)
    const dl = Ms.delts;
    s += `<circle cx="${f1(S[0])}" cy="${f1(S[1])}" r="6.6" fill="${dl ? (far ? COL.hlFar : COL.hl) : (far ? SKIN.far : SKIN.near)}"${dl && !far ? ' filter="url(#glow)"' : ''} opacity="${dl && dl < 1 ? 0.6 : 1}"/>`;
    return s;
  }
  function drawTorso(J, Ms) {
    const u = J.u, n = J.n, hip = J.hip;
    const at = (f, off) => { const c = mv(hip, J.t, L.torso * f); return [c[0] + n[0] * off, c[1] + n[1] * off]; };
    let s = '';
    if (J.front) {
      const nW = [J.S1[0] - J.S2[0], J.S1[1] - J.S2[1]], lw = Math.hypot(...nW) || 1, side = [nW[0] / lw, nW[1] / lw];
      const C = f => mv(hip, J.t, L.torso * f), w = (f, k) => add(C(f), side, k);
      const pts = [w(1.0, 16), w(0.82, 16.5), w(0.5, 11.5), w(0.12, 10), w(-0.08, 11), w(-0.08, -11), w(0.12, -10), w(0.5, -11.5), w(0.82, -16.5), w(1.0, -16)];
      s += `<path d="M${pts.map(P).join(' L')} Z" fill="${SKIN.near}" stroke="${SKIN.near}" stroke-width="3" stroke-linejoin="round"/>`;
      const reg = (key, a, b, k1, k2) => { const v = Ms[key]; if (!v) return ''; const q = [w(a, k1), w(b, k2), w(b, -k2), w(a, -k1)]; return `<path d="M${q.map(P).join(' L')} Z" fill="${COL.hl}" opacity="${v < 1 ? .55 : 1}" stroke="${COL.hl}" stroke-width="2" stroke-linejoin="round"${v >= 1 ? ' filter="url(#glow)"' : ''}/>`; };
      s += reg('chest', 0.62, 0.92, 13, 15) + reg('abs', 0.12, 0.58, 8.5, 10) + reg('lats', 0.45, 0.8, 11.5, 15.5) + reg('upperback', 0.85, 1.0, 15, 15) + reg('lowback', 0.05, 0.35, 9.5, 9.5);
      s += `<line x1="${f1(C(0.62)[0])}" y1="${f1(C(0.62)[1])}" x2="${f1(C(0.12)[0])}" y2="${f1(C(0.12)[1])}" stroke="#0c0d0e" stroke-opacity=".18" stroke-width="1"/>`;
      return s;
    }
    // vista lateral: pecho y abdomen adelante, dorsal/espalda y glúteo atrás
    const F = [[1.0, 5], [0.88, 7.5], [0.7, 8.6], [0.52, 6.6], [0.3, 6.2], [0.08, 6.8], [-0.1, 5.5]];
    const Bk = [[-0.1, -7], [0.05, -10.5], [0.22, -7.5], [0.45, -6.4], [0.7, -7.6], [0.9, -7], [1.0, -5.5]];
    const pts = [...F.map(([f, o]) => at(f, o)), ...Bk.map(([f, o]) => at(f, o))];
    const smooth = ps => { let d = `M${P(ps[0])}`; for (let i = 1; i < ps.length; i++) { const p0 = ps[i - 1], p1 = ps[i]; d += ` Q${P(p0)} ${P([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2])}`; } return d + ` L${P(ps[ps.length - 1])} Z`; };
    s += `<path d="${smooth(pts)}" fill="${SKIN.near}" stroke="${SKIN.near}" stroke-width="2.5" stroke-linejoin="round"/>`;
    // sombra posterior
    s += `<path d="${smooth([at(1.0, 0), ...Bk.slice().reverse().map(([f, o]) => at(f, o)), at(-0.1, 0)])}" fill="${SKIN.nearSh}" opacity=".45"/>`;
    const region = (key, list) => { const v = Ms[key]; if (!v) return ''; return `<path d="${smooth(list.map(([f, o]) => at(f, o)))}" fill="${COL.hl}" opacity="${v < 1 ? .55 : 1}"${v >= 1 ? ' filter="url(#glow)"' : ''}/>`; };
    s += region('chest', [[0.95, 0.5], [0.9, 7], [0.72, 8.8], [0.56, 6.8], [0.56, 0.5]]);
    s += region('abs', [[0.54, 0.5], [0.54, 6.4], [0.3, 6.3], [0.1, 6.8], [0.06, 0.5]]);
    s += region('lats', [[0.85, -0.5], [0.85, -7.1], [0.66, -7.6], [0.42, -6.3], [0.36, -0.5]]);
    s += region('upperback', [[1.0, -0.5], [1.0, -5.6], [0.9, -7.1], [0.76, -7.3], [0.76, -0.5]]);
    s += region('lowback', [[0.4, -0.5], [0.4, -6.4], [0.24, -7.4], [0.12, -8.2], [0.12, -0.5]]);
    s += region('glutes', [[0.12, -0.5], [0.1, -9], [0.0, -10.6], [-0.1, -7.2], [-0.1, -0.5]]);
    return s;
  }
  function drawHead(J, Ms) {
    let s = '';
    const nk = Ms.neck;
    s += line(J.shc, J.neck, 7.5, nk ? COL.hl : SKIN.near, nk ? 'filter="url(#glow)"' : '');
    s += `<ellipse cx="${f1(J.head[0])}" cy="${f1(J.head[1])}" rx="8" ry="9" transform="rotate(${f1(-(J.t + (J.p.h || 0) - 180))} ${f1(J.head[0])} ${f1(J.head[1])})" fill="${SKIN.near}"/>`;
    if (!J.front && !(J.rot && Math.abs(J.rot.c) < 0.5)) {
      const fwd = dir(J.t + (J.p.h || 0) - 90); if (J.rot) fwd[0] *= J.rot.c;
      s += `<ellipse cx="${f1(J.head[0] - fwd[0] * 1.5)}" cy="${f1(J.head[1] - fwd[1] * 1.5 - 0.5)}" rx="1.8" ry="2.4" fill="${SKIN.nearSh}"/>`;   // oreja
    }
    return s;
  }
  function figure(J, hl, layer) {
    const Ms = J._ms || (J._ms = muscleSet(hl));
    if (J.rot) {                  // figura girada: el lado más cercano a la cámara se dibuja encima
      const R = J.rot, nr = R.near, fr = 3 - nr, flat = Math.abs(R.c) < 0.35;
      if (layer === 'far') return flat ? drawLeg(J, fr, false, Ms) + drawLeg(J, nr, false, Ms) : drawLeg(J, fr, true, Ms) + drawArm(J, fr, true, Ms);
      if (layer === 'body') return drawTorso3D(J, Ms) + drawHead(J, Ms);
      if (layer === 'near') return flat ? '' : drawLeg(J, nr, false, Ms);
      if (layer === 'arm') return flat ? drawArm(J, fr, false, Ms) + drawArm(J, nr, false, Ms) : drawArm(J, nr, false, Ms);
      return '';
    }
    if (J.front) {
      if (layer === 'far') return drawLeg(J, 2, false, Ms) + drawLeg(J, 1, false, Ms);
      if (layer === 'body') return drawTorso(J, Ms) + drawHead(J, Ms);
      if (layer === 'near') return drawArm(J, 2, false, Ms) + drawArm(J, 1, false, Ms);
      return '';
    }
    if (layer === 'far') return drawLeg(J, 2, true, Ms) + drawArm(J, 2, true, Ms);
    if (layer === 'body') return drawTorso(J, Ms) + drawHead(J, Ms);
    if (layer === 'near') return drawLeg(J, 1, false, Ms);
    if (layer === 'arm') return drawArm(J, 1, false, Ms);
    return '';
  }

  // ---------------------------------------------------------------- giro (ver ambos lados)
  // La figura lateral se gira sobre un eje vertical: cada lado del cuerpo tiene profundidad z
  // (medio ancho de hombros y caderas), así al girar se ve de frente y desde el otro lado.
  const ZS = 12, ZH = 6.5;
  const ARMK = ['S', 'el', 'wr', 'hd', 'tg'], LEGK = ['H', 'kn', 'an', 'to', 'he'];
  const zOf = key => { const m = /^(S|el|wr|hd|tg|H|kn|an|to|he)([12])$/.exec(key || ''); if (!m) return 0; const w = ARMK.includes(m[1]) ? ZS : ZH; return m[2] === '1' ? w : -w; };
  function rotateJ(J, deg, cx) {
    const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
    const prj = (p, z) => [cx + (p[0] - cx) * c + (z || 0) * s, p[1]];
    const B = Object.assign({}, J);                       // 2D sin el desfase visual del lado lejano
    for (const k of [...ARMK, ...LEGK]) { const q = J[k + '2']; if (q) B[k + '2'] = [q[0] - OFF[0], q[1] - OFF[1]]; }
    const R = Object.assign({}, B);
    for (const key in B) { const v = B[key]; if (key !== 'u' && key !== 'n' && Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') R[key] = prj(v, zOf(key)); }
    const near = c >= 0 ? 1 : 2, flat = Math.abs(c) < 0.35, frontFacing = -J.n[0] * s >= 0;
    const gp = i => prj(add(add(J.hip, J.n, -6.5), J.u, -1.5), i === 1 ? 5 : -5);
    R.rot = { c, s, cx, prj, near, J0: B, u: J.u, n: J.n, hip0: J.hip, t: J.t, zOf,
      gl: { 1: gp(1), 2: gp(2) }, glv: { 1: flat ? !frontFacing : near === 1, 2: flat ? !frontFacing : near === 2 } };
    R.pm = flat ? (frontFacing ? 'front' : 'back') : (c < 0 ? 'mirror' : false);
    R._ms = null;
    return R;
  }
  // tronco girado: envolvente de secciones elípticas (adelante a, atrás b, medio ancho w) a lo largo del tronco
  const TL = [[1.0, 5, 5.5, 15], [0.88, 7.5, 7, 16.5], [0.7, 8.6, 7.6, 14], [0.52, 6.6, 6.4, 12], [0.3, 6.2, 7.5, 10.5], [0.08, 6.8, 10, 10.5], [-0.1, 5.5, 7, 11]];
  const TLat = f => { for (let i = 0; i < TL.length - 1; i++) { const A = TL[i], B = TL[i + 1]; if (f <= A[0] && f >= B[0]) { const u = (A[0] - f) / (A[0] - B[0]); return [lerp(A[1], B[1], u), lerp(A[2], B[2], u), lerp(A[3], B[3], u)]; } } return f > 1 ? TL[0].slice(1) : TL[TL.length - 1].slice(1); };
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function drawTorso3D(J, Ms) {
    const R = J.rot, n = R.n;
    const at3 = (f, off, z) => { const c0 = mv(R.hip0, R.t, L.torso * f); return R.prj([c0[0] + n[0] * off, c0[1] + n[1] * off], z); };
    const pts = [];
    for (const [f, a, b, w] of TL) for (let k = 0; k < 16; k++) { const ph = k / 8 * Math.PI, cs = Math.cos(ph); pts.push(at3(f, cs > 0 ? a * cs : b * cs, w * Math.sin(ph))); }
    let s = `<path d="M${hull(pts).map(P).join(' L')} Z" fill="${SKIN.near}" stroke="${SKIN.near}" stroke-width="2.5" stroke-linejoin="round"/>`;
    const fill = (key, ps) => { const v = Ms[key]; if (!v) return ''; return `<path d="M${ps.map(P).join(' L')} Z" fill="${COL.hl}" opacity="${v < 1 ? .55 : 1}" stroke="${COL.hl}" stroke-width="2" stroke-linejoin="round"${v >= 1 ? ' filter="url(#glow)"' : ''}/>`; };
    if (Math.abs(R.c) >= 0.45) {            // casi de perfil: mismas zonas que la vista lateral, sobre el costado visible
      const zs = Math.sign(R.c) * 0.55, reg = (key, list) => fill(key, list.map(([f, o]) => at3(f, o, zs * TLat(f)[2])));
      s += reg('chest', [[0.95, 0.5], [0.9, 7], [0.72, 8.8], [0.56, 6.8], [0.56, 0.5]]);
      s += reg('abs', [[0.54, 0.5], [0.54, 6.4], [0.3, 6.3], [0.1, 6.8], [0.06, 0.5]]);
      s += reg('lats', [[0.85, -0.5], [0.85, -7.1], [0.66, -7.6], [0.42, -6.3], [0.36, -0.5]]);
      s += reg('upperback', [[1.0, -0.5], [1.0, -5.6], [0.9, -7.1], [0.76, -7.3], [0.76, -0.5]]);
      s += reg('lowback', [[0.4, -0.5], [0.4, -6.4], [0.24, -7.4], [0.12, -8.2], [0.12, -0.5]]);
      s += reg('glutes', [[0.12, -0.5], [0.1, -9], [0.0, -10.6], [-0.1, -7.2], [-0.1, -0.5]]);
    } else {                                  // de frente o de espalda
      const front = -n[0] * R.s >= 0;
      const quad = (key, fa, fb, k1, k2) => fill(key, [[fa, k1], [fb, k2], [fb, -k2], [fa, -k1]].map(([f, k]) => { const t = TLat(f); return at3(f, front ? t[0] * 0.9 : -t[1] * 0.9, k); }));
      if (front) s += quad('chest', 0.62, 0.92, 13, 15) + quad('abs', 0.12, 0.58, 8.5, 10);
      else s += quad('lats', 0.45, 0.8, 11.5, 15.5) + quad('upperback', 0.85, 1.0, 15, 15) + quad('lowback', 0.05, 0.35, 9.5, 9.5);
    }
    return s;
  }

  // ---------------------------------------------------------------- implementos
  function at(J, a) {
    if (typeof a === 'function') return a(J);
    if (typeof a === 'string') return J[a];
    if (J.rot && Array.isArray(a)) return J.rot.prj(a, 0);
    return a;
  }
  const PROPS = {
    bench: (J, o) => {            // o.a / o.b extremos del cojín, o.legs = [x...]
      let s = poly([o.a, o.b], 8, COL.pad);
      const legs = o.legs || [o.a[0] + 8, o.b[0] - 8];
      for (const x of legs) {
        const y = o.a[1] + (o.b[1] - o.a[1]) * ((x - o.a[0]) / ((o.b[0] - o.a[0]) || 1));
        s += line([x, y + 4], [x, FLOOR], 3.5, COL.padDark);
      }
      if (o.back) s += poly([o.back[0], o.back[1]], 8, COL.pad);
      return s;
    },
    box: (J, o) => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${FLOOR - o.y}" rx="3" fill="${COL.pad}" stroke="${COL.padDark}" stroke-width="1.5"/>`,
    wall: (J, o) => `<rect x="${o.x}" y="0" width="${o.w || 8}" height="${FLOOR}" fill="${COL.padDark}"/>`,
    table: (J, o) => line([o.x, o.y], [o.x + o.w, o.y], 5, COL.pad) + line([o.x + 4, o.y], [o.x + 4, FLOOR], 3, COL.padDark) + line([o.x + o.w - 4, o.y], [o.x + o.w - 4, FLOOR], 3, COL.padDark),
    rails: (J, o) => { const p = at(J, o.at || 'wr1'); return line([p[0] - 2, -12], [p[0] - 2, FLOOR], 3, COL.padDark) + line([p[0] + 3, -12], [p[0] + 3, FLOOR], 2, COL.pad, 'opacity=".6"'); },
    twistball: (J, o) => { const b = J.p.bs ?? 1, c = [(J.hd1[0] + J.hd2[0]) / 2 + 3, (J.hd1[1] + J.hd2[1]) / 2 - 1]; return `<g opacity="${f1(0.45 + 0.55 * b)}">${circ(c, 7 + 2 * b, '#3b4655', '#8a96a6', 1.6)}</g>`; },
    hbar: (J, o) => line([o.x1, o.y], [o.x2, o.y], 4, COL.metal) + line([o.x1, 0 - 12], [o.x1, o.y], 3, COL.padDark) + line([o.x2, -12], [o.x2, o.y], 3, COL.padDark),
    pullbar: (J, o) => line([o.x - 8, -12], [o.x - 8, o.y], 3, COL.padDark) + line([o.x - 8, o.y], [o.x, o.y], 3, COL.padDark) + circ([o.x, o.y], 4, COL.metal, '#64748b', 1.5),
    tower: (J, o) => {
      let s = `<rect x="${o.x - 5}" y="${o.top ?? 6}" width="10" height="${FLOOR - (o.top ?? 6)}" rx="2" fill="${COL.padDark}" ${o.dim ? 'opacity=".55"' : ''}/>`;
      (o.pulleys || []).forEach(y => { s += circ([o.x, y], 4, COL.pad, COL.metal, 1.5); });
      return s;
    },
    cable: (J, o) => {
      const a = at(J, o.from), b = at(J, o.to || 'hd1');
      return line(a, b, o.w || 1.3, o.band ? COL.band : COL.cable, o.dim ? 'opacity=".5"' : '');
    },
    band: (J, o) => line(at(J, o.from), at(J, o.to), 2.4, COL.band),
    handle: (J, o) => { const p = at(J, o.at || 'hd1'); return circ(p, 3, COL.metal); },
    barbell: (J, o) => {
      if (J.rot) {                // girada: la barra cruza de lado a lado con un disco en cada punta
        const R = J.rot, p0 = at(R.J0, o.at || 'wr1'), r = o.r || 13, zf = R.c >= 0 ? -26 : 26;
        const pl = z => { const q = R.prj(p0, z); return `<ellipse cx="${f1(q[0])}" cy="${f1(q[1])}" rx="${f1(Math.max(2.2, r * Math.abs(R.c)))}" ry="${r}" fill="${COL.plate}" stroke="${COL.plateRim}" stroke-width="2"/>`; };
        return pl(zf) + line(R.prj(p0, -34), R.prj(p0, 34), 2.8, COL.metal) + pl(-zf);
      }
      const p = at(J, o.at || 'wr1'); const r = o.r || 13;
      return circ(p, r, COL.plate, COL.plateRim, 2) + circ(p, r * 0.55, 'none', '#3a424d', 1.2) + circ(p, 2.6, COL.metal);
    },
    plate: (J, o) => { const p = at(J, o.at); const r = o.r || 9; return circ(p, r, COL.plate, COL.plateRim, 1.8) + circ(p, 2, COL.metal); },
    db: (J, o) => {
      if (J.rot) {
        const R = J.rot, key = typeof o.at === 'string' ? o.at : 'hd1', p0 = at(R.J0, o.at || 'hd1'), z0 = R.zOf(key), k = o.k || 1, zf = R.c >= 0 ? -6 : 6;
        const e = z => { const q = R.prj(p0, z0 + z); return `<ellipse cx="${f1(q[0])}" cy="${f1(q[1])}" rx="${f1(Math.max(1.6, 6.5 * k * Math.abs(R.c)))}" ry="${f1(6.5 * k)}" fill="${COL.plate}" stroke="${COL.plateRim}" stroke-width="1.6"/>`; };
        const dim = z0 * R.c < 0 && Math.abs(R.c) > 0.35;
        return `<g ${dim ? 'opacity=".55"' : ''}>${e(zf)}${line(R.prj(p0, z0 - 6), R.prj(p0, z0 + 6), 2.6 * k, COL.metal)}${e(-zf)}</g>`;
      }
      const p = at(J, o.at || 'hd1'); const k = o.k || 1;
      return `<g ${o.dim ? 'opacity=".55"' : ''}>${circ(p, 6.5 * k, COL.plate, COL.plateRim, 1.6)}${circ(p, 2 * k, COL.metal)}</g>`;
    },
    kb: (J, o) => {
      const h = at(J, o.at || 'hd1'); let d = [0, 1];
      if (o.along) { const w = at(J, o.along), e = at(J, o.from); const v = [w[0] - e[0], w[1] - e[1]]; const m = Math.hypot(...v) || 1; d = [v[0] / m, v[1] / m]; }
      if (o.up) d = [-d[0], -d[1]];
      const c = [h[0] + d[0] * 9, h[1] + d[1] * 9];
      return `<g ${o.dim ? 'opacity=".55"' : ''}>${circ(c, 8, COL.plate, COL.plateRim, 1.8)}${circ([h[0] + d[0] * 2, h[1] + d[1] * 2], 3.2, 'none', COL.plateRim, 2)}</g>`;
    },
    ball: (J, o) => { const p = at(J, o.at); return circ(p, o.r || 9, o.fill || '#3b4655', o.stroke || '#8a96a6', 1.6) + (o.r > 15 ? `<path d="M${p[0] - o.r * .7},${p[1]} Q${p[0]},${p[1] - o.r * .35} ${p[0] + o.r * .7},${p[1]}" fill="none" stroke="#8a96a6" stroke-width="1"/>` : ''); },
    roller: (J, o) => { const p = at(J, o.at); return circ(p, o.r || 7, '#2f6f73', '#5fb3b8', 1.5); },
    stick: (J, o) => { const p = at(J, o.at || 'hd1'); return circ(p, 3, COL.wood); },
    landmine: (J, o) => {
      const p = at(J, o.pivot), h = at(J, o.at || 'hd1'); const v = [h[0] - p[0], h[1] - p[1]]; const m = Math.hypot(...v) || 1;
      const e = [h[0] + v[0] / m * 12, h[1] + v[1] / m * 12];
      return line(p, e, 3.2, COL.metal) + circ(e, 10, COL.plate, COL.plateRim, 1.8) + circ(p, 3.5, COL.padDark);
    },
    platform: (J, o) => { const p = at(J, o.at || 'an1'); const d = dir(o.a); return line([p[0] - d[0] * 18, p[1] - d[1] * 18], [p[0] + d[0] * 18, p[1] + d[1] * 18], 5, COL.pad) + line(p, mv(p, o.a + 90, 0), 0, COL.pad); },
    pad: (J, o) => { const a = at(J, o.a), b = at(J, o.b); return line(a, b, o.w || 7, COL.pad); },
    rope: (J, o, T) => {
      const a = at(J, o.from), b = at(J, o.to); let d = `M${pt(a)}`;
      for (let i = 1; i <= 24; i++) {
        const u = i / 24, x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u) + Math.sin(u * 12 - T * 14 + (o.ph || 0)) * 7 * (1 - u) * (0.4 + 0.6 * Math.abs(Math.sin(T * 3 + (o.ph || 0))));
        d += ` L${f1(x)},${f1(y)}`;
      }
      return `<path d="${d}" fill="none" stroke="${o.c || '#c9a46a'}" stroke-width="3" stroke-linecap="round"/>`;
    },
    sled: (J, o) => { const h = at(J, o.at || 'hd1'); const x = h[0] + (o.dx || 4); return `<rect x="${x}" y="${FLOOR - 26}" width="34" height="22" rx="3" fill="${COL.pad}" stroke="${COL.padDark}"/>` + line([x - 2, FLOOR - 2], [x + 40, FLOOR - 2], 3, COL.metal) + line(h, [x + 6, FLOOR - 24], 3, COL.metal) + circ([x + 17, FLOOR - 26], 7, COL.plate, COL.plateRim, 1.5); },
    yoke: (J, o) => { const s = J.shc; return line([s[0] - 3, s[1] - 4], [s[0] - 3, FLOOR - 10], 3, COL.metal, 'opacity=".9"') + circ([s[0] - 3, FLOOR - 16], 14, COL.plate, COL.plateRim, 2) + circ([s[0] - 3, s[1] - 4], 3, COL.metal); },
    rower: (J, o) => line([20, FLOOR - 8], [170, FLOOR - 8], 4, COL.pad) + circ([168, FLOOR - 28], 17, COL.padDark, COL.pad, 2) + line([140, FLOOR - 8], [146, FLOOR - 34], 4, COL.pad) + line(at(J, 'hd1'), [160, FLOOR - 32], 1.4, COL.cable),
    bike: (J, o) => {
      const c = o.crank, sp = o.seat, hb = o.bar;
      let s = line([c[0] - 30, FLOOR], [c[0] + 34, FLOOR], 5, COL.pad);
      s += poly([[sp[0], sp[1] + 6], c, [hb[0] - 4, hb[1] + 4]], 5, COL.pad);
      s += line([c[0] + 10, c[1]], [c[0] - 8, FLOOR], 4, COL.pad) + line([sp[0], sp[1] + 6], [sp[0] - 8, FLOOR], 4, COL.pad);
      s += line([sp[0] - 9, sp[1] + 3], [sp[0] + 9, sp[1] + 3], 5, COL.padDark);
      if (o.fan) s += circ([c[0] + 30, c[1] - 14], 20, 'none', COL.pad, 4);
      s += circ(c, 7, COL.padDark, COL.metal, 1.5) + line(at(J, 'an1'), at(J, 'an2'), 2.5, COL.metal);
      return s;
    },
    stairs: (J, o, T) => { let s = ''; for (let i = 0; i < 4; i++) { const y = FLOOR - 14 * (i + 1) + ((T * 30) % 14); s += line([108 + i * 0, y], [150, y], 3, COL.pad); } return `<rect x="100" y="${FLOOR - 70}" width="56" height="70" fill="${COL.padDark}" opacity=".5"/>` + s; },
    hurdle: (J, o) => line([o.x - 7, o.y], [o.x + 7, o.y], 3, '#f59e0b') + line([o.x - 5, o.y], [o.x - 5, FLOOR], 2, '#f59e0b') + line([o.x + 5, o.y], [o.x + 5, FLOOR], 2, '#f59e0b'),
    foam: (J, o) => `<rect x="${o.x}" y="${FLOOR - 8}" width="${o.w || 40}" height="8" rx="3" fill="#2f6f73" opacity=".8"/>`,
    bosu: (J, o) => `<path d="M${o.x - 22},${FLOOR} A22,14 0 0 1 ${o.x + 22},${FLOOR} Z" fill="#2f6f73" stroke="#5fb3b8" stroke-width="1.5"/>`,
    slant: (J, o) => `<path d="M${o.x},${FLOOR} L${o.x + o.w},${FLOOR} L${o.x + o.w},${FLOOR - o.h} Z" fill="${COL.pad}"/>`,
    crutch: (J, o) => { const h = at(J, o.at); return line([h[0] + (o.dx || 0), h[1] - 6], [h[0] + (o.dx || 0) * 1.6, FLOOR], 3, COL.metal); },
    chain: (J, o) => { const p = at(J, o.at || 'wr1'); let s = ''; const n = Math.max(1, Math.round((FLOOR - p[1]) / 7)); for (let i = 0; i < n; i++) s += circ([p[0] + 2, p[1] + 10 + i * ((FLOOR - p[1] - 10) / n)], 2.4, 'none', COL.metal, 1.5); return s; },
    spot: (J, o) => '',
    text: (J, o) => `<text x="${o.x}" y="${o.y}" fill="${o.c || '#94a3b8'}" font-size="${o.s || 9}" font-family="Inter,system-ui,sans-serif" font-weight="700" text-anchor="middle">${o.txt}</text>`
  };

  // ---------------------------------------------------------------- render de un cuadro
  // centro horizontal de la figura en la primera pose (eje del giro)
  function tplCx(tpl) {
    if (tpl._cx !== undefined) return tpl._cx;
    if (tpl.cx !== undefined) return (tpl._cx = tpl.cx);              // ejercicios que se desplazan
    const J = solve(compile(tpl).specs[0]), xs = ['hip', 'shc', 'head', 'hd1', 'kn1', 'an1', 'to1', 'he1', 'el1'].map(k => J[k] && J[k][0]).filter(x => typeof x === 'number');
    return (tpl._cx = (Math.min(...xs) + Math.max(...xs)) / 2);
  }
  // giro lento y continuo: de perfil → de frente → desde el otro lado → de frente → de perfil (se detiene un poco en cada perfil)
  const SPIN = 14;
  const yawAt = t => { const x = (1 - Math.cos(2 * Math.PI * t / SPIN)) / 2; return -180 * x * x * (3 - 2 * x); };
  function render(tpl, phase, hl, T, yaw) {
    if (tpl.custom) return G.SMCustom[tpl.custom](tpl, phase, hl, T);
    const { spec } = poseAt(tpl, phase);
    let J = lockJ(tpl, phase, solve(spec)), J0 = J;
    if (yaw && !J.front) { J = rotateJ(J, yaw, tplCx(tpl)); J0 = J.rot.J0; }
    const draw = (o, JJ) => PROPS[o.type] ? PROPS[o.type](JJ, o, T) : '';
    const layer = lay => (tpl.props || []).filter(o => (o.layer || defaultLayer(o.type)) === lay).map(o => draw(o, J)).join('');
    let s = '';
    // sombra
    const cx = J.front ? J.hip[0] : (J.an1[0] + J.an2[0] + J.hip[0]) / 3;
    s += `<ellipse cx="${f1(cx)}" cy="${FLOOR + 1}" rx="${J.rot ? f1(16 + 18 * Math.abs(J.rot.c)) : 34}" ry="3.2" fill="#000" opacity=".35"/>`;
    if (J.rot) {          // bancos, máquinas y soportes: se comprimen con el giro (escala horizontal sobre el eje)
      const R = J.rot, sc = (R.c < 0 ? -1 : 1) * Math.max(Math.abs(R.c), 0.14), bk = (tpl.props || []).filter(o => (o.layer || defaultLayer(o.type)) === 'back');
      s += `<g transform="matrix(${f1(sc * 100) / 100} 0 0 1 ${f1(R.cx * (1 - sc))} 0)">${bk.filter(o => o.type !== 'text').map(o => draw(o, J0)).join('')}</g>` + bk.filter(o => o.type === 'text').map(o => draw(o, J0)).join('');
    } else s += layer('back');
    s += figure(J, hl, 'far');
    s += layer('mid');
    s += figure(J, hl, 'body');
    s += layer('body');
    s += figure(J, hl, 'near');
    s += layer('front');
    s += figure(J, hl, 'arm');
    s += layer('hand');
    if (tpl.pulse) {
      const k = (Math.sin(T * 4) + 1) / 2;
      s += `<g transform="translate(176 22)"><circle r="${f1(7 + k * 6)}" fill="none" stroke="${COL.hl}" stroke-opacity="${f1(0.6 - k * 0.5)}" stroke-width="2"/><circle r="6" fill="${COL.hl}"/><text y="3" fill="#0c0d0e" font-size="6.5" font-weight="800" text-anchor="middle" font-family="Inter,system-ui,sans-serif">ISO</text></g>`;
    }
    return s;
  }
  function defaultLayer(type) {
    return ({ bench: 'back', box: 'back', wall: 'back', table: 'back', pullbar: 'back', hbar: 'back', rails: 'back', tower: 'back', bike: 'back', stairs: 'back', rower: 'back', hurdle: 'back', foam: 'back', bosu: 'back', slant: 'back', sled: 'back', text: 'back', yoke: 'back', cable: 'mid', band: 'mid', rope: 'hand', barbell: 'hand', db: 'hand', kb: 'hand', ball: 'hand', stick: 'hand', landmine: 'hand', handle: 'hand', plate: 'hand', platform: 'back', pad: 'back', roller: 'back', crutch: 'hand', chain: 'hand' })[type] || 'hand';
  }

  const DEFS0 = `<defs>
    <radialGradient id="bgGlow" cx="50%" cy="58%" r="60%"><stop offset="0" stop-color="#bbf426" stop-opacity=".09"/><stop offset="1" stop-color="#bbf426" stop-opacity="0"/></radialGradient>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-30" y="-30" width="270" height="270"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#ffffff" stroke-opacity=".035" stroke-width="1"/></pattern>
  </defs>`;
  const DEFS = DEFS0;
  const VB = '-6 -12 212 212';
  const BGBASE = `<rect x="-6" y="-12" width="212" height="212" fill="#121417"/><rect x="-6" y="-12" width="212" height="212" fill="url(#grid)"/><rect x="-6" y="-12" width="212" height="212" fill="url(#bgGlow)"/>`;
  const BG = BGBASE + `<line x1="-6" y1="${FLOOR + 0.5}" x2="206" y2="${FLOOR + 0.5}" stroke="#2f353d" stroke-width="1.5"/><rect x="-6" y="${FLOOR + 1}" width="212" height="${200 - FLOOR}" fill="#0e1012"/>`;
  const bgFor = tpl => tpl && tpl.custom ? BGBASE : BG;

  // plantillas con variante de postura: "curl@seated", "row_cable@kneel"…
  function tplOf(name) {
    const T = G.SMTemplates;
    if (T[name]) return T[name];
    if (name && name.includes('@') && G.SMVariant) { const v = G.SMVariant(name); if (v) { T[name] = v; return v; } }
    return T[String(name).split('@')[0]] || T.stand;
  }
  // ---------------------------------------------------------------- reproductor
  const players = new Set();
  let raf = null, last = 0;
  const reduce = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frameSVG(tplName, phase, hl, T, yaw) {
    const tpl = tplOf(tplName);
    return render(tpl, phase, hl, T ?? phase * (tpl.dur || 2.6), yaw);
  }
  // etiqueta (agarre / variante) en la esquina superior izquierda
  function badgeSVG(lines, y0) {
    lines = (lines || []).filter(Boolean); if (!lines.length) return '';
    let y = y0 ?? -1, out = '';
    for (const t of lines) {
      const txt = String(t).toUpperCase().replace(/[&<>]/g, ''), w = 6 + txt.length * 4.15;
      out += `<rect x="-2" y="${y}" width="${f1(w)}" height="10.5" rx="5.2" fill="#0c0d0e" fill-opacity=".82" stroke="${COL.hl}" stroke-opacity=".55" stroke-width=".6"/><text x="${f1(-2 + w / 2)}" y="${f1(y + 7.4)}" fill="${COL.hl}" font-size="6.4" font-weight="800" letter-spacing=".25" text-anchor="middle" font-family="Inter,Arial,sans-serif">${txt}</text>`;
      y += 13;
    }
    return `<g>${out}</g>`;
  }
  function fullSVG(tplName, phase, hl, T, mark, yaw) {
    const tpl = tplOf(tplName);
    const wm = mark ? `${badgeSVG(mark.badge && [].concat(mark.badge), 4)}<g font-family="Inter,Arial,sans-serif" font-weight="800" font-size="7.5"><text x="-1" y="-3" fill="#ffffff" opacity=".9">STRONG<tspan fill="#bbf426">MED</tspan><tspan fill="#64748b"> × </tspan>Kin <tspan fill="#bbf426">At Home</tspan></text>${mark.title ? `<text x="-1" y="196" fill="#cbd5e1" font-size="7" font-weight="700">${mark.title.replace(/[&<>]/g, '')}</text>` : ''}</g>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" width="420" height="420">${DEFS}${bgFor(tpl)}<g>${frameSVG(tplName, phase, hl, T, yaw)}</g>${wm}</svg>`;
  }

  function mount(el, tplName, hl, opts = {}) {
    const tpl = tplOf(tplName);
    el.innerHTML = `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Animación del ejercicio">${DEFS}${bgFor(tpl)}<g class="fig"></g>${badgeSVG(opts.badge && [].concat(opts.badge))}</svg>`;
    const g = el.querySelector('.fig');
    const P = { el, g, tpl, hl, off: opts.phase ?? Math.random(), visible: true, speed: opts.speed || 1, clock: 0, paused: false, spin: opts.spin === true, yaw: 0 };
    // ángulo elegido por la persona: perfil, de frente o de espalda
    P.view = v => { P.yaw = ({ front: -90, side: 0, back: 90 })[v] ?? 0; P.spin = false; P.g.innerHTML = render(P.tpl, P.ph ?? P.off, P.hl, P.clock, P.yaw); };
    g.innerHTML = render(tpl, reduce ? 0.35 : P.off, hl, 0);
    if (reduce) return P;
    players.add(P);
    if (G.IntersectionObserver) {
      P.io = new IntersectionObserver(es => { P.visible = es[0].isIntersecting; }, { rootMargin: '80px' });
      P.io.observe(el);
    }
    if (!raf) raf = requestAnimationFrame(loop);
    return P;
  }
  function unmount(P) { if (!P) return; players.delete(P); if (P.io) P.io.disconnect(); }
  function unmountWithin(root) { for (const P of [...players]) if (root.contains(P.el) || !document.body.contains(P.el)) unmount(P); }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - last < 33) return;           // ~30 fps
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    for (const P of players) {
      if (!document.body.contains(P.el)) { unmount(P); continue; }
      if (P.paused) continue;
      P.clock += dt * P.speed;
      if (!P.visible) continue;
      const dur = P.tpl.dur || 2.6;
      const ph = (P.clock / dur + P.off) % 1;
      P.spinT = (P.spinT || 0) + (P.spin ? dt * P.speed : 0);
      P.ph = ph; P.g.innerHTML = render(P.tpl, ph, P.hl, P.clock, P.spin ? yawAt(P.spinT) : P.yaw);
    }
  }

  // pose para el visor 3D (js/sm-3d.js): articulaciones sin el desfase visual del lado lejano
  function pose3(tplName, phase) {
    const tpl = tplOf(tplName);
    if (tpl.custom) return { tpl, custom: true };
    const J = lockJ(tpl, phase, solve(poseAt(tpl, phase).spec));
    // sin el desfase del lado lejano; en la pierna solo el horizontal, para que ambos pies pisen el mismo suelo
    if (!J.front) for (const k of [...ARMK, ...LEGK]) { const q = J[k + '2'], dy = LEGK.includes(k) && k !== 'H' ? 0 : OFF[1]; if (q) J[k + '2'] = [q[0] - OFF[0], q[1] - dy]; }
    return { tpl, J, front: !!J.front, cx: tplCx(tpl) };
  }
  // fase de la miniatura: la plantilla puede pedir otra (p. ej. el peso muerto se reconoce abajo, no arriba)
  const thumbPh = name => { const t = tplOf(name); return t && t.thumb != null ? t.thumb : 0.42; };
  G.SMAnim = { pose3, muscleSet, thumbPh, at: (J, a) => at(J, a), PROPS_LAYER: defaultLayer, yawAt, badgeSVG, tpl: tplOf, mount, unmount, unmountWithin, fullSVG, frameSVG, solve, L, FLOOR, COL, dir, mv, ang, lerp, circ, line, poly, pt, f1, DEFS, BG, VB };
})(window);
/* Primeros planos animados: mano, pie y cara (rehabilitación fina) */
(function (G) {
  'use strict';
  const A = G.SMAnim;
  const { circ, line, f1, pt, dir, mv } = A;
  const HL = '#bbf426', SK = '#e8edf3', SK2 = '#9aa6b5', DK = '#121417';
  const ease = u => 0.5 - Math.cos(Math.PI * u) / 2;
  // interpola una lista de cuadros clave (ida y vuelta circular)
  function kf(list, phase) {
    const n = list.length, x = (phase % 1) * n, i = Math.floor(x), j = (i + 1) % n, u = ease(x - i);
    const a = list[i], b = list[j], o = {};
    for (const k in a) o[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * u : a[k];
    o._i = i; o._u = u;
    return o;
  }
  const label = (txt) => `<text x="100" y="194" fill="#94a3b8" font-size="9" font-family="Inter,system-ui,sans-serif" font-weight="700" text-anchor="middle" letter-spacing=".5">${txt}</text>`;

  // ------------------------------------------------------------------ MANO
  function finger(p0, base, a, lens, w, col, glow) {
    let p = p0, ang = base, s = '';
    lens.forEach((l, i) => { ang = ang - a[i]; const q = mv(p, ang, l); s += line(p, q, w - i * 1.2, col, glow ? 'filter="url(#glow)"' : ''); p = q; });
    return s;
  }
  function hand(tpl, phase) {
    let s = '';
    const mode = tpl.mode;
    if (mode === 'prono') {
      const o = kf([{ r: -70 }, { r: 70 }], phase);
      s += `<rect x="86" y="96" width="28" height="90" rx="12" fill="${SK}"/>`;
      s += `<g transform="rotate(${f1(o.r)} 100 92)"><rect x="84" y="78" width="32" height="30" rx="11" fill="${HL}" filter="url(#glow)"/><line x1="100" y1="78" x2="100" y2="20" stroke="${A.COL.wood}" stroke-width="7" stroke-linecap="round"/><rect x="82" y="10" width="36" height="16" rx="4" fill="#5d6876"/></g>`;
      return s + label('PRONACIÓN · SUPINACIÓN');
    }
    if (mode === 'dev') {
      const o = kf([{ r: -22 }, { r: 22 }], phase);
      s += `<rect x="86" y="120" width="28" height="70" rx="12" fill="${SK}"/>`;
      s += `<g transform="rotate(${f1(o.r)} 100 118)"><rect x="78" y="66" width="44" height="56" rx="14" fill="${HL}" filter="url(#glow)"/>`;
      [82, 93, 104, 115].forEach((x, i) => { s += line([x + 2, 70], [x + 2, 30 + Math.abs(i - 1.5) * 6], 8, SK); });
      s += line([80, 100], [62, 74], 9, SK) + `</g>`;
      s += line([100, 50], [186, 50], 2.4, A.COL.band, 'opacity=".7"');
      return s + label('DESVIACIÓN RADIAL · CUBITAL');
    }
    let st;
    if (mode === 'glide') st = kf([{ w: 0, m: 0, p: 0, d: 0 }, { w: 0, m: 0, p: 95, d: 75 }, { w: 0, m: 85, p: 95, d: 5 }, { w: 0, m: 88, p: 105, d: 80 }], phase);
    else if (mode === 'grip') st = kf([{ w: 0, m: 30, p: 40, d: 25 }, { w: 0, m: 70, p: 85, d: 55 }], phase);
    else st = kf([{ w: -50, m: 5, p: 5, d: 0 }, { w: 55, m: 5, p: 5, d: 0 }], phase);
    const wr = [78, 110];
    s += line([0, 118], wr, 24, SK);                         // antebrazo
    const pa = 90 + st.w;                                     // dirección de la palma
    const kn = mv(wr, pa, 40);
    s += line(wr, kn, 30, mode === 'wrist' ? HL : SK, mode === 'wrist' ? 'filter="url(#glow)"' : '');
    if (mode === 'grip') {
      const sq = (st.m - 30) / 40;
      s += `<ellipse cx="${f1(kn[0] - 4 + dir(pa - 90)[0] * 16)}" cy="${f1(kn[1] + dir(pa - 90)[1] * 16 + 6)}" rx="${f1(16 - sq * 5)}" ry="${f1(12 - sq * 4)}" fill="#ff6b8b" opacity=".85"/>`;
    }
    // dedos (3 por detrás más oscuros, 1 al frente)
    for (let i = 3; i >= 0; i--) {
      const off = mv(kn, pa + 90, i * 3.5 - 3);
      const col = i === 0 ? (mode === 'wrist' ? SK : HL) : SK2;
      s += finger(off, pa, [st.m, st.p, st.d], [22, 15, 11], 9, col, i === 0 && mode !== 'wrist');
    }
    // pulgar
    const tb = mv(wr, pa - 50, 16);
    s += finger(tb, pa - 30, [st.m * 0.4, st.p * 0.4], [18, 13], 9, SK);
    const names = { glide: ['MANO RECTA', 'GARRA', 'PUÑO RECTO', 'PUÑO COMPLETO'], grip: ['PRENSIÓN'], wrist: ['FLEXO-EXTENSIÓN DE MUÑECA'] }[mode];
    return s + label(names[Math.min(names.length - 1, st._u > 0.5 ? (st._i + 1) % names.length : st._i)]);
  }

  // ------------------------------------------------------------------ PIE
  function foot(tpl, phase) {
    let s = '';
    const g = 168;
    const mode = tpl.mode;
    if (mode === 'spread') {
      const o = kf([{ k: 0 }, { k: 1 }], phase);
      s += `<path d="M100,186 C70,186 66,150 68,110 C70,80 80,62 104,62 C126,62 136,78 134,110 C134,150 130,186 100,186 Z" fill="${SK}"/>`;
      const toes = [[84, 58, 10], [100, 54, 7.5], [113, 57, 6.6], [123, 63, 5.8], [130, 72, 5.2]];
      toes.forEach(([x, y, r], i) => {
        const spread = (i - 0.8) * 7 * o.k;
        const c = [x + spread, y - Math.abs(spread) * 0.15];
        s += circ(c, r, i === 0 ? HL : SK, 'none', 0, i === 0 ? 'filter="url(#glow)"' : '');
      });
      return s + label('SEPARACIÓN ACTIVA DE DEDOS');
    }
    let arch = 6, toeA = 0, bigA = 0, ballX = null;
    let txt = '';
    if (mode === 'short') { const o = kf([{ a: 5 }, { a: 18 }], phase); arch = o.a; txt = 'PIE CORTO · ARCO MEDIAL'; }
    if (mode === 'hallux') { const o = kf([{ b: 35, t: 0 }, { b: 0, t: 30 }], phase); bigA = o.b; toeA = o.t; txt = 'DISOCIACIÓN DEL HALLUX'; }
    if (mode === 'windlass') { const o = kf([{ b: 0 }, { b: 55 }], phase); bigA = o.b; toeA = o.b * 0.8; arch = 6 + o.b * 0.15; txt = 'WINDLASS · DORSIFLEXIÓN DE DEDOS'; }
    if (mode === 'massage') { const o = kf([{ x: 70 }, { x: 128 }], phase); ballX = o.x; txt = 'MASAJE PLANTAR'; }
    // pierna y pie (vista medial)
    s += line([64, 0], [70, 104], 26, SK);
    s += `<path d="M34,${g - 2} C30,${g - 30} 40,${g - 56} 58,104 L84,104 C100,110 118,${g - 26} 138,${g - 18} L138,${g} L120,${g} C104,${g} 90,${g - arch} 74,${g - arch} C60,${g - arch} 52,${g} 42,${g} Z" fill="${SK}"/>`;
    if (mode === 'short' || mode === 'windlass') s += `<path d="M58,${g} C70,${g - arch} 100,${g - arch} 118,${g}" fill="none" stroke="${HL}" stroke-width="4" stroke-linecap="round" filter="url(#glow)"/>`;
    // dedos: menores (oscuros) y hallux (claro)
    const mtp = [138, g - 9];
    s += line(mtp, mv(mtp, 90 + toeA, 24), 10, SK2);
    s += line(mtp, mv(mtp, 90 + bigA, 30), 13, mode === 'hallux' || mode === 'windlass' ? HL : SK, mode === 'hallux' ? 'filter="url(#glow)"' : '');
    if (mode === 'windlass') { const tip = mv(mtp, 90 + bigA, 30); s += circ([tip[0] + 6, tip[1] - 2], 9, '#c7b19b'); }
    if (ballX !== null) s += circ([ballX, g + 7], 8, '#ff6b8b', '#ffa3b6', 1.5);
    s += line([0, g + 15], [200, g + 15], 1.5, '#2f353d');
    return s + label(txt);
  }

  // ------------------------------------------------------------------ CARA
  function face(tpl, phase) {
    const x = (phase % 1) * 4, i = Math.floor(x), u = Math.sin(Math.PI * (x - i));
    const brow = i === 0 ? u : 0, eye = i === 1 ? u : 0, smile = i === 2 ? u : 0, oo = i === 3 ? u : 0;
    let s = `<ellipse cx="100" cy="96" rx="58" ry="72" fill="${SK}"/>`;
    s += `<path d="M42,96 C40,60 60,24 100,24 C140,24 160,60 158,96 C150,70 130,52 100,52 C70,52 50,70 42,96 Z" fill="#3a4250"/>`;
    // cejas
    [[-1, 74], [1, 126]].forEach(([sd, cx]) => {
      const y = 76 - brow * 10;
      s += line([cx - 15, y + 2], [cx + 15, y - 1 * sd * 0 - 1], 5, brow > 0.05 ? HL : '#3a4250', brow > 0.05 ? 'filter="url(#glow)"' : '');
    });
    // ojos
    [74, 126].forEach(cx => {
      const ry = 6.5 * (1 - eye * 0.92);
      s += `<ellipse cx="${cx}" cy="92" rx="10" ry="${f1(Math.max(0.6, ry))}" fill="#fff"/>`;
      if (ry > 2) s += circ([cx, 92], Math.min(4, ry), '#2b3440');
      if (eye > 0.05) s += line([cx - 11, 92], [cx + 11, 92], 2.5, HL, 'filter="url(#glow)"');
    });
    s += `<path d="M100,96 L94,118 L104,118" fill="none" stroke="#9aa6b5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    // boca
    if (oo > 0.05) s += `<ellipse cx="100" cy="140" rx="${f1(14 - oo * 6)}" ry="${f1(4 + oo * 8)}" fill="#3b1f2b" stroke="${HL}" stroke-width="3" filter="url(#glow)"/>`;
    else {
      const w = 22 + smile * 8, c = 4 + smile * 12;
      s += `<path d="M${100 - w},138 Q100,${138 + c} ${100 + w},138" fill="none" stroke="${smile > 0.05 ? HL : '#b4536a'}" stroke-width="4.5" stroke-linecap="round" ${smile > 0.05 ? 'filter="url(#glow)"' : ''}/>`;
    }
    const txt = ['ELEVAR CEJAS', 'CERRAR OJOS SUAVE', 'SONRISA', 'VOCALES O · U'][i];
    return s + label(txt);
  }

  G.SMCustom = { hand, foot, face };
})(window);
/* =====================================================================
   Plantillas de movimiento (≈130). Cada ejercicio de la biblioteca
   apunta a una de estas plantillas mediante su campo "anim".
   Coordenadas: lienzo 200×200, suelo en y=184, la figura mira a la derecha.
   Ángulos: 0 = abajo, 90 = adelante, 180 = arriba, -90 = atrás.
   ===================================================================== */
(function (G) {
  'use strict';
  const A = G.SMAnim, dir = A.dir;
  const AY = 179;                                       // altura del tobillo de pie
  const S = o => Object.assign({ x: 100, y: 100, t: 180, F1: [104, AY], F2: [99, AY], a1: 4, e1: 8 }, o || {});
  const kneel = (kx, l1, o) => { const d = dir(l1); return Object.assign({ x: kx - d[0] * 40, y: 177 - d[1] * 40, l1, k1: -90, pf: false, f1: 0 }, o || {}); };
  const plank = (Sh, Ft, extra) => {
    // en el suelo se apoya la punta del pie (pie casi vertical, talón arriba), no el empeine
    const toes = Ft[1] >= 175 && Ft[0] < Sh[0];
    if (toes) Ft = [Ft[0], Ft[1] - 9];
    const v = [Ft[0] - Sh[0], Ft[1] - Sh[1]], m = Math.hypot(v[0], v[1]), r = 46 + 79.6;
    const F = [Sh[0] + v[0] / m * r, Sh[1] + v[1] / m * r];      // cuerpo recto: sin rodillas dobladas hacia el suelo
    return Object.assign({ x: Sh[0] + v[0] / m * 46, y: Sh[1] + v[1] / m * 46, S: Sh, F1: F, F2: [F[0] - 3.5, F[1]] }, toes ? { f1: 22, f2: 22 } : {}, extra || {});
  };
  const kneePlank = (Sh, K, extra) => {
    const v = [K[0] - Sh[0], K[1] - Sh[1]], m = Math.hypot(v[0], v[1]);
    const hip = [Sh[0] + v[0] / m * 46, Sh[1] + v[1] / m * 46];
    return Object.assign({ x: hip[0], y: hip[1], S: Sh, pf: false, l1: A.ang(K[0] - hip[0], K[1] - hip[1]), k1: -150, f1: 0 }, extra || {});
  };
  const T = {};
  const add = (name, label, def) => { def.label = label; T[name] = def; };

  // Implementos reutilizables
  const BB = { type: 'barbell', at: 'wr1' };
  const BBback = { type: 'barbell', at: J => A.mv(A.mv(J.shc, J.t + 90, 7), J.t + 180, 3), r: 11, layer: 'mid' };
  const DB = [{ type: 'db', at: 'hd2', layer: 'mid', dim: true }, { type: 'db', at: 'hd1' }];
  const DB1 = [{ type: 'db', at: 'hd1' }];
  const DBF = [{ type: 'db', at: 'hd1' }, { type: 'db', at: 'hd2' }];        // vista frontal
  const KB = [{ type: 'kb', at: 'hd1' }];
  const flatBench = { type: 'bench', a: [36, 141], b: [150, 141] };
  const seat = { type: 'bench', a: [60, 128], b: [104, 128], legs: [68, 96] };

  /* ============================== TREN INFERIOR ============================== */
  add('squat', 'Sentadilla con barra trasera', {
    base: S({ t: 176, h1: [-3, -7], h: -4, F1: [97, AY], F2: [92, AY] }), props: [BBback],
    frames: [{}, { x: 73, y: 136, t: 140, h: 12 }]
  });
  add('squat_front', 'Sentadilla frontal', {
    base: S({ t: 178, a1: 102, e1: -112 }), props: [{ type: 'barbell', at: J => A.mv(J.shc, J.t - 90, 9) }],
    frames: [{}, { x: 84, y: 141, t: 156 }]
  });
  add('squat_goblet', 'Sentadilla goblet', {
    base: S({ t: 178, h1: [-5, 10] }), props: [{ type: 'kb', at: 'hd1', up: false }],
    frames: [{}, { x: 82, y: 142, t: 150 }]
  });
  add('squat_bw', 'Sentadilla peso corporal', {
    base: S({ t: 178, a1: 4, e1: 8 }),
    frames: [{}, { x: 80, y: 140, t: 140, a1: 92, e1: 92 }]
  });
  add('squat_db', 'Sentadilla con mancuernas', {
    base: S({ t: 178, a1: 2, e1: 2 }), props: DB,
    frames: [{}, { x: 82, y: 140, t: 148, a1: 4, e1: 4 }]
  });
  add('squat_machine', 'Sentadilla en máquina (hack / pendular)', {
    base: S({ t: 166, h1: [-2, -6], F1: [114, AY], F2: [109, AY] }),
    props: [{ type: 'pad', a: J => A.mv(J.hip, J.t + 90, 9), b: J => A.mv(J.shc, J.t + 90, 9), w: 7, layer: 'back' }],
    frames: [{}, { x: 86, y: 140, t: 150 }]
  });
  add('squat_belt', 'Sentadilla con cinturón (belt squat)', {
    base: S({ t: 178, H1: [128, 96] }),
    props: [{ type: 'box', x: 70, y: 176, w: 64 }, { type: 'cable', from: J => [J.hip[0] + 2, J.hip[1] + 6], to: J => [J.hip[0] + 2, 176], w: 2.5 }, { type: 'pad', a: [128, 92], b: [128, 176], w: 4 }],
    frames: [{}, { x: 86, y: 136, t: 160 }]
  });
  add('squat_overhead', 'Sentadilla con brazos arriba', {
    base: S({ t: 178, a1: 178, e1: 178 }), props: [BB],
    frames: [{}, { x: 86, y: 140, t: 158, a1: 174, e1: 174 }]
  });
  add('squat_zercher', 'Sentadilla Zercher', {
    base: S({ t: 178, a1: 30, e1: 150 }), props: [{ type: 'barbell', at: 'el1' }],
    frames: [{}, { x: 84, y: 140, t: 158 }]
  });
  add('squat_sumo', 'Sentadilla sumo (frontal)', {
    base: { view: 'front', x: 100, y: 104, t: 180, F1: [132, AY], a1: 8, e1: 6, h1: [-22, -6] },
    props: [{ type: 'kb', at: J => [(J.hd1[0] + J.hd2[0]) / 2, (J.hd1[1] + J.hd2[1]) / 2] }],
    frames: [{}, { y: 138 }]
  });
  // sumo en déficit con landmine: un pie en cada cajón, de frente al anclaje y la punta de la barra entre los pies
  // de atrás y las manos toman la punta, con los discos adelante
  add('squat_sumo_landmine', 'Sentadilla sumo en déficit con Landmine', {
    base: { x: 98, y: 100, t: 180, F1: [104, 165], F2: [99, 165], H1: [106, 134], ts1: 0.8, ss1: 0.85, ts2: 0.8, ss2: 0.85, pf: true, f1: 78 },
    props: [{ type: 'landmine', pivot: [236, 182], grip: 4 }, { type: 'box', x: 84, y: 170, w: 34 }],
    props3: [{ type: 'landmine', pivot: [236, 182], grip: 4 }, { type: 'footbox', y: 170, w: 30, d: 18 }],
    frames: [{ d: 1 }, { x: 84, y: 136, t: 156, H1: [108, 152], ts1: 0.7, ss1: 0.85, ts2: 0.7, ss2: 0.85, d: 1.2 }]
  });
  add('squat_banded', 'Sentadilla con bandas / cadenas', {
    base: S({ t: 176, h1: [-3, -7], h: -4, F1: [97, AY], F2: [92, AY] }), props: [BBback, { type: 'band', from: J => A.mv(J.shc, J.t + 90, 7), to: [94, 184] }],
    frames: [{}, { x: 73, y: 136, t: 140, h: 12 }]
  });
  add('squat_spanish', 'Spanish squat (banda tras rodillas)', {
    base: S({ t: 180, a1: 92, e1: 92, F1: [110, AY], F2: [105, AY] }),
    props: [{ type: 'tower', x: 184, top: 120, pulleys: [150] }, { type: 'band', from: [184, 150], to: 'kn1' }],
    frames: [{}, { x: 74, y: 136, t: 168 }]
  });
  add('squat_mini', 'Mini sentadilla a cajón', {
    base: S({ t: 178, a1: 90, e1: 90 }), props: [{ type: 'box', x: 46, y: 140, w: 40 }],
    frames: [{}, { x: 84, y: 124, t: 156 }]
  });
  add('squat_slant', 'Sentadilla en plano declinado', {
    base: S({ t: 180, a1: 90, e1: 90, F1: [114, 166], F2: [110, 168], f1: 100, f2: 100 }),
    props: [{ type: 'slant', x: 70, w: 80, h: 30 }],
    frames: [{ x: 108, y: 88 }, { x: 96, y: 128, t: 168 }]
  });
  add('sissy', 'Sissy squat', {
    base: S({ t: 182, a1: 70, e1: 80 }),
    frames: [{}, { x: 118, y: 136, t: 210, F1: [104, 172], F2: [99, 172], f1: 35, a1: 80, e1: 90 }]
  });
  add('legpress', 'Prensa de piernas', {
    // trineo a 45°: la planta completa apoyada en la plataforma (punta hacia arriba, talón abajo) y la
    // plataforma perpendicular al recorrido. Abajo la rodilla flexiona ~90° y la tibia queda casi
    // perpendicular a la plataforma; arriba la rodilla queda apenas flexionada (sin bloquear).
    base: { x: 72, y: 150, t: 236, h: -14, H1: [76, 160], F1: [91, 97], F2: [87, 99], pf: true, f1: 225, f2: 225 },
    props: [{ type: 'pad', a: [71, 159], b: [29, 131], w: 10 }, { type: 'pad', a: [62, 163], b: [92, 165], w: 8 }, { type: 'platform', at: J => A.mv(J.an1, 187, 6), a: 45 }, { type: 'pad', a: J => A.mv(A.mv(J.an1, 187, 6), 45, 14), b: J => A.mv(A.mv(A.mv(J.an1, 187, 6), 45, 14), 135, -10), w: 4 }, { type: 'pad', a: [76, 168], b: [72, 184], w: 5 }],
    props3: [{ type: 'pad', a: [69, 164], b: [27, 136], w: 6 }, { type: 'pad', a: [62, 167], b: [92, 169], w: 6 }, { type: 'platform', at: J => A.mv(J.an1, 187, 6), a: 45 }, { type: 'pad', a: [76, 170], b: [72, 184], w: 4 }],
    frames: [{}, { F1: [107.6, 80.6], F2: [103.6, 82.6] }]
  });
  // máquina hack: espalda apoyada en el carro inclinado (~35°), hombros bajo las almohadillas,
  // pies en la plataforma inclinada; la cadera baja a lo largo de los rieles
  add('hack', 'Hack squat', {
    base: { x: 88, y: 100, t: 215, F1: [128, 158], F2: [124, 158], h1: [4, -2], pf: true, f1: 110, f2: 110 },
    props: [{ type: 'pad', a: [112, 156], b: [32, 41], w: 4 }, { type: 'pad', a: [112, 156], b: [112, 184], w: 4 }, { type: 'pad', a: [40, 52], b: [30, 184], w: 4 },
      { type: 'platform', at: [134, 163], a: 110 }, { type: 'pad', a: [142, 166], b: [150, 184], w: 4 },
      { type: 'pad', a: J => A.mv(J.hip, J.t + 90, 9), b: J => A.mv(J.shc, J.t + 90, 9), w: 8 }, { type: 'pad', a: J => A.mv(J.shc, J.t, 5), b: J => A.mv(A.mv(J.shc, J.t, 5), J.t - 90, 9), w: 5 }],
    props3: [{ type: 'hackframe', rail: [[112, 156], [32, 41]] }, { type: 'platform', at: [134, 163], a: 110 }],
    frames: [{}, { x: 109, y: 130 }]
  });
  add('leg_ext', 'Extensión de rodilla en máquina', {
    base: { x: 82, y: 118, t: 186, pf: false, l1: 90, k1: 2, H1: [88, 128], f1: 85 },
    props: [seat, { type: 'pad', a: [62, 126], b: [56, 72], w: 8 }, { type: 'roller', at: J => A.mv(J.an1, J.k1 - 90, 6), r: 5 }],
    frames: [{}, { k1: 84 }]
  });
  add('leg_ext_iso', 'Isometría de cuádriceps a 60°', {
    base: { x: 82, y: 118, t: 186, pf: false, l1: 90, k1: 30, H1: [88, 128] },
    props: [seat, { type: 'pad', a: [62, 126], b: [56, 72], w: 8 }, { type: 'roller', at: J => A.mv(J.an1, J.k1 - 90, 6), r: 5 }],
    frames: [{}, { k1: 32 }], pulse: true, dur: 2
  });
  add('leg_curl_seated', 'Curl femoral sentado', {
    base: { x: 82, y: 118, t: 186, pf: false, l1: 90, k1: 86, H1: [96, 116] },
    props: [seat, { type: 'pad', a: [62, 126], b: [56, 72], w: 8 }, { type: 'roller', at: J => A.mv(J.an1, J.k1 - 90, 6), r: 5 }, { type: 'pad', a: [96, 112], b: [112, 112], w: 6 }],
    frames: [{}, { k1: -6 }]
  });
  add('leg_curl_lying', 'Curl femoral tumbado', {
    base: { x: 112, y: 128, t: -86, h: 4, pf: false, l1: 92, k1: 92, H1: [56, 140], f1: 80 },
    props: [{ type: 'bench', a: [40, 137], b: [150, 137] }, { type: 'roller', at: J => A.mv(J.an1, J.k1 + 90, 6), r: 5 }],
    frames: [{}, { k1: 200 }]
  });
  add('leg_curl_iso', 'Curl femoral isométrico', {
    base: { x: 112, y: 128, t: -86, h: 4, pf: false, l1: 92, k1: 130, H1: [56, 140] },
    props: [{ type: 'bench', a: [40, 137], b: [150, 137] }],
    frames: [{ k1: 120, d: 1 }, { k1: 122, d: 1 }, { k1: 150, d: .4 }, { k1: 152, d: 1 }, { k1: 180, d: .4 }, { k1: 182, d: 1 }], dur: 5
  });
  add('leg_curl_standing', 'Curl femoral de pie', {
    base: S({ t: 182, H1: [124, 96], F2: [99, AY] }),
    props: [{ type: 'tower', x: 132, top: 60, pulleys: [176] }, { type: 'cable', from: [132, 176], to: 'an1' }],
    frames: [{ l1: 0, k1: 0, pf: true }, { l1: 6, k1: -110 }]
  });
  // zancada real: el pie que avanza se levanta, da el paso y apoya el talón; el otro pie no se mueve
  // (solo despega el talón). Baja hasta que la rodilla de atrás casi toca el suelo y vuelve con un paso.
  const lungeFwd = (arms, props) => {
    const step = { x: 74, y: 102, t: 182, F1: [97, 165], f1: 70, d: 0.45, ease: 'linear' };
    const land = { x: 92, y: 110, t: 180, F1: [134, AY], f1: 78, F2: [57, 176], f2: 50, d: 0.55 };
    return {
      base: S(Object.assign({ x: 56, F1: [60, AY], F2: [55, AY] }, arms)), props, dur: 3.6, cx: 92,
      frames: [{ d: 0.3 }, { d: 0.45, ease: 'in' }, step, Object.assign({}, land, { ease: 'out' }),
        { x: 98, y: 136, t: 178, F2: [57, 171], f2: 25, d: 0.3 }, { d: 0.55, ease: 'in' },
        Object.assign({}, land, { ease: 'linear', d: 0.45 }), Object.assign({}, step, { ease: 'out' })]
    };
  };
  add('lunge', 'Zancada', lungeFwd({ a1: 2, e1: 2 }, DB));
  add('lunge_bw', 'Zancada sin carga', lungeFwd({ a1: 4, e1: 8 }));
  add('lunge_bb', 'Zancada con barra', lungeFwd({ h1: [-3, -9] }, [BBback]));
  add('lunge_reverse', 'Zancada trasera', (() => {
    const step = { x: 116, y: 102, t: 180, F2: [92, 166], f2: 100, d: 0.45, ease: 'linear' };
    const land = { x: 104, y: 112, F2: [46, 172], f2: 25, d: 0.55 };
    return {
      base: S({ x: 120, a1: 2, e1: 2, F1: [124, AY], F2: [119, AY] }), props: DB, dur: 3.6, cx: 88,
      frames: [{ d: 0.3 }, { d: 0.45, ease: 'in' }, step, Object.assign({}, land, { ease: 'out' }),
        { x: 90, y: 136, t: 178, F2: [46, 171], d: 0.3 }, { d: 0.55, ease: 'in' },
        Object.assign({}, land, { ease: 'linear', d: 0.45 }), Object.assign({}, step, { ease: 'out' })]
    };
  })());
  add('split_squat', 'Sentadilla búlgara', {
    base: { x: 104, y: 104, t: 180, a1: 2, e1: 2, F1: [128, AY], F2: [58, 136], f2: -80 },
    props: [{ type: 'bench', a: [30, 145], b: [64, 145], legs: [40, 58] }, ...DB],
    frames: [{}, { x: 96, y: 138, t: 172 }]
  });
  add('lunge_knee', 'Zancada de rodilla al frente (movilidad tobillo)', {
    base: { x: 96, y: 124, t: 180, F1: [124, AY], F2: [64, 174], f2: 20, a1: 30, e1: 70 },
    props: [{ type: 'wall', x: 168 }, { type: 'band', from: 'an1', to: [40, 172] }],
    frames: [{}, { x: 108, y: 128, t: 176 }]
  });
  add('lunge_halfkneel_stretch', 'Estiramiento de flexores en caballero', {
    base: { x: 90, y: 136, t: 180, pf: false, l2: 6, k2: -90, f2: 0, F1: [128, AY], pf1: true, h1: [-40, 4] },
    props: [{ type: 'foam', x: 70, w: 30 }],
    frames: [{}, { x: 100, y: 138, t: 186, l2: -22 }]
  });
  add('stepup', 'Step-up al cajón', {
    base: { x: 94, y: 118, t: 176, F1: [126, 151], F2: [96, AY], a1: 2, e1: 2 },
    props: [{ type: 'box', x: 110, y: 156, w: 44 }, ...DB],
    frames: [{}, { x: 122, y: 73, t: 182, F2: [118, 151] }]
  });
  add('stepdown', 'Step-down / Poliquin', {
    base: { x: 104, y: 74, t: 180, F1: [110, 151], F2: [124, 156], f1: 78, a1: 90, e1: 90 },
    props: [{ type: 'box', x: 84, y: 156, w: 44 }],
    frames: [{}, { x: 96, y: 104, t: 168, F2: [136, 177] }]
  });
  add('calf', 'Elevación de talones de pie', {
    base: S({ a1: 2, e1: 2, f1: 78 }), props: DB,
    frames: [{}, { x: 103.5, y: 91, F1: [107.6, 170.4], F2: [102.6, 170.4], f1: 30, f2: 30 }]
  });
  add('calf_machine', 'Elevación de talones en máquina', {
    base: S({ h1: [4, 6], f1: 78 }),
    props: [{ type: 'pad', a: J => A.mv(J.shc, J.t + 90, 4), b: J => A.mv(J.shc, J.t - 90, 16), w: 7, layer: 'hand' }, { type: 'box', x: 92, y: 178, w: 30 }],
    frames: [{ y: 94, F1: [104, 173], F2: [99, 173] }, { y: 84, F1: [104, 163], F2: [99, 163], f1: 30, f2: 30 }]
  });
  add('calf_seated', 'Elevación de talones sentado', {
    base: { x: 78, y: 126, t: 182, F1: [118, 166], F2: [114, 166], f1: 78, H1: [112, 120] },
    props: [{ type: 'bench', a: [44, 134], b: [92, 134], legs: [52, 84] }, { type: 'barbell', at: 'kn1', r: 10 }],
    frames: [{}, { F1: [118, 158], F2: [114, 158], f1: 32 }]
  });
  add('tibialis', 'Elevación de tibiales', {
    base: { x: 78, y: 112, t: 186, F1: [112, AY], F2: [108, AY], f1: 78, a1: 4, e1: 4 },
    props: [{ type: 'wall', x: 62 }],
    frames: [{}, { f1: 130, f2: 130 }]
  });
  add('rdl', 'Peso muerto rumano', {
    base: S({ H1: [106, 112] }), props: [BB],
    frames: [{}, { x: 76, y: 104, t: 100, H1: [106, 156] }]
  });
  add('rdl_db', 'Peso muerto rumano con mancuernas', {
    base: S({ H1: [106, 112] }), props: DB,
    frames: [{}, { x: 76, y: 104, t: 100, H1: [106, 156] }]
  });
  add('rdl_single', 'Peso muerto rumano a una pierna', {
    base: S({ a1: 2, e1: 2, F2: [97, 174] }), props: DB1,
    frames: [{}, { x: 86, y: 104, t: 96, l2: -96, k2: -96, pf: true, a1: 2, e1: 2 }]
  });
  add('diver', 'The Diver (Askling)', {
    base: S({ a1: 4, e1: 4, F2: [97, 174] }),
    frames: [{}, { x: 86, y: 104, t: 98, l2: -94, k2: -94, a1: 96, e1: 96 }]
  });
  // abajo la barra queda con los discos en el suelo (centro a y 171) y por delante de la canilla
  add('deadlift', 'Peso muerto', {
    base: { x: 78, y: 140, t: 118, F1: [110, AY], F2: [105, AY], H1: [119, 170] }, props: [BB],
    frames: [{ d: 1 }, { x: 104, y: 100, t: 180, H1: [109, 113], d: 1.2 }], thumb: 0.04
  });
  // resistencia acomodada: barra con cadenas que cuelgan de las mangas y se levantan del suelo al subir
  add('deadlift_banded', 'Peso muerto con bandas / cadenas', {
    base: { x: 78, y: 140, t: 118, F1: [110, AY], F2: [105, AY], H1: [119, 170] }, props: [BB, { type: 'chain', at: 'wr1' }],
    frames: [{ d: 1 }, { x: 104, y: 100, t: 180, H1: [109, 113], d: 1.2 }], thumb: 0.04
  });
  // sumo: pies muy abiertos, cadera más baja y tronco más vertical que el convencional.
  // De perfil el muslo y la canilla se ven acortados (ts/ss): en 3D eso abre las piernas hacia los lados.
  // Barra con discos más afuera y agarre angosto (manos por dentro de las rodillas).
  add('deadlift_sumo', 'Peso muerto sumo', {
    base: { x: 82, y: 150, t: 128, F1: [106, AY], F2: [101, AY], H1: [118, 170], ts1: 0.8, ss1: 0.9, ts2: 0.8, ss2: 0.9 },
    props: [{ type: 'barbell', at: 'wr1', wide: true, grip: 15 }],
    frames: [{ d: 1 }, { x: 104, y: 104, t: 180, H1: [108, 117], ts1: 0.95, ss1: 0.95, ts2: 0.95, ss2: 0.95, d: 1.2 }], thumb: 0.04
  });
  // barra hexagonal: las manos van a los costados (agarre neutro) y el marco rodea al cuerpo
  add('deadlift_trap', 'Peso muerto con barra hexagonal', {
    base: { x: 84, y: 150, t: 128, F1: [110, AY], F2: [105, AY], H1: [114, 170] },
    props: [{ type: 'barbell', at: 'wr1', hex: true }],
    frames: [{ d: 1 }, { x: 104, y: 100, t: 180, H1: [105, 121], d: 1.2 }], thumb: 0.04
  });
  add('deadlift_db', 'Peso muerto con mancuernas', {
    base: { x: 84, y: 150, t: 128, F1: [110, AY], F2: [105, AY], H1: [114, 170] }, props: DB,
    frames: [{ d: 1 }, { x: 104, y: 100, t: 180, H1: [105, 121], d: 1.2 }], thumb: 0.04
  });
  // la barra parte apoyada en dos bloques bajo los discos, a la altura de la rodilla
  add('rackpull', 'Rack pull', {
    base: { x: 82, y: 112, t: 138, F1: [104, AY], F2: [99, AY], H1: [108, 128] },
    props: [{ type: 'pad', a: [108, 143], b: [108, 184], w: 16 }, BB],
    props3: [BB, { type: 'blocks', x: 108, y: 141, z: [-44, 44], w: 24, d: 12 }],
    frames: [{}, { x: 100, y: 100, t: 180, H1: [104, 112] }]
  });
  add('goodmorning', 'Buenos días (good morning)', {
    base: S({ h1: [-3, -9], h: -4 }), props: [BBback],
    frames: [{}, { x: 78, y: 104, t: 98, h: 10 }]
  });
  add('hipthrust', 'Hip thrust con barra', {
    // manos tomando la barra sobre la cadera
    base: { x: 92, y: 160, S: [60, 125], h: -20, F1: [134, AY], F2: [130, AY], H1: [98, 150], pf: true },
    props: [{ type: 'bench', a: [16, 132], b: [64, 132], legs: [24, 56] }, { type: 'barbell', at: 'hipTop' }],
    frames: [{}, { x: 104, y: 126, H1: [104, 113] }]
  });
  add('hipthrust_machine', 'Hip thrust en máquina / suelo con polea', {
    base: { x: 92, y: 160, S: [60, 125], h: -20, F1: [134, AY], F2: [130, AY], H1: [96, 150], pf: true },
    props: [{ type: 'bench', a: [16, 132], b: [64, 132], legs: [24, 56] }, { type: 'pad', a: J => A.mv(J.hipTop, J.t + 180, 12), b: J => A.mv(J.hipTop, J.t, 12), w: 6, layer: 'hand' }],
    frames: [{}, { x: 104, y: 126 }]
  });
  add('bridge', 'Puente de glúteo', {
    base: { x: 91, y: 175, S: [46, 177], h: -10, F1: [124, AY], F2: [120, AY], H1: [97, 181], pf: true },
    frames: [{}, { x: 81, y: 147 }]
  });
  add('bridge_iso', 'Puente de glúteo isométrico', {
    base: { x: 81, y: 147, S: [46, 177], h: -10, F1: [124, AY], F2: [120, AY], H1: [97, 181], pf: true },
    frames: [{}, { y: 147 }], pulse: true, dur: 2
  });
  add('bridge_single', 'Puente de glúteo a una pierna', {
    base: { x: 91, y: 175, S: [46, 177], h: -10, F1: [124, AY], F2: [120, AY], H1: [97, 181], pf: true },
    frames: [{ l2: 150, k2: 150 }, { x: 81, y: 147, l2: 120, k2: 120 }]
  });
  add('kickback_glute', 'Patada de glúteo en polea', {
    base: S({ t: 166, H1: [128, 82], F1: [104, AY] }),
    props: [{ type: 'tower', x: 136, top: 50, pulleys: [176] }, { type: 'cable', from: [136, 176], to: 'an2', dim: true }],
    frames: [{ l2: 4, k2: -30 }, { l2: -44, k2: -40 }]
  });
  add('donkey_kick', 'Patada de glúteo en cuadrupedia', {
    base: { x: 72, y: 138, t: 92, pf: false, l1: 0, k1: -90, f1: 0, l2: 0, k2: -90, f2: 0, H1: [118, 182] },
    frames: [{}, { l2: -100, k2: -100 }]
  });
  add('pullthrough', 'Pull-through en polea', {
    base: S({ H1: [100, 116], F1: [114, AY], F2: [109, AY] }),
    props: [{ type: 'tower', x: 20, top: 60, pulleys: [176] }, { type: 'cable', from: [20, 176], to: 'hd1' }],
    frames: [{ x: 84, y: 106, t: 106, H1: [70, 150] }, { x: 102, y: 100, t: 182, H1: [108, 120] }]
  });
  add('swing', 'Swing con kettlebell', {
    base: { x: 82, y: 108, t: 120, F1: [108, AY], F2: [103, AY], H1: [88, 134] },
    props: [{ type: 'kb', at: 'hd1', along: 'hd1', from: 'el1' }],
    frames: [{ d: 1 }, { x: 102, y: 100, t: 184, H1: [146, 60], d: 1 }], dur: 1.6
  });
  // máquina de cadera: asiento con respaldo, almohadillas en las rodillas (por fuera para abrir,
  // por dentro para cerrar) y manillas a los lados del asiento. El muslo menos acortado = más abierto en 3D.
  const hipMachine = (mode, l0, l1) => ({
    // recl: el tronco acortado va hacia atrás (respaldo reclinado), no hacia la cámara
    base: { view: 'front', x: 100, y: 126, t: 180, sh: -4, recl: true, l1: l0[0], ts1: l0[1], k1: 0, ss1: 1, pf: false, H1: [127, 136] },
    props: [{ type: 'box', x: 70, y: 130, w: 60 }, { type: 'pad', a: J => [J.kn1[0] + (mode === 'out' ? 7 : -7), J.kn1[1] - 9], b: J => [J.kn1[0] + (mode === 'out' ? 7 : -7), J.kn1[1] + 9], w: 5 },
      { type: 'pad', a: J => [J.kn2[0] + (mode === 'out' ? -7 : 7), J.kn2[1] - 9], b: J => [J.kn2[0] + (mode === 'out' ? -7 : 7), J.kn2[1] + 9], w: 5 }],
    props3: [{ type: 'hipmachine', mode }],
    frames: [{ l1: l0[0], ts1: l0[1] }, { l1: l1[0], ts1: l1[1] }]
  });
  add('abduction_machine', 'Abducción en máquina', hipMachine('out', [18, 0.38], [72, 0.72]));
  // sentado en un cajón, sin máquina (con banda en las rodillas)
  add('abduction_seated', 'Abducción sentado con banda', {
    base: { view: 'front', x: 100, y: 126, t: 180, l1: 18, ts1: 0.38, k1: 0, pf: false, H1: [126, 134] },
    props: [{ type: 'box', x: 70, y: 130, w: 60 }, { type: 'band', from: 'kn1', to: 'kn2' }],
    frames: [{ l1: 18, ts1: 0.38 }, { l1: 72, ts1: 0.72 }]
  });
  // aducción: termina con las rodillas a un palmo (las almohadillas quedan juntas al centro), no pegadas
  add('adduction_machine', 'Aducción en máquina', hipMachine('in', [72, 0.72], [32, 0.46]));
  add('abduction_standing', 'Abducción de pie (polea / banda)', {
    base: { view: 'front', x: 96, y: 99, t: 180, l1: 2, k1: 2, l2: -2, k2: -2, a1: 4, e1: 4, H2: [56, 98] },
    props: [{ type: 'tower', x: 40, top: 40, pulleys: [176] }, { type: 'cable', from: [40, 176], to: 'an1' }],
    frames: [{}, { l1: 40, k1: 40, t: 174 }]
  });
  add('adduction_standing', 'Aducción de pie (polea)', {
    base: { view: 'front', x: 104, y: 99, t: 180, l1: 30, k1: 30, l2: -2, k2: -2, a1: 4, e1: 4 },
    props: [{ type: 'tower', x: 180, top: 40, pulleys: [176] }, { type: 'cable', from: [180, 176], to: 'an1' }],
    frames: [{}, { l1: -14, k1: -14 }]
  });
  add('side_leg_raise', 'Abducción de cadera en decúbito lateral', {
    // brazo de abajo estirado bajo la cabeza; mano de arriba apoyada en el suelo frente al pecho
    base: { view: 'front', x: 100, y: 168, t: -90, l1: 90, k1: 90, l2: 92, k2: 92, H1: [70, 177], H2: [14, 178], h: 0, pf: false },
    frames: [{}, { l1: 130, k1: 130 }]
  });
  add('monster', 'Monster walk con banda', {
    base: { view: 'front', x: 100, y: 112, t: 180, F1: [120, AY], F2: [80, AY], a1: 30, e1: 80 },
    props: [{ type: 'band', from: 'kn1', to: 'kn2' }],
    frames: [{}, { x: 108, F1: [138, AY] }, { x: 114, F2: [94, AY], F1: [138, AY] }], dur: 2.4
  });
  add('cossack', 'Sentadilla cosaca', {
    base: { view: 'front', x: 100, y: 104, t: 180, F1: [146, AY], F2: [54, AY], h1: [-24, -8] },
    frames: [{}, { x: 126, y: 140, t: 172 }, {}, { x: 74, y: 140, t: 188 }], dur: 3.6
  });
  add('copenhagen', 'Plancha de Copenhague', {
    base: { view: 'front', x: 104, y: 150, t: -112, pf: false, l1: 76, k1: 76, l2: 60, k2: 60, a2: 0, e2: -90, fs2: 0.6, a1: 68, e1: 68 },
    props: [{ type: 'bench', a: [150, 150], b: [204, 150], legs: [160, 196] }],
    frames: [{ y: 156, t: -110 }, { y: 144, t: -114 }], pulse: true
  });
  add('nordic', 'Nordic hamstring curl', {
    base: kneel(78, 0, { t: 180, a1: 30, e1: 80 }),
    props: [{ type: 'foam', x: 62, w: 34 }, { type: 'pad', a: [30, 172], b: [44, 172], w: 6 }],
    frames: [{ d: 1 }, Object.assign(kneel(78, -48), { t: 132, a1: 100, e1: 130, d: 1.4 }), Object.assign(kneel(78, -70), { t: 110, a1: 110, e1: 160, d: .4 })]
  });
  add('reverse_nordic', 'Reverse nordic', {
    base: kneel(78, 0, { t: 180, a1: 90, e1: 90 }),
    props: [{ type: 'foam', x: 62, w: 34 }],
    frames: [{}, Object.assign(kneel(78, 32), { t: 212, a1: 120, e1: 120 })]
  });
  add('ghr', 'Glute ham raise (GHD)', {
    base: { x: 124, y: 130, t: 90, h: -6, pf: false, l1: -88, k1: -96, f1: 0, h1: [-8, 8] },
    props: [{ type: 'pad', a: [76, 136], b: [96, 136], w: 9 }, { type: 'pad', a: [86, 140], b: [86, 184], w: 4 }, { type: 'pad', a: [40, 120], b: [40, 140], w: 6 }],
    frames: [{}, { x: 86, y: 92, t: 176, l1: -6, k1: -94 }]
  });
  add('hip_flexion', 'Flexión de cadera en polea', {
    base: S({ H1: [72, 96] }),
    props: [{ type: 'tower', x: 60, top: 60, pulleys: [176] }, { type: 'cable', from: [60, 176], to: 'an1' }],
    frames: [{ l1: 0, k1: 0 }, { l1: 104, k1: 4, pf: true }]
  });
  add('knee_raise', 'Elevación de rodilla / marcha', {
    base: S({ y: 99, a1: 4, e1: 8 }),
    frames: [{ l1: 0, k1: 0, l2: 0, k2: 0 }, { l1: 96, k1: 0 }, { l1: 0, k1: 0 }, { l2: 96, k2: 0 }], dur: 2.4
  });
  add('psoas_march', 'Psoas march en supino', {
    base: { x: 100, y: 175, t: -90, h: 0, pf: false, l1: 180, k1: 90, l2: 180, k2: 90, a1: 92, e1: 92 },
    props: [{ type: 'band', from: 'an1', to: 'an2' }],
    frames: [{}, { l1: 120, k1: 120 }, {}, { l2: 120, k2: 120 }], dur: 2.8
  });
  add('tke', 'Extensión terminal de rodilla con banda', {
    base: { x: 96, y: 104, t: 178, F1: [104, AY], F2: [60, 172], f2: 25, a1: 4, e1: 8 },
    props: [{ type: 'tower', x: 182, top: 120, pulleys: [150] }, { type: 'band', from: [182, 150], to: 'kn1' }],
    frames: [{ x: 98, y: 102 }, { x: 102, y: 108 }]
  });
  add('slr', 'Elevación de pierna recta (SLR)', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 90, k1: 90, F2: [136, AY], a1: 90, e1: 90 },
    frames: [{}, { l1: 140, k1: 140 }]
  });
  add('slr_band', 'SLR con banda (neurodinamia)', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 120, k1: 120, F2: [136, AY], h1: [-34, 14] },
    props: [{ type: 'band', from: 'to1', to: 'hd1' }],
    frames: [{ f1: 70 }, { l1: 150, k1: 150, f1: 120 }]
  });
  add('heel_slide', 'Deslizamiento de talón', {
    base: { x: 104, y: 175, t: -90, pf: true, f1: 177, f2: 177, l1: 92, k1: 92, l2: 92, k2: 92, a1: 92, e1: 92 },
    props: [{ type: 'roller', at: J => [J.an1[0] + 4, 182], r: 3 }],
    frames: [{}, { F1: [138, 178], f1: 100 }]
  });
  add('heel_prop', 'Extensión pasiva (heel prop)', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 88, k1: 92, l2: 90, k2: 90, a1: 92, e1: 92 },
    props: [{ type: 'roller', at: [176, 176], r: 7 }],
    frames: [{ l1: 86, k1: 94 }, { l1: 90, k1: 90 }], pulse: true
  });
  add('quad_set', 'Isometría de cuádriceps (quad set)', {
    base: { x: 72, y: 172, t: 186, pf: false, l1: 90, k1: 92, l2: 90, k2: 90, H1: [62, 182], f1: 90 },
    props: [{ type: 'roller', at: [112, 176], r: 6 }],
    frames: [{ k1: 96, f1: 80 }, { k1: 90, f1: 110 }], pulse: true, dur: 2
  });
  add('patella', 'Movilización de rótula', {
    base: { x: 72, y: 172, t: 166, pf: false, l1: 90, k1: 90, l2: 90, k2: 90, H1: [110, 172] },
    frames: [{ H1: [106, 172] }, { H1: [114, 172] }], dur: 1.4
  });
  add('ankle_pump', 'Bombeo de tobillo / alfabeto', {
    base: { x: 72, y: 172, t: 184, pf: false, l1: 90, k1: 90, l2: 90, k2: 90, H1: [62, 182], f1: 60 },
    frames: [{ f1: 50, f2: 50 }, { f1: 115, f2: 115 }], dur: 1.8
  });
  add('ankle_eversion', 'Eversión / inversión con banda', {
    base: { x: 72, y: 172, t: 184, pf: false, l1: 90, k1: 90, l2: 90, k2: 90, H1: [62, 182], f1: 85 },
    props: [{ type: 'band', from: 'to1', to: [196, 176] }],
    frames: [{ f1: 70 }, { f1: 105 }], dur: 1.8
  });
  add('balance', 'Equilibrio unipodal', {
    base: { x: 100, y: 100, t: 180, F1: [102, 171], f1: 78, l2: 20, k2: -70, a1: 60, e1: 70 },
    props: [{ type: 'foam', x: 80, w: 44 }],
    frames: [{ t: 177, x: 99 }, { t: 183, x: 101 }], dur: 1.6
  });
  add('balance_bosu', 'Equilibrio en Bosu', {
    base: { x: 100, y: 89, t: 180, F1: [102, 167], f1: 78, l2: 20, k2: -70, a1: 60, e1: 70 },
    props: [{ type: 'bosu', x: 102 }],
    frames: [{ t: 176, x: 99 }, { t: 184, x: 101 }], dur: 1.4
  });
  add('star_excursion', 'Y-Balance / Star excursion', {
    base: { x: 100, y: 104, t: 180, F1: [104, AY], a1: 60, e1: 70 },
    frames: [{ F2: [100, AY] }, { x: 96, y: 110, t: 168, F2: [126, 168], pf: true }, { x: 92, y: 118, t: 158, F2: [150, 180] }, { x: 96, y: 110, t: 168, F2: [126, 168] },
      { F2: [100, AY], x: 100, y: 104, t: 180 }, { x: 106, y: 110, t: 156, F2: [72, 168] }, { x: 110, y: 118, t: 132, F2: [46, 180] }, { x: 106, y: 110, t: 156, F2: [72, 168] }], ease: 'linear', dur: 5
  });
  add('alphabet', 'Alfabeto con el pie', {
    base: { x: 72, y: 172, t: 184, pf: false, l1: 110, k1: 100, l2: 90, k2: 90, H1: [62, 182], f1: 85 },
    frames: [{ f1: 60 }, { f1: 110 }, { f1: 75 }, { f1: 120 }], dur: 3
  });
  add('foot_roll', 'Masaje plantar con pelota', {
    base: { x: 80, y: 130, t: 180, F1: [124, 172], F2: [114, AY], f1: 88, H1: [110, 126] },
    props: [{ type: 'box', x: 56, y: 136, w: 40 }, { type: 'ball', at: J => [J.an1[0] + 6, 178], r: 5, fill: '#ff6b8b', stroke: '#ffa3b6' }],
    frames: [{ F1: [118, 172] }, { F1: [132, 172] }], dur: 1.6
  });

  /* ============================== EMPUJES ============================== */
  const benchBody = { x: 118, y: 133, t: -90, h: 8, F1: [152, AY], F2: [148, AY], pf: true };
  add('bench', 'Press de banca', {
    base: Object.assign({}, benchBody, { H1: [76, 126] }), props: [flatBench, BB],
    frames: [{}, { H1: [74, 85] }]
  });
  add('bench_db', 'Press con mancuernas en banco', {
    base: Object.assign({}, benchBody, { H1: [78, 124], us1: 0.55, fs1: 0.95 }), props: [flatBench, ...DB],
    frames: [{}, { H1: [74, 85], us1: 1, fs1: 1 }]
  });
  add('bench_incline', 'Press inclinado', {
    base: { x: 116, y: 140, S: [80, 110], h: 6, F1: [154, AY], F2: [150, AY], H1: [86, 106] },
    props: [{ type: 'bench', a: [104, 146], b: [138, 146], legs: [112, 132], back: [[106, 146], [66, 112]] }, BB],
    frames: [{}, { H1: [96, 66] }]
  });
  add('bench_incline_db', 'Press inclinado con mancuernas', {
    base: { x: 116, y: 140, S: [80, 110], h: 6, F1: [154, AY], F2: [150, AY], H1: [88, 104], us1: 0.55, fs1: 0.95 },
    props: [{ type: 'bench', a: [104, 146], b: [138, 146], legs: [112, 132], back: [[106, 146], [66, 112]] }, ...DB],
    frames: [{}, { H1: [96, 66], us1: 1, fs1: 1 }]
  });
  add('bench_decline', 'Press declinado', {
    base: { x: 116, y: 122, S: [74, 140], h: 6, pf: false, l1: 120, k1: 20, H1: [80, 132] },
    props: [{ type: 'bench', a: [60, 150], b: [130, 128], legs: [76, 120] }, BB],
    frames: [{}, { H1: [80, 92] }]
  });
  add('bench_banded', 'Press de banca con bandas / cadenas', {
    base: Object.assign({}, benchBody, { H1: [76, 126] }), props: [flatBench, BB, { type: 'chain', at: 'wr1' }],
    frames: [{}, { H1: [74, 85] }]
  });
  add('floorpress', 'Floor press', {
    base: { x: 118, y: 175, t: -90, h: 0, F1: [150, AY], F2: [146, AY], pf: true, H1: [78, 166], e1s: -1 },
    props: [BB],
    frames: [{}, { H1: [76, 128] }]
  });
  add('fly', 'Aperturas con mancuernas', {
    // las manos bajan en arco hacia los costados (abajo, el brazo casi entero va hacia el lado: escorzo)
    base: Object.assign({}, benchBody, { H1: [72, 85], us1: 1, fs1: 1 }), props: [flatBench, ...DB],
    frames: [{ H1: [72, 134], us1: 0.14, fs1: 0.12 }, { H1: [72, 85], us1: 1, fs1: 1 }]
  });
  add('pullover', 'Pullover', {
    base: Object.assign({}, benchBody, { y: 133, a1: -96, e1: -96 }), props: [flatBench, { type: 'db', at: 'hd1', k: 1.3 }],
    frames: [{}, { a1: 178, e1: 178 }]
  });
  add('fly_front', 'Aperturas / cruces (vista frontal)', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [114, AY], H1: [154, 70] },
    frames: [{}, { H1: [104, 82] }]
  });
  // press de pecho en polea de pie (antes "cruces"): de espaldas a las poleas, pies escalonados y
  // tronco algo inclinado; las manos salen desde el pecho y empujan hacia adelante. Según la altura
  // de la polea el empuje va hacia abajo (alta), recto (media) o hacia arriba (baja).
  // En 3D las dos poleas quedan a los costados, por detrás (z ±44).
  const cablePress = (py, H0, H1) => ({
    base: { x: 96, y: 101, t: 172, F1: [114, AY], F2: [80, AY], f2: 50, H1: H0, us1: 0.7 },
    props: [{ type: 'tower', x: 26, top: 6, pulleys: [py] }, { type: 'cable', from: [26, py], to: 'hd2', dim: true }, { type: 'cable', from: [26, py], to: 'hd1' }, { type: 'handle', at: 'hd1' }],
    props3: [{ type: 'tower', x: 40, top: 6, pulleys: [py], z: 44 }, { type: 'tower', x: 40, top: 6, pulleys: [py], z: -44 }, { type: 'cable', from: [40, py], fz: 44, to: 'hd1' }, { type: 'cable', from: [40, py], fz: -44, to: 'hd2' }, { type: 'handle', at: 'hd1' }, { type: 'handle', at: 'hd2' }],
    frames: [{}, { H1, us1: 1 }]
  });
  add('cable_fly_high', 'Press en polea alta (hacia abajo)', cablePress(24, [110, 66], [146, 86]));
  add('cable_fly_mid', 'Press en polea media', cablePress(66, [110, 62], [148, 64]));
  add('cable_fly_low', 'Press en polea baja (hacia arriba)', cablePress(170, [110, 68], [144, 44]));
  // cruce de poleas (vista frontal): de pie al centro, una torre a cada lado algo por detrás (z -14), codos apenas
  // flectados y fijos; el movimiento es del hombro. Medio: poleas a la altura del hombro, los brazos cierran en arco
  // horizontal hasta juntar las manos frente al pecho (mismo ciclo que la contractora). Alto: poleas arriba, las manos
  // parten arriba y afuera y bajan en arco hacia adelante hasta juntarse frente a la parte baja del abdomen.
  const crossProps = py => ({
    props: [{ type: 'tower', x: 186, top: 6, pulleys: [py] }, { type: 'tower', x: 14, top: 6, pulleys: [py] },
      { type: 'cable', from: [186, py], to: 'hd1' }, { type: 'cable', from: [14, py], to: 'hd2' }, { type: 'handle', at: 'hd1' }, { type: 'handle', at: 'hd2' }],
    // en 3D las torres van más separadas (como una estación real): con los brazos abiertos queda cable entre mano y polea
    props3: [{ type: 'tower', x: 218, top: 6, pulleys: [py], z: -14 }, { type: 'tower', x: -18, top: 6, pulleys: [py], z: -14 },
      { type: 'cable', from: [218, py], fz: -14, to: 'hd1' }, { type: 'cable', from: [-18, py], fz: -14, to: 'hd2' }, { type: 'handle', at: 'hd1' }, { type: 'handle', at: 'hd2' }]
  });
  add('cable_cross_mid', 'Cruce de poleas medio', Object.assign(crossProps(53), {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [114, AY], a1: 90, e1: 90, us1: 1, fs1: 0.92 },
    frames: [{ d: 0.5 }, { us1: 0.87, fs1: 0.75, d: 0.3 }, { us1: 0.5, fs1: 0.4, d: 0.3 }, { us1: 0.05, fs1: 0.05, d: 0.03 }, { a1: 0, e1: 0, us1: 0.05, fs1: 0.05, d: 0.03 },
             { a1: -90, e1: -90, us1: 0.05, fs1: 0.05, d: 0.2 }, { a1: -90, e1: -90, us1: 0.22, fs1: 0.2, d: 0.6 }, { a1: -90, e1: -90, us1: 0.05, fs1: 0.05, d: 0.03 }, { a1: 0, e1: 0, us1: 0.05, fs1: 0.05, d: 0.03 },
             { a1: 90, e1: 90, us1: 0.05, fs1: 0.05, d: 0.45 }, { a1: 90, e1: 90, us1: 0.5, fs1: 0.4, d: 0.45 }, { a1: 90, e1: 90, us1: 0.87, fs1: 0.75, d: 0.45 }], free: true, ease: 'linear', dur: 3.4
  }));
  add('cable_cross_high', 'Cruce de poleas alto', Object.assign(crossProps(10), {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [118, AY], a1: 132, e1: 138, us1: 1, fs1: 0.94 },
    // arco con un punto medio (manos ya adelantadas a la altura del hombro) para que no corten camino por el costado
    frames: [{ d: 0.35 }, { d: 0.55, ease: 'in' }, { a1: 56, e1: 50, us1: 0.8, fs1: 0.78, d: 0.55, ease: 'out' }, { a1: -18, e1: -24, us1: 0.84, fs1: 0.8, d: 0.35 },
             { d: 0.9, ease: 'in' }, { a1: 56, e1: 50, us1: 0.8, fs1: 0.78, d: 0.9, ease: 'out' }], free: true, dur: 3.6
  }));
  add('pecdeck', 'Contractora (pec deck)', {
    // pec fly: espalda en el respaldo, brazos casi estirados a la altura del hombro (codo apenas flectado hacia adelante),
    // manillas verticales con agarre neutro; los brazos cierran en arco hasta juntar las manos frente al pecho
    base: { view: 'front', x: 100, y: 124, t: 180, l1: 20, k1: 0, ts1: 0.4, pf: false, a1: 90, e1: 90, us1: 1, fs1: 0.85 },
    props: [{ type: 'box', x: 74, y: 128, w: 52 }, { type: 'pad', a: [100, 62], b: [100, 128], w: 6, layer: 'back' },
      { type: 'pad', a: J => [J.hd1[0], J.shc[1] - 34], b: J => [J.hd1[0], J.hd1[1] - 9], w: 2.5, layer: 'back' }, { type: 'pad', a: J => [J.hd1[0], J.hd1[1] - 9], b: J => [J.hd1[0], J.hd1[1] + 9], w: 3.5, layer: 'hand' },
      { type: 'pad', a: J => [J.hd2[0], J.shc[1] - 34], b: J => [J.hd2[0], J.hd2[1] - 9], w: 2.5, layer: 'back' }, { type: 'pad', a: J => [J.hd2[0], J.hd2[1] - 9], b: J => [J.hd2[0], J.hd2[1] + 9], w: 3.5, layer: 'hand' }],
    // máquina: asiento, respaldo, marco sobre la cabeza con un brazo que baja a cada manilla y torre de pesas
    props3: [{ type: 'pecdeck' }],
    frames: [{ d: 0.5 }, { us1: 0.87, fs1: 0.7, d: 0.3 }, { us1: 0.5, fs1: 0.4, d: 0.3 }, { us1: 0.05, fs1: 0.05, d: 0.03 }, { a1: 0, e1: 0, us1: 0.05, fs1: 0.05, d: 0.03 },
             { a1: -90, e1: -90, us1: 0.05, fs1: 0.05, d: 0.2 }, { a1: -90, e1: -90, us1: 0.22, fs1: 0.2, d: 0.6 }, { a1: -90, e1: -90, us1: 0.05, fs1: 0.05, d: 0.03 }, { a1: 0, e1: 0, us1: 0.05, fs1: 0.05, d: 0.03 },
             { a1: 90, e1: 90, us1: 0.05, fs1: 0.05, d: 0.45 }, { a1: 90, e1: 90, us1: 0.5, fs1: 0.4, d: 0.45 }, { a1: 90, e1: 90, us1: 0.87, fs1: 0.7, d: 0.45 }], free: true, ease: 'linear', dur: 3.4
  });
  add('pushup', 'Flexión de brazos', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], h: -6 }),
    frames: [{}, plank([140, 162], [12, 179], { h: -6 })]
  });
  add('pushup_knee', 'Flexión de brazos de rodillas', {
    base: kneePlank([132, 131], [58, 178], { H1: [134, 182], h: -6 }),
    frames: [{}, kneePlank([136, 158], [58, 178], { h: -6 })]
  });
  add('pushup_incline', 'Flexión inclinada (manos elevadas)', {
    base: plank([132, 100], [26, 179], { H1: [138, 142], h: -6 }),
    props: [{ type: 'box', x: 120, y: 144, w: 40 }],
    frames: [{}, plank([134, 124], [26, 179], { h: -6 })]
  });
  add('pushup_decline', 'Flexión declinada (pies elevados)', {
    base: plank([132, 132], [28, 138], { H1: [134, 182], h: -6, pf: false }),
    props: [{ type: 'box', x: 8, y: 144, w: 34 }],
    frames: [{}, plank([134, 160], [28, 138], { h: -6, pf: false })]
  });
  add('pushup_scap', 'Flexiones escapulares', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], h: -6 }),
    frames: [{ y: 0 }, plank([132, 125], [12, 179], { h: -6 })].map((f, i) => i ? f : {}), pulse: true, dur: 1.8
  });
  add('planche', 'Planche lean / progresiones', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], h: -6 }),
    frames: [{}, plank([144, 135], [12, 179], { h: -6 })]
  });
  add('dips', 'Fondos en paralelas', {
    base: { x: 100, y: 102, t: 176, H1: [106, 104], e1s: -1, pf: false, l1: 20, k1: -95 },
    props: [{ type: 'pad', a: [94, 106], b: [126, 106], w: 4 }, { type: 'pad', a: [122, 106], b: [122, 184], w: 3 }], props3: [{ type: 'pbars', x1: 84, x2: 130, y: 106 }], lift3: 34,
    frames: [{}, { x: 94, y: 130, t: 162 }]
  });
  add('dips_bench', 'Fondos en banco', {
    base: { x: 68, y: 124, t: 178, H1: [62, 134], e1s: -1, F1: [140, 178], F2: [136, 178], pf: true, f1: 150, f2: 150 },
    props: [{ type: 'bench', a: [20, 140], b: [70, 140], legs: [26, 64] }],
    frames: [{}, { x: 72, y: 150 }]
  });
  add('dip_machine', 'Fondos en máquina sentado', {
    base: { x: 82, y: 118, t: 180, F1: [124, AY], F2: [120, AY], h1: [-46, 6] },
    props: [{ type: 'bench', a: [60, 126], b: [104, 126], legs: [68, 96] }, { type: 'pad', a: [56, 122], b: [56, 64], w: 8 }],
    frames: [{ h1: [-22, 10] }, { h1: [-48, 6] }]
  });
  add('ohp', 'Press militar', {
    base: S({ h1: [1, 10] }), props: [BB],
    frames: [{}, { h1: [48, 2], h: -6 }]
  });
  add('ohp_db', 'Press de hombros con mancuernas', {
    base: { view: 'front', x: 100, y: 124, t: 180, l1: 20, k1: 0, ts1: 0.4, pf: false, a1: 90, e1: 180 },
    props: [{ type: 'box', x: 74, y: 128, w: 52 }, ...DBF],
    frames: [{}, { a1: 160, e1: 178 }]
  });
  add('ohp_db_stand', 'Press de hombros de pie (frontal)', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 90, e1: 180 },
    props: DBF, frames: [{}, { a1: 160, e1: 178 }]
  });
  add('arnold', 'Press Arnold', {
    base: { view: 'front', x: 100, y: 124, t: 180, l1: 20, k1: 0, ts1: 0.4, pf: false, a1: 20, e1: 170, us1: 0.6 },
    props: [{ type: 'box', x: 74, y: 128, w: 52 }, ...DBF],
    frames: [{}, { a1: 90, e1: 180, us1: 1 }, { a1: 162, e1: 178 }], dur: 3
  });
  add('pushpress', 'Push press / jerk', {
    base: S({ h1: [1, 10] }), props: [BB],
    frames: [{ d: 1 }, { x: 98, y: 112, t: 176, d: .5 }, { y: 96, h1: [48, 2], F1: [104, 175], F2: [99, 175], f1: 40, f2: 40, d: .6 }, { y: 100, h1: [48, 2], F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, d: 1 }], dur: 2.6
  });
  add('jerk_split', 'Split jerk', {
    base: S({ h1: [1, 10] }), props: [BB],
    frames: [{ d: 1 }, { y: 110, d: .4 }, { x: 98, y: 118, h1: [48, 2], F1: [128, AY], F2: [66, 172], f2: 25, d: 1 }], dur: 2.4
  });
  add('landmine_press', 'Press en Landmine', {
    base: { x: 96, y: 102, t: 172, F1: [124, AY], F2: [74, AY], h1: [-2, 12] },
    props: [{ type: 'landmine', pivot: [236, 182] }],
    frames: [{}, { h1: [36, 34], t: 168 }]
  });
  add('landmine_press_kneel', 'Press en Landmine en caballero', {
    base: { x: 92, y: 136, t: 178, pf: false, l2: 4, k2: -90, f2: 0, F1: [124, AY], h1: [-2, 12] },
    props: [{ type: 'landmine', pivot: [236, 182] }],
    frames: [{}, { h1: [36, 30], t: 172 }]
  });
  add('landmine_chest', 'Press de pecho en Landmine', {
    base: { x: 96, y: 102, t: 170, F1: [118, AY], F2: [80, AY], h1: [-14, 12] },
    props: [{ type: 'landmine', pivot: [236, 182] }],
    frames: [{}, { h1: [12, 46], t: 164 }]
  });
  add('lateral', 'Elevaciones laterales', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 10, e1: 14 },
    props: DBF, frames: [{}, { a1: 86, e1: 92 }]
  });
  add('lateral_cable', 'Elevación lateral en polea', {
    // polea baja al lado contrario: el cable cruza por DELANTE del cuerpo hasta la mano. El brazo se dibuja un poco
    // acortado (us1/fs1) para que en 3D vaya adelantado (plano escapular) y la mano parta delante de la cadera
    base: { view: 'front', x: 96, y: 99, t: 180, F1: [108, AY], a1: -12, e1: -8, us1: 0.9, fs1: 0.92, a2: -10, e2: -10, H2: [70, 104] },
    props: [{ type: 'tower', x: 40, top: 40, pulleys: [176], z: 8 }, { type: 'cable', from: [40, 176], to: 'hd1', fz: 8 }],
    frames: [{}, { a1: 84, e1: 90, us1: 0.94, fs1: 0.96 }]
  });
  add('lateral_machine', 'Elevaciones laterales en máquina', {
    base: { view: 'front', x: 100, y: 124, t: 180, l1: 20, k1: 0, ts1: 0.4, pf: false, a1: 8, e1: 8, fs1: 0.35 },
    props: [{ type: 'box', x: 74, y: 128, w: 52 }, { type: 'pad', a: J => A.mv(J.S1, J.a1, 10), b: J => A.mv(J.S1, J.a1, 24), w: 10, layer: 'hand' }, { type: 'pad', a: J => A.mv(J.S2, J.a2, 10), b: J => A.mv(J.S2, J.a2, 24), w: 10, layer: 'hand' }],
    frames: [{}, { a1: 88, e1: 88 }]
  });
  add('front_raise', 'Elevación frontal', {
    base: S({ a1: 4, e1: 4 }), props: DB,
    frames: [{}, { a1: 96, e1: 96 }]
  });
  add('front_raise_bb', 'Elevación frontal con barra', {
    base: S({ a1: 4, e1: 4 }), props: [BB],
    frames: [{}, { a1: 98, e1: 98 }]
  });
  add('reverse_fly', 'Pájaros / deltoides posterior', {
    base: { x: 82, y: 106, t: 104, F1: [104, AY], F2: [99, AY], a1: 2, e1: 2, us1: 1 },
    props: DB, frames: [{}, { a1: -50, e1: -40, us1: 0.7, fs1: 0.7 }]
  });
  add('reverse_fly_front', 'Pájaros (vista frontal)', {
    base: { view: 'front', x: 100, y: 99, t: 180, sh: -22, F1: [112, AY], a1: -18, e1: -12 },
    props: DBF, frames: [{}, { a1: 86, e1: 90 }]
  });
  add('rear_delt_machine', 'Pájaros en máquina (reverse pec deck)', {
    base: { view: 'front', x: 100, y: 124, t: 180, l1: 20, k1: 0, ts1: 0.4, pf: false, H1: [108, 76] },
    props: [{ type: 'box', x: 74, y: 128, w: 52 }],
    frames: [{}, { H1: [168, 74] }]
  });
  add('upright_row', 'Remo al mentón', {
    base: S({ H1: [108, 116] }), props: [BB],
    frames: [{}, { H1: [112, 64], e1s: 1 }]
  });
  add('shrug', 'Encogimientos de hombros', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 6, e1: 4 },
    props: DBF, frames: [{}, { sh: 7 }], dur: 1.8
  });
  add('shrug_bb', 'Encogimientos con barra', {
    base: S({ H1: [108, 110] }), props: [BB],
    frames: [{}, { sh: 7, H1: [108, 102] }], dur: 1.8
  });
  add('face_pull', 'Face pull', {
    base: S({ F1: [104, AY], F2: [80, AY], H1: [150, 56] }),
    // cuerda con agarre neutro; termina con codos altos y abiertos a la altura del hombro y manos al lado de las orejas
    props: [{ type: 'tower', x: 176, top: 6, pulleys: [44] }, { type: 'cable', from: [176, 44], to: 'hd1', rope: true }],
    frames: [{ fi: true }, { H1: null, a1: -30, us1: 0.38, e1: 172, fs1: 0.78, fi: true }]
  });
  add('y_raise', 'Y-raise', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 14, e1: 14 },
    frames: [{}, { a1: 142, e1: 142 }]
  });
  add('y_raise_prone', 'Y / W raises en banco inclinado', {
    base: { x: 72, y: 144, t: 136, h: 6, F1: [40, AY], F2: [36, AY], a1: 2, e1: 2 },
    props: [{ type: 'bench', a: [70, 156], b: [116, 112], legs: [80, 106] }, ...DB],
    frames: [{}, { a1: 140, e1: 140 }]
  });
  add('ext_rot', 'Rotación externa de hombro', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 4, e1: 90, fs1: 0.25, a2: -4, e2: -4 },
    props: [{ type: 'tower', x: 22, top: 40, pulleys: [104] }, { type: 'cable', from: [22, 104], to: 'hd1', band: true }],
    frames: [{}, { e1: 70, fs1: 1 }]
  });
  add('int_rot', 'Rotación interna de hombro', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 4, e1: 80, fs1: 1, a2: -4, e2: -4 },
    props: [{ type: 'tower', x: 182, top: 40, pulleys: [104] }, { type: 'cable', from: [182, 104], to: 'hd1', band: true }],
    frames: [{}, { e1: -30, fs1: 0.25 }]
  });
  add('iso_shoulder', 'Isometría de hombro contra pared', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 4, e1: 80, fs1: 0.8, a2: -4, e2: -4 },
    props: [{ type: 'wall', x: 132, w: 10 }],
    frames: [{}, { e1: 82 }], pulse: true, dur: 2
  });
  add('serratus_punch', 'Serratus punch', {
    base: S({ a1: 92, e1: 92, F2: [78, AY] }),
    props: [{ type: 'tower', x: 18, top: 40, pulleys: [72], dim: true }, { type: 'cable', from: [18, 72], to: 'hd1', dim: true }],
    frames: [{ pr: 0 }, { pr: 7 }], dur: 1.8
  });
  add('bottom_up', 'Bottom-up press con kettlebell', {
    base: S({ h1: [-2, 12] }), props: [{ type: 'kb', at: 'hd1', up: true }],
    frames: [{}, { h1: [48, 2] }], dur: 3
  });
  add('armbar', 'Kettlebell armbar', {
    base: { x: 104, y: 174, t: -90, pf: false, l1: 120, k1: 50, l2: 92, k2: 92, a1: 182, e1: 182, a2: -100, e2: -100 },
    props: [{ type: 'kb', at: 'hd1', up: true }],
    frames: [{}, { t: -102, l1: 140, k1: 70 }], dur: 3.2
  });
  add('wall_slide', 'Wall slides', {
    base: { x: 104, y: 100, t: 180, F1: [110, AY], F2: [104, AY], H1: [138, 66], e1s: 1 },
    props: [{ type: 'wall', x: 142 }, { type: 'roller', at: J => [138, J.wr1[1] + 4], r: 4 }],
    frames: [{}, { H1: [138, 24] }]
  });
  add('wall_circles', 'Círculos con pelota en la pared', {
    base: S({ H1: [148, 54] }),
    props: [{ type: 'wall', x: 162 }, { type: 'ball', at: J => [J.hd1[0] + 6, J.hd1[1]], r: 7 }],
    frames: [{ H1: [148, 50] }, { H1: [150, 58] }, { H1: [148, 64] }, { H1: [146, 58] }], ease: 'linear', dur: 2
  });

  /* ============================== TRACCIONES ============================== */
  add('row_bb', 'Remo con barra', {
    base: { x: 80, y: 106, t: 114, F1: [104, AY], F2: [99, AY], H1: [112, 150] }, props: [BB],
    frames: [{}, { H1: [100, 120] }]
  });
  add('row_db', 'Remo unilateral con mancuerna', {
    base: { x: 76, y: 106, t: 98, F1: [96, AY], F2: [70, AY], H1: [124, 152], H2: [146, 134] },
    props: [{ type: 'bench', a: [120, 140], b: [182, 140] }, { type: 'db', at: 'hd1' }],
    frames: [{}, { H1: [104, 116] }]
  });
  add('row_seal', 'Remo apoyado en pecho / foca', {
    base: { x: 72, y: 112, t: 92, h: 4, pf: false, l1: -88, k1: -88, H1: [120, 160] },
    props: [{ type: 'bench', a: [44, 120], b: [128, 120] }, BB],
    frames: [{}, { H1: [104, 126] }]
  });
  add('row_cable', 'Remo sentado en polea', {
    base: { x: 72, y: 152, t: 176, pf: true, F1: [132, 166], F2: [128, 166], f1: 50, H1: [146, 124] },
    props: [{ type: 'pad', a: [50, 160], b: [96, 160], w: 7 }, { type: 'tower', x: 186, top: 40, pulleys: [126] }, { type: 'cable', from: [186, 126], to: 'hd1' }, { type: 'pad', a: [140, 150], b: [140, 182], w: 4 }],
    frames: [{ t: 160 }, { t: 186, H1: [98, 128] }]
  });
  add('row_machine', 'Remo en máquina', {
    base: { x: 76, y: 120, t: 182, F1: [128, AY], F2: [124, AY], H1: [138, 96] },
    // máquina: apoyo de pecho, brazos de palanca que bajan desde arriba hasta las manillas y torre con pesas
    props: [{ type: 'bench', a: [56, 128], b: [96, 128], legs: [64, 90] }, { type: 'pad', a: [89, 78], b: [89, 106], w: 7 },
      { type: 'pad', a: [93, 100], b: [152, 100], w: 2 }, { type: 'pad', a: [152, 36], b: [152, 184], w: 5 }, { type: 'pad', a: [152, 44], b: J => J.hd1, w: 3 }],
    props3: [{ type: 'bench', a: [56, 128], b: [96, 128], legs: [64, 90] }, { type: 'rowmachine', pad: [89, 78, 106], col: 152, piv: [152, 44] }],
    frames: [{}, { H1: [100, 100] }]
  });
  add('row_tbar', 'Remo en barra T / Landmine', {
    base: { x: 82, y: 108, t: 120, F1: [106, AY], F2: [101, AY], H1: [116, 150] },
    props: [{ type: 'landmine', pivot: [196, 182] }],
    frames: [{}, { H1: [104, 120] }]
  });
  add('row_inverted', 'Remo invertido', {
    base: plank([66, 166], [192, 179], { H1: [68, 118], e1s: -1, h: 8 }),
    props: [{ type: 'hbar', x1: 60, x2: 76, y: 118 }, { type: 'pad', a: [68, 118], b: [68, 184], w: 3 }],
    frames: [{}, plank([72, 132], [192, 179], { h: 8 })]
  });
  add('pulldown', 'Jalón al pecho', {
    base: { x: 90, y: 132, t: 184, F1: [128, AY], F2: [124, AY], H1: [106, 30] },
    props: [{ type: 'bench', a: [66, 140], b: [108, 140], legs: [76, 100] }, { type: 'pad', a: [112, 120], b: [128, 120], w: 6 }, { type: 'cable', from: [106, 0], to: 'hd1' }],
    frames: [{}, { H1: [112, 74], t: 192 }]
  });
  add('pulldown_kneel', 'Jalón unilateral arrodillado', {
    base: { x: 94, y: 137, t: 182, pf: false, l1: 0, k1: -90, f1: 0, H1: [112, 34] },
    props: [{ type: 'cable', from: [112, 0], to: 'hd1' }],
    frames: [{}, { H1: [102, 100] }]
  });
  add('pullup', 'Dominadas', {
    base: { x: 98, y: 102, t: 182, pf: false, l1: 20, k1: -40, H1: [104, 6] },
    props: [{ type: 'pullbar', x: 104, y: 4 }],
    frames: [{}, { y: 66, t: 188 }]
  });
  add('pullup_assist', 'Dominada asistida / negativa', {
    base: { x: 98, y: 102, t: 182, pf: false, l1: 20, k1: -40, H1: [104, 6] },
    props: [{ type: 'pullbar', x: 104, y: 4 }, { type: 'band', from: [104, 4], to: 'kn1' }],
    frames: [{}, { y: 66, t: 188 }]
  });
  add('muscleup', 'Muscle-up', {
    base: { x: 100, y: 156, S: [102, 110], pf: false, l1: 30, k1: -40, H1: [104, 60] },
    props: [{ type: 'pullbar', x: 104, y: 59 }], lift3: 62,
    frames: [{ d: 0.5 }, { d: 1 }, { x: 98, y: 112, S: [106, 66], e1s: 1, d: 0.6  }, { x: 100, y: 96, S: [112, 52], e1s: -1, d: 0.6 }, { x: 102, y: 56, S: [104, 10], e1s: -1, d: 0.9 }, { x: 102, y: 56, S: [104, 10], d: 0.6 }], free: true, dur: 3.6
  });
  add('front_lever', 'Front lever', {
    base: { x: 106, y: 72, S: [60, 70], h: 8, pf: false, l1: 92, k1: 92, H1: [56, 21] },
    props: [{ type: 'pullbar', x: 56, y: 20 }],
    frames: [{}, { y: 70, S: [60, 69] }], pulse: true
  });
  add('pullover_cable', 'Pullover en polea alta', {
    base: { x: 82, y: 104, t: 148, F1: [104, AY], F2: [99, AY], a1: 140, e1: 140 },
    props: [{ type: 'tower', x: 176, top: 6, pulleys: [20] }, { type: 'cable', from: [176, 20], to: 'hd1' }],
    frames: [{}, { a1: 30, e1: 30 }]
  });
  add('depress', 'Depresión de cabeza humeral en polea', {
    base: S({ a1: 74, e1: 74 }),
    props: [{ type: 'tower', x: 176, top: 6, pulleys: [26] }, { type: 'cable', from: [176, 26], to: 'hd1' }],
    frames: [{}, { a1: -8, e1: -8 }]
  });

  /* ============================== BRAZOS ============================== */
  add('curl', 'Curl de bíceps con mancuerna', {
    base: S({ a1: 2, e1: 4 }), props: DB, frames: [{}, { e1: 152 }]
  });
  add('curl_bb', 'Curl con barra', {
    base: S({ a1: 2, e1: 4 }), props: [BB], frames: [{}, { e1: 150, a1: 8 }]
  });
  add('curl_cable', 'Curl en polea', {
    base: S({ a1: 2, e1: 10 }),
    props: [{ type: 'tower', x: 152, top: 50, pulleys: [176] }, { type: 'cable', from: [152, 176], to: 'hd1' }],
    frames: [{}, { e1: 150 }]
  });
  add('curl_bayesian', 'Curl bayesiano', {
    base: S({ F2: [84, AY], a1: -32, e1: -28 }),
    props: [{ type: 'tower', x: 40, top: 50, pulleys: [176] }, { type: 'cable', from: [40, 176], to: 'hd1' }],
    frames: [{}, { e1: 110 }]
  });
  add('curl_incline', 'Curl en banco inclinado', {
    base: { x: 104, y: 140, S: [78, 102], h: 4, F1: [146, AY], F2: [142, AY], a1: -6, e1: -6 },
    props: [{ type: 'bench', a: [96, 146], b: [130, 146], legs: [104, 124], back: [[98, 146], [66, 104]] }, ...DB],
    frames: [{}, { e1: 140 }]
  });
  add('curl_preacher', 'Curl predicador / Scott', {
    base: { x: 80, y: 126, t: 176, F1: [112, AY], F2: [108, AY], a1: 56, e1: 60 },
    props: [{ type: 'pad', a: J => [J.S1[0] + 4, J.S1[1] + 10], b: J => [J.el1[0] + 2, J.el1[1] + 9], w: 9 }, { type: 'pad', a: [104, 104], b: [112, 184], w: 4 }, BB],
    frames: [{}, { e1: 172 }]
  });
  add('curl_concentration', 'Curl concentrado', {
    base: { x: 76, y: 128, t: 150, F1: [124, AY], F2: [120, AY], a1: 8, e1: 4 },
    props: [{ type: 'bench', a: [44, 136], b: [96, 136], legs: [52, 88] }, ...DB1],
    frames: [{}, { e1: 150 }]
  });
  add('curl_spider', 'Curl araña', {
    base: { x: 72, y: 144, t: 136, h: 6, F1: [40, AY], F2: [36, AY], a1: 2, e1: 2 },
    props: [{ type: 'bench', a: [70, 156], b: [116, 112], legs: [80, 106] }, BB],
    frames: [{}, { e1: 140 }]
  });
  add('curl_hercules', 'Curl a doble polea alta', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 88, e1: 88 },
    props: [{ type: 'tower', x: 190, top: 6, pulleys: [46] }, { type: 'tower', x: 10, top: 6, pulleys: [46] }, { type: 'cable', from: [190, 46], to: 'hd1' }, { type: 'cable', from: [10, 46], to: 'hd2' }],
    frames: [{}, { e1: 170 }]
  });
  add('pushdown', 'Extensión de tríceps en polea alta', {
    base: S({ a1: -6, e1: 100 }),
    props: [{ type: 'tower', x: 132, top: 6, pulleys: [14] }, { type: 'cable', from: [132, 14], to: 'hd1' }],
    frames: [{}, { e1: 6 }]
  });
  add('oh_ext', 'Extensión de tríceps sobre la cabeza', {
    base: S({ a1: 172, e1: -43 }), props: [{ type: 'db', at: 'hd1', k: 1.2 }],
    frames: [{}, { e1: 176 }]
  });
  add('oh_ext_cable', 'Extensión sobre la cabeza en polea', {
    base: { x: 96, y: 102, t: 150, F1: [120, AY], F2: [76, AY], a1: 160, e1: -60 },
    props: [{ type: 'tower', x: 16, top: 6, pulleys: [40] }, { type: 'cable', from: [16, 40], to: 'hd1' }],
    frames: [{}, { e1: 158 }]
  });
  add('skull', 'Press francés', {
    base: Object.assign({}, benchBody, { a1: 166, e1: -64 }), props: [flatBench, BB],
    frames: [{}, { e1: 170 }]
  });
  add('kickback_tri', 'Patada de tríceps', {
    base: { x: 76, y: 106, t: 100, F1: [96, AY], F2: [70, AY], a1: -82, e1: 4, H2: [146, 136] },
    props: [{ type: 'bench', a: [120, 140], b: [182, 140] }, { type: 'db', at: 'hd1' }],
    frames: [{}, { e1: -82 }]
  });
  add('wrist_curl', 'Flexión / extensión de muñeca', {
    base: { x: 76, y: 128, t: 160, F1: [124, AY], F2: [120, AY], a1: 30, e1: 92, w1: -50 },
    props: [{ type: 'bench', a: [44, 136], b: [96, 136], legs: [52, 88] }, { type: 'db', at: 'hd1' }],
    frames: [{}, { w1: 50 }], dur: 1.8
  });
  add('wrist_roll', 'Pronosupinación con cincha / martillo', {
    base: { x: 76, y: 128, t: 176, F1: [124, AY], F2: [120, AY], a1: 10, e1: 92 },
    props: [{ type: 'bench', a: [44, 136], b: [96, 136], legs: [52, 88] }, { type: 'pad', a: J => J.hd1, b: J => A.mv(J.hd1, 180 + (J.p.w1 || 0) * 3, 18), w: 3, layer: 'hand' }],
    frames: [{ w1: -14 }, { w1: 14 }], dur: 2
  });

  /* ============================== CORE ============================== */
  add('crunch', 'Crunch abdominal', {
    base: { x: 100, y: 175, t: -90, h: -6, F1: [134, AY], F2: [130, AY], pf: true, h1: [8, -6] },
    frames: [{}, { t: -126, h: -18 }]
  });
  add('crunch_small', 'Curl-up de McGill', {
    base: { x: 100, y: 175, t: -90, h: -4, F1: [134, AY], l2: 90, k2: 90, pf: true, H1: [104, 180] },
    frames: [{}, { t: -104, h: -6 }], pulse: true
  });
  add('bicycle_crunch', 'Crunch bicicleta', {
    base: { x: 100, y: 175, t: -112, h: -14, pf: false, l1: 160, k1: 70, l2: 120, k2: 30, h1: [6, -6] },
    frames: [{ t: -116, l1: 172, k1: 82, l2: 118, k2: 118 }, { t: -116, l1: 118, k1: 118, l2: 172, k2: 82 }], dur: 1.8
  });
  add('reverse_crunch', 'Crunch inverso', {
    base: { x: 104, y: 176, t: -90, h: -4, pf: false, l1: 180, k1: 90, a1: 90, e1: 90 },
    frames: [{}, { y: 166, t: -100, l1: -140, k1: 140 }]
  });
  add('v_up', 'V-up / navaja', {
    base: { x: 100, y: 177, t: -90, h: 0, pf: false, l1: 90, k1: 90, a1: -90, e1: -90 },
    frames: [{}, { y: 178, t: -138, h: -10, l1: 140, k1: 140, a1: 150, e1: 150 }]
  });
  add('toe_touch', 'Crunch con toque de pies', {
    base: { x: 100, y: 176, t: -90, h: -4, pf: false, l1: 178, k1: 178, a1: 178, e1: 178 },
    frames: [{}, { t: -122, h: -14, a1: 168, e1: 168 }]
  });
  add('flutter', 'Patadas de tijera', {
    base: { x: 100, y: 176, t: -96, h: -6, pf: false, l1: 112, k1: 112, l2: 100, k2: 100, a1: 92, e1: 92 },
    frames: [{ l1: 116, k1: 116, l2: 98, k2: 98 }, { l1: 98, k1: 98, l2: 116, k2: 116 }], free: true, dur: 1
  });
  add('mountain_climber', 'Escalador (mountain climber)', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], h: -6 }),
    frames: [{ F1: [104, 168], F2: [14, 170] }, { F1: [60, 160], F2: [58, 162] }, { F1: [12, 170], F2: [100, 168] }, { F1: [58, 162], F2: [60, 160] }], free: true, ease: 'linear', dur: 0.9
  });
  add('burpee', 'Burpee', {
    base: S({ a1: 4, e1: 8 }),
    frames: [{ d: 0.5 }, { x: 84, y: 138, t: 120, H1: [126, 182], d: 0.5 }, Object.assign(plank([132, 131], [16, 179], { H1: [134, 182], h: -6 }), { d: 0.6 }), { x: 84, y: 138, t: 120, F1: [104, AY], F2: [99, AY], H1: [126, 182], d: 0.5 },
             { x: 100, y: 76, t: 180, F1: [104, 156], F2: [99, 156], f1: 30, f2: 30, H1: undefined, a1: 172, e1: 172, d: 0.5 }, { x: 100, y: 100, F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, a1: 4, e1: 8, d: 0.6 }], free: true, dur: 3.2
  });
  add('jumping_jack', 'Jumping jack', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [110, AY], a1: 8, e1: 8 },
    frames: [{ d: 1 }, { y: 92, F1: [134, AY - 4], a1: 168, e1: 172, d: 1 }], free: true, dur: 1.1
  });
  add('high_knees', 'Skipping / rodillas arriba', {
    base: S({ t: 176 }),
    frames: [{ y: 96, l1: 100, k1: 10, F2: [100, AY], a1: -30, e1: 60, a2: 40, e2: 130 }, { y: 96, l2: 100, k2: 10, F1: [104, AY], a1: 40, e1: 130, a2: -30, e2: 60 }], free: true, dur: 0.8
  });
  add('pike_pushup', 'Flexión pike (cadera arriba)', {
    base: { x: 84, y: 104, S: [124, 134], h: 10, F1: [40, AY], F2: [36, AY], H1: [130, 182] },
    frames: [{}, { S: [122, 156], x: 82, y: 110 }]
  });
  add('clap_pushup', 'Flexión con palmada (pliométrica)', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], h: -6 }),
    frames: [{ d: 0.8 }, Object.assign(plank([134, 160], [12, 179], { h: -6 }), { d: 0.35 }), Object.assign(plank([136, 112], [12, 179], { h: -6, H1: undefined, a1: 30, e1: 40 }), { d: 0.35 }), Object.assign(plank([132, 131], [12, 179], { H1: [134, 182], h: -6 }), { d: 0.6 })], free: true, dur: 2
  });
  // press de pecho sentado: espalda apoyada en el respaldo, pies en el suelo, manillas verticales a la altura del
  // medio del pecho y algo más anchas que los hombros; empuja al frente hasta casi estirar los codos (sin bloquear)
  add('chest_press_machine', 'Press de pecho en máquina', {
    base: { x: 76, y: 124, t: 182, F1: [118, AY], F2: [114, AY], h1: [-9, 12] },
    props: [{ type: 'bench', a: [56, 132], b: [96, 132], legs: [64, 90] }, { type: 'pad', a: [56, 126], b: [52, 70], w: 8 }, { type: 'pad', a: J => [J.hd1[0] + 2, J.hd1[1] - 9], b: J => [J.hd1[0] + 2, J.hd1[1] + 9], w: 4, layer: 'hand' }],
    // flare: codos abiertos ~45-60° del tronco, como en la máquina (no pegados al cuerpo)
    props3: [{ type: 'chestpress', grip: 31, flare: 1.4 }],
    frames: [{}, { h1: [-8, 44] }]
  });
  add('situp', 'Abdominal completo (sit-up)', {
    base: { x: 100, y: 175, t: -90, h: -6, F1: [134, AY], F2: [130, AY], pf: true, h1: [8, -6] },
    frames: [{}, { t: -170, h: -20 }]
  });
  add('crunch_cable', 'Crunch en polea arrodillado', {
    base: { x: 96, y: 137, t: 176, pf: false, l1: 0, k1: -90, f1: 0, h1: [8, 10] },
    props: [{ type: 'tower', x: 150, top: 6, pulleys: [16] }, { type: 'cable', from: [150, 16], to: 'hd1' }],
    frames: [{}, { x: 92, t: 104, h: 20 }]
  });
  add('crunch_ball', 'Crunch en fitball', {
    base: { x: 104, y: 146, t: -72, h: 10, F1: [150, AY], F2: [146, AY], pf: true, h1: [8, -6] },
    props: [{ type: 'ball', at: [96, 160], r: 22, fill: '#2f6f73', stroke: '#5fb3b8', layer: 'back' }],
    frames: [{}, { t: -118, h: -10 }]
  });
  add('crunch_decline', 'Crunch en banco declinado', {
    base: { x: 116, y: 122, t: -112, h: 4, pf: false, l1: 110, k1: 10, h1: [8, -6] },
    props: [{ type: 'bench', a: [50, 152], b: [128, 122], legs: [62, 120] }],
    frames: [{}, { t: -170, h: -14 }]
  });
  add('legraise_hang', 'Elevación de piernas colgado', {
    base: { x: 98, y: 100, t: 182, pf: false, l1: 2, k1: 2, H1: [104, 6] },
    props: [{ type: 'pullbar', x: 104, y: 4 }],
    frames: [{}, { l1: 100, k1: 100, t: 194 }]
  });
  add('legraise_lying', 'Elevación de piernas tumbado', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 90, k1: 90, a1: 92, e1: 92 },
    frames: [{}, { l1: 178, k1: 178 }]
  });
  add('legraise_chair', 'Elevación de rodillas en paralelas', {
    base: { x: 100, y: 90, t: 180, pf: false, l1: 2, k1: 2, a1: 20, e1: 92, f1: 40 },
    props: [{ type: 'pad', a: [90, 62], b: [112, 62], w: 6 }, { type: 'pad', a: [80, 38], b: [80, 184], w: 6 }],
    frames: [{}, { l1: 104, k1: 10 }]
  });
  add('dragonflag', 'Dragon flag', {
    base: { x: 104, y: 136, S: [60, 136], pf: false, l1: 90, k1: 90, H1: [40, 132], h: 0 },
    props: [flatBench],
    frames: [{ x: 104, y: 134 }, { x: 88, y: 92, l1: 145, k1: 145 }]
  });
  add('plank', 'Plancha frontal', {
    base: plank([132, 156], [12, 179], { a1: 0, e1: 92, h: -6 }),
    frames: [{}, { y: 0 }].map((f, i) => i ? plank([132, 155], [12, 179], { h: -6 }) : f), pulse: true, dur: 2
  });
  add('plank_saw', 'Body saw', {
    base: plank([132, 156], [12, 179], { a1: 0, e1: 92, h: -6 }),
    frames: [{}, plank([125, 156], [5, 179], { h: -6 })]
  });
  add('side_plank', 'Plancha lateral', {
    base: { view: 'front', x: 108, y: 157, t: -112, pf: false, l1: 68, k1: 68, l2: 68, k2: 68, a2: 0, e2: -90, fs2: 0.6, a1: 158, e1: 158 },
    frames: [{ y: 160, t: -110 }, { y: 152, t: -114 }], pulse: true
  });
  // Copenhague: antebrazo en el suelo y los dos pies arriba del banco (el de arriba sobre el de abajo)
  add('copenhagen', 'Plancha Copenhague', {
    base: { view: 'front', x: 104, y: 150, t: -100, pf: false, l1: 86, k1: 86, l2: 90, k2: 90, a2: 0, e2: -90, fs2: 0.6, a1: 170, e1: 150 },
    props: [{ type: 'bench', a: [150, 164], b: [198, 164], legs: [156, 192] }],
    frames: [{ y: 152, t: -99 }, { y: 147, t: -101 }], pulse: true
  });
  add('deadbug', 'Dead bug', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 180, k1: 92, l2: 180, k2: 92, a1: 180, e1: 180 },
    frames: [{}, { a1: -100, e1: -100, l2: 100, k2: 100 }, {}, { a2: -100, e2: -100, l1: 100, k1: 100 }], dur: 3.6
  });
  add('birddog', 'Bird dog', {
    base: { x: 72, y: 136, t: 92, pf: false, l1: 0, k1: -90, f1: 0, l2: 0, k2: -90, f2: 0, H1: [118, 182], H2: [118, 182], h: -6 },
    frames: [{ d: 0.45 }, { d: 0.4, ease: 'in' }, { a1: 45, e1: 100, l2: -45, k2: -110, h: -4, d: 0.35, ease: 'out' }, { a1: 94, e1: 94, l2: -94, k2: -94, h: -2, d: 0.8 }, { d: 0.4, ease: 'in' }, { a1: 45, e1: 100, l2: -45, k2: -110, h: -4, d: 0.35, ease: 'out' },
      { H1: [118, 182], l2: 0, k2: -90, h: -6, d: 0.45 }, { d: 0.4, ease: 'in' }, { a2: 45, e2: 100, l1: -45, k1: -110, h: -4, d: 0.35, ease: 'out' }, { a2: 94, e2: 94, l1: -94, k1: -94, h: -2, d: 0.8 }, { d: 0.4, ease: 'in' }, { a2: 45, e2: 100, l1: -45, k1: -110, h: -4, d: 0.35, ease: 'out' }], dur: 5.5
  });
  add('quadruped_rock', 'Transferencias en cuadrupedia', {
    base: { x: 72, y: 136, t: 92, pf: false, l1: 0, k1: -90, f1: 0, a1: 0, e1: 0, h: -6, H1: [118, 182] },
    frames: [{ x: 66, y: 140 }, { x: 80, y: 136, t: 96 }], pulse: true
  });
  add('bear_crawl', 'Marcha de oso', {
    base: { x: 72, y: 128, t: 96, h: -6, F1: [62, AY], F2: [58, AY], H1: [118, 182], H2: [114, 182], pf: true, f1: 60 },
    frames: [{}, { H1: [130, 182], F2: [70, AY], x: 78 }, { H2: [126, 182], F1: [74, AY], x: 84, H1: [130, 182], F2: [70, AY] }], dur: 2.4
  });
  add('abwheel', 'Rueda abdominal', {
    base: Object.assign(kneel(62, 4), { t: 128, H1: [106, 174], h: -4 }),
    props: [{ type: 'ball', at: 'hd1', r: 6, fill: '#353d48', stroke: '#8a96a6' }],
    frames: [{}, Object.assign(kneel(62, -56), { t: 98, H1: [162, 174] })]
  });
  add('pallof', 'Press Pallof', {
    base: S({ h1: [-16, 10], F2: [80, AY], F1: [116, AY] }),
    props: [{ type: 'tower', x: 22, top: 30, pulleys: [96], dim: true }, { type: 'cable', from: [22, 96], to: 'hd1', dim: true }],
    frames: [{}, { h1: [-16, 46] }]
  });
  add('woodchop_down', 'Leñador descendente', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [124, AY], F2: [76, AY], a1: -150, e1: -150, a2: -150, e2: -150 },
    props: [{ type: 'tower', x: 14, top: 6, pulleys: [16] }, { type: 'cable', from: [14, 16], to: 'hd1' }],
    frames: [{}, { y: 112, t: 186, a1: 30, e1: 30, a2: 30, e2: 30 }]
  });
  add('woodchop_up', 'Leñador ascendente', {
    base: { view: 'front', x: 100, y: 110, t: 186, F1: [124, AY], F2: [76, AY], a1: -30, e1: -30, a2: -30, e2: -30 },
    props: [{ type: 'tower', x: 14, top: 6, pulleys: [176] }, { type: 'cable', from: [14, 176], to: 'hd1' }],
    frames: [{}, { y: 100, t: 178, a1: 150, e1: 150, a2: 150, e2: 150 }]
  });
  add('russian_twist', 'Giros rusos', {
    base: { x: 86, y: 172, t: 222, h: -16, pf: false, l1: 146, k1: 66, l2: 142, k2: 62, f1: 82, f2: 82, H1: [80, 144], H2: [78, 145], bs: 1 },
    props: [{ type: 'twistball' }],
    frames: [{ d: 0.5 }, { H1: [100, 170], H2: [102, 168], bs: 1, t: 218, d: 0.9 }, { d: 0.5 }, { H1: [94, 160], H2: [92, 161], bs: 0, t: 226, d: 0.9 }], free: true, dur: 2.8
  });
  add('landmine_twist', 'Landmine twist / rainbows', {
    // de frente al anclaje (a un largo de barra), brazos estirados al frente con la punta en ambas manos;
    // la punta describe un arco de una cadera a la otra pasando a la altura de la cara, con giro de tronco y pies fijos
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [122, AY], F2: [78, AY], H1: [100, 64], H2: [100, 64], us1: 0.5, fs1: 0.5, us2: 0.5, fs2: 0.5 },
    props: [{ type: 'landmine', pivot: [100, 184], pz: 150 }],
    props3: [{ type: 'landmine', pivot: [100, 184], pz: 150 }],
    frames: [{ H1: [62, 128], H2: [62, 128], us1: 0.85, fs1: 0.85, us2: 0.85, fs2: 0.85, t: 186 }, { H1: [100, 64], H2: [100, 64], us1: 0.5, fs1: 0.5, us2: 0.5, fs2: 0.5, t: 180 },
      { H1: [138, 128], H2: [138, 128], us1: 0.85, fs1: 0.85, us2: 0.85, fs2: 0.85, t: 174 }, { H1: [100, 64], H2: [100, 64], us1: 0.5, fs1: 0.5, us2: 0.5, fs2: 0.5, t: 180 }], free: true, dur: 3.2
  });
  add('wipers', 'Limpiaparabrisas colgado', {
    base: { view: 'front', x: 100, y: 99, t: 180, pf: false, l1: 2, k1: 2, H1: [116, 6] },
    props: [{ type: 'hbar', x1: 60, x2: 140, y: 4 }],
    frames: [{ l1: 50, k1: 50, l2: 46, k2: 46 }, { l1: -46, k1: -46, l2: -50, k2: -50 }]
  });
  add('side_bend', 'Flexión lateral de tronco', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 4, e1: 4, a2: -40, e2: 140 },
    props: [{ type: 'db', at: 'hd1' }],
    frames: [{ t: 194 }, { t: 164 }]
  });
  add('carry', 'Paseo del granjero', {
    base: S({ a1: 2, e1: 2 }), props: DB,
    frames: walk({ a1: 2, e1: 2, a2: 2, e2: 2, armSwing: 0 }), ease: 'linear', dur: 1.6
  });
  add('carry_suitcase', 'Paseo de la maleta', {
    base: S({ a1: 2, e1: 2 }), props: DB1,
    frames: walk({ a1: 2, e1: 2, armSwing: 0, far: true }), ease: 'linear', dur: 1.6
  });
  add('breath', 'Respiración / bracing / vacuum', {
    base: S({ a1: 6, e1: 70 }),
    frames: [{}, { sh: 3 }], pulse: true, dur: 3.2
  });
  add('superman', 'Superman', {
    base: { x: 96, y: 176, t: 90, h: -6, pf: false, l1: -90, k1: -90, f1: 0, a1: 90, e1: 90 },
    frames: [{}, { t: 102, h: -12, l1: -100, k1: -100, a1: 112, e1: 112 }]
  });
  add('hyper', 'Hiperextensión a 45°', {
    // banco a la altura real (apoyo bajo la cadera a ~1 m): abajo el tronco cuelga sin tocar el suelo
    // y arriba queda en línea con las piernas (45°), sin hiperextender la zona lumbar
    base: { x: 106, y: 94, t: 46, pf: true, F1: [53, 147], F2: [49, 149], f1: 34, f2: 34, h1: [-8, 10] },
    props: [{ type: 'pad', a: [113, 96], b: [101, 109], w: 9 }, { type: 'pad', a: [104, 108], b: [94, 184], w: 4 }, { type: 'pad', a: [48, 153], b: [64, 168], w: 4 }, { type: 'pad', a: [49, 155], b: [42, 184], w: 4 }, { type: 'pad', a: [38, 184], b: [104, 184], w: 4 }],
    frames: [{}, { t: 136 }]
  });
  add('reverse_hyper', 'Reverse hyper', {
    base: { x: 84, y: 90, t: 92, h: -6, pf: false, l1: 2, k1: 2, f1: 40, H1: [148, 100] },
    props: [{ type: 'bench', a: [86, 99], b: [156, 99] }],
    frames: [{}, { l1: -84, k1: -84 }]
  });
  add('jefferson', 'Jefferson curl', {
    base: { x: 100, y: 64, t: 180, F1: [104, 143], F2: [99, 143], a1: 2, e1: 2 },
    props: [{ type: 'box', x: 78, y: 148, w: 46 }, ...DB],
    frames: [{}, { x: 90, y: 68, t: 16, h: 30 }], dur: 3.6
  });
  add('mckenzie', 'Extensión en prono (McKenzie)', {
    base: { x: 90, y: 176, t: 90, h: -8, pf: false, l1: -90, k1: -90, H1: [130, 182], e1s: -1 },
    frames: [{}, { t: 134, h: 0 }]
  });
  add('cobra_stretch', 'Estiramiento en prono / cobra', {
    base: { x: 90, y: 176, t: 92, h: -8, pf: false, l1: -90, k1: -90, f1: 0, H1: [127, 182] },
    frames: [{}, { t: 126, h: 4 }]
  });
  add('thoracic_roller', 'Extensión torácica sobre foam roller', {
    base: { x: 104, y: 174, t: -96, h: 0, F1: [136, AY], F2: [132, AY], pf: true, h1: [10, -4] },
    props: [{ type: 'roller', at: [70, 174], r: 8 }],
    frames: [{ t: -104 }, { t: -100, h: 24 }]
  });
  add('open_book', 'Libro abierto (open book)', {
    base: { x: 104, y: 168, t: -90, pf: false, l1: 150, k1: 60, l2: 152, k2: 62, a2: -96, e2: -96, a1: 100, e1: 100 },
    frames: [{}, { a1: -100, e1: -100, t: -84 }], dur: 3.2
  });
  add('foam_quad', 'Liberación miofascial con foam roller', {
    base: { x: 100, y: 166, t: 96, h: -6, pf: false, l1: -94, k1: -94, a1: 4, e1: 92 },
    props: [{ type: 'roller', at: [74, 176], r: 7 }],
    frames: [{ x: 106 }, { x: 94 }]
  });
  // Turkish get-up real: codo → mano → puente alto → barrido de pierna por debajo → rodilla → zancada → de pie, y de vuelta.
  // El brazo de la pesa queda vertical todo el tiempo; la mano de apoyo y el pie delantero no se mueven del suelo.
  add('getup', 'Turkish get-up', (() => {
    const kb = { a1: 180, e1: 180 }, F1 = [130, AY];
    const K = [
      { x: 104, y: 174, t: -90, h: 0, pf: true, F1, f1: 78, F2: [183, 175], f2: 170, a2: -95, e2: -95, ...kb, d: 0.6 },   // acostado
      { x: 104, y: 174, t: -125, h: -10, H2: [44, 181], d: 0.7 },                                                          // al codo
      { x: 104, y: 174, t: -148, h: -14, H2: [64, 182], d: 0.6 },                                                          // a la mano
      { x: 102, y: 148, t: -105, h: -10, H2: [64, 182], F2: [172, AY], f2: 120, d: 0.7 },                                                  // puente alto
      { x: 100, y: 142, t: -100, h: -8, H2: [64, 182], F2: [70, 178], f2: -70, d: 0.7 },                                                   // barrido de la pierna
      { x: 98, y: 137, t: 180, h: 0, F2: [62, 177], f2: -70, a2: 4, e2: 8, d: 0.7 },                                         // media rodilla
      { x: 101, y: 118, t: 180, F2: [70, 172], f2: 25, d: 0.5 },                                                            // zancada
      { x: 110, y: 104, F2: [102, 166], f2: 60, d: 0.4 },                                                                   // paso
      { x: 126, y: 100, F2: [125, AY], f2: 78, d: 0.8 }                                                                     // de pie
    ];
    const back = K.slice(1, -1).reverse().map(k => Object.assign({}, k));
    return { base: K[0], props: [{ type: 'kb', at: 'hd1', up: true }], frames: [{ d: 0.6 }, ...K.slice(1), ...back], dur: 10, cx: 112 };
  })());
  /* ============================== ESTIRAMIENTOS Y VARIOS ============================== */
  add('chest_stretch', 'Estiramiento de pecho', {
    base: S({ H1: [80, 92] }),
    frames: [{}, { H1: [70, 90], t: 176 }], pulse: true
  });
  add('cross_arm_stretch', 'Estiramiento de hombro cruzando el brazo', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: -84, e1: -84, us1: 0.85, fs1: 0.85, H2: [92, 62] },
    frames: [{ a1: -84, e1: -84 }, { a1: -96, e1: -96 }], pulse: true
  });
  add('triceps_stretch', 'Estiramiento de tríceps sobre la cabeza', {
    base: S({ a1: 172, e1: -38, H2: [96, 40] }),
    frames: [{}, { a1: 178, e1: -32 }], pulse: true
  });
  add('side_stretch', 'Estiramiento lateral de tronco', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [114, AY], a1: 170, e1: 176, a2: -6, e2: -6 },
    frames: [{ t: 180 }, { t: 160, a1: 150, e1: 140 }]
  });
  add('quad_stretch', 'Estiramiento de cuádriceps de pie', {
    base: S({ F2: [99, AY], F1: undefined, l1: -16, k1: -168, pf: false, f1: -70, H1: [82, 102], a2: 30, e2: 30 }),
    frames: [{}, { l1: -24, k1: -174, H1: [78, 98] }], pulse: true
  });
  add('ham_stretch', 'Estiramiento de isquiotibiales sentado', {
    base: { x: 74, y: 172, t: 186, pf: false, l1: 90, k1: 90, l2: 90, k2: 90, f1: 175, f2: 175, H1: [118, 168] },
    frames: [{ t: 176 }, { t: 128, H1: [150, 172] }]
  });
  add('calf_stretch', 'Estiramiento de gemelos en la pared', {
    base: { x: 104, y: 104, t: 164, F1: [126, AY], F2: [64, AY], f2: 84, H1: [148, 72] },
    props: [{ type: 'wall', x: 152, w: 10 }],
    frames: [{}, { x: 112, y: 108, t: 158 }], pulse: true
  });
  add('piriformis_stretch', 'Estiramiento de glúteo / piriforme acostado', {
    base: { x: 104, y: 176, t: -90, h: 0, pf: false, l1: 150, k1: 60, l2: 140, k2: 30, h1: [30, -4] },
    frames: [{}, { l1: 165, k1: 70, l2: 160, k2: 40 }], pulse: true
  });
  add('butterfly_stretch', 'Estiramiento de aductores (mariposa)', {
    base: { view: 'front', x: 100, y: 166, t: 180, l1: 72, k1: -80, l2: -72, k2: 80, ts1: 0.75, ss1: 0.75, ts2: 0.75, ss2: 0.75, pf: false, H1: [106, 174] },
    frames: [{ t: 180 }, { t: 186, y: 167 }], pulse: true
  });
  add('lying_twist', 'Rotación lumbar acostado', {
    base: { x: 104, y: 176, t: -90, h: 0, pf: false, l1: 150, k1: 60, l2: 150, k2: 60, a1: 90, e1: 90 },
    frames: [{}, { l1: 132, k1: 44, l2: 128, k2: 40 }], dur: 3.4
  });
  add('childs_pose', 'Postura del niño (estiramiento de espalda)', {
    base: { x: 70, y: 160, t: 78, h: 14, pf: false, l1: 59, k1: -90, l2: 59, k2: -90, f1: 0, f2: 0, H1: [162, 180] },
    frames: [{ t: 74 }, { t: 82, x: 72 }], pulse: true
  });
  add('cat_cow', 'Gato-camello', {
    base: { x: 72, y: 138, t: 92, pf: false, l1: 0, k1: -90, f1: 0, H1: [118, 182], h: -6 },
    frames: [{ t: 88, h: 12 }, { t: 97, h: -20 }], dur: 3.2
  });
  add('inchworm', 'Gusano (inchworm)', {
    base: S({}),
    frames: [{ d: 0.6 }, { x: 84, y: 104, t: 96, H1: [118, 182], d: 0.9 }, Object.assign(plank([132, 131], [12, 179], { H1: [134, 182], h: -6 }), { d: 1 }), { x: 84, y: 104, t: 96, F1: [104, AY], F2: [99, AY], H1: [118, 182], d: 0.9 }], free: true, dur: 4
  });
  add('iso_chest', 'Compresión isométrica de pecho', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], H1: [104, 82], e1s: 1 },
    frames: [{}, { H1: [102, 82] }], pulse: true
  });
  add('chest_pass', 'Pase de pecho con balón medicinal', {
    base: { x: 96, y: 104, t: 176, F1: [124, AY], F2: [76, AY], h1: [-10, 12], e1s: -1 },
    props: [{ type: 'ball', at: J => [J.hd1[0] + 6, J.hd1[1]], r: 8 }],
    frames: [{ d: 1 }, { x: 102, t: 168, h1: [-4, 48], d: 0.5 }], free: true, dur: 1.6
  });
  add('wall_sit', 'Sentadilla isométrica en la pared', {
    base: { x: 60, y: 136, t: 182, F1: [100, AY], F2: [96, AY], a1: 4, e1: 30 },
    props: [{ type: 'wall', x: 38, w: 10 }],
    frames: [{ l1: 90, k1: 0, pf: true, F1: undefined }, { l2: 90, k2: 0, pf: true, F1: [100, AY], F2: undefined }], free: true, dur: 2.6
  });
  /* ============================== POTENCIA / OLÍMPICOS ============================== */
  add('clean', 'Cargada (clean)', {
    base: { x: 80, y: 130, t: 124, F1: [104, AY], F2: [99, AY], H1: [106, 171] }, props: [BB],
    frames: [{ d: 0.9 }, { x: 102, y: 96, t: 186, F1: [104, 174], F2: [99, 174], f1: 40, f2: 40, H1: [108, 106], d: .3 }, { H1: [109, 76], e1s: 1, d: .3 }, { x: 88, y: 122, t: 164, F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, a1: 102, e1: -112, d: .5 }, { x: 100, y: 100, t: 178, d: .5 }, { d: .6 }, { H1: [104, 104], e1s: -1, d: .9 }], dur: 4
  });
  add('snatch', 'Arrancada (snatch)', {
    base: { x: 80, y: 128, t: 120, F1: [104, AY], F2: [99, AY], H1: [104, 171] }, props: [BB],
    frames: [{ d: 0.9 }, { x: 102, y: 96, t: 186, F1: [104, 174], F2: [99, 174], f1: 40, f2: 40, H1: [110, 102], d: .3 }, { H1: [111, 72], e1s: 1, d: .3 }, { x: 88, y: 128, t: 166, F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, a1: 174, e1: 176, d: .5 }, { x: 100, y: 100, t: 180, a1: 176, e1: 178, d: .5 }, { d: .6 }, { H1: [104, 104], e1s: -1, d: 1 }], dur: 4.1
  });
  add('highpull', 'High pull', {
    base: { x: 84, y: 112, t: 140, F1: [104, AY], F2: [99, AY], H1: [106, 140] }, props: [BB],
    frames: [{}, { x: 102, y: 96, t: 186, F1: [104, 174], F2: [99, 174], f1: 40, f2: 40, H1: [110, 66], e1s: 1 }], dur: 1.8
  });
  add('thruster', 'Thruster', {
    base: S({ t: 178, a1: 102, e1: -112 }), props: [BB],
    frames: [{ x: 84, y: 141, t: 156 }, { x: 100, y: 100, t: 178, a1: 176, e1: 178 }], dur: 2.2
  });
  add('kb_snatch', 'Snatch / clean con kettlebell', {
    base: { x: 82, y: 108, t: 120, F1: [108, AY], F2: [103, AY], H1: [92, 136] }, props: [{ type: 'kb', at: 'hd1' }],
    frames: [{ d: 1 }, { x: 102, y: 100, t: 182, a1: 176, e1: 178, d: 1 }], dur: 2
  });
  add('landmine_clean', 'Clean & press en Landmine', {
    base: { x: 84, y: 120, t: 140, F1: [116, AY], F2: [86, AY], H1: [100, 150] },
    props: [{ type: 'landmine', pivot: [236, 182] }],
    frames: [{ d: 1 }, { x: 96, y: 104, t: 176, h1: [-2, 12], d: .8 }, { h1: [38, 32], d: 1 }], dur: 2.8
  });
  add('punch_rot', 'Golpe rotacional / lanzamiento', {
    base: { x: 96, y: 104, t: 176, F1: [126, AY], F2: [72, 174], f2: 30, h1: [-6, 6] },
    props: [{ type: 'landmine', pivot: [236, 182] }],
    frames: [{ x: 88, t: 186 }, { x: 104, t: 164, h1: [30, 40] }], dur: 1.6
  });
  add('med_slam', 'Med ball slam', {
    base: S({ a1: 176, e1: 176 }),
    props: [{ type: 'ball', at: J => A.mv(J.hd1, J.e1, 4), r: 9 }],
    frames: [{ y: 96, F1: [104, 175], F2: [99, 175], f1: 40, f2: 40, d: 1 }, { x: 82, y: 128, t: 116, F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, a1: 30, e1: 30, d: .6 }], dur: 1.6
  });
  add('wall_throw', 'Lanzamiento rotacional contra muro', {
    base: { view: 'front', x: 96, y: 108, t: 184, F1: [122, AY], F2: [72, AY], a1: -40, e1: -40, a2: -50, e2: -30 },
    props: [{ type: 'wall', x: 176, w: 10 }, { type: 'ball', at: J => [(J.hd1[0] + J.hd2[0]) / 2, (J.hd1[1] + J.hd2[1]) / 2], r: 9 }],
    frames: [{}, { x: 106, t: 174, a1: 80, e1: 80, a2: 70, e2: 80 }], dur: 1.6
  });
  add('battle_ropes', 'Battle ropes', {
    base: { x: 90, y: 128, t: 160, F1: [116, AY], F2: [80, AY], a1: 60, e1: 70 },
    props: [{ type: 'rope', from: 'hd1', to: [196, 176] }, { type: 'rope', from: 'hd2', to: [196, 178], ph: 3, c: '#9a7d52' }],
    frames: [{ a1: 70, e1: 90, a2: 40, e2: 40 }, { a1: 40, e1: 40, a2: 70, e2: 90 }], dur: 0.8
  });

  /* ============================== PLIOMETRÍA ============================== */
  const crouch = { x: 80, y: 132, t: 128, a1: -50, e1: -40 };
  add('jump_squat', 'Salto vertical (squat jump)', {
    base: S({}),
    frames: [{ d: 1 }, Object.assign({ d: .7 }, crouch), { x: 100, y: 60, t: 182, F1: [104, 140], F2: [99, 140], f1: 30, f2: 30, a1: 170, e1: 170, d: .6, ease: 'out' }, Object.assign({ F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, d: .6 }, crouch)], dur: 2
  });
  add('box_jump', 'Salto al cajón', {
    base: S({ x: 64, F1: [68, AY], F2: [63, AY] }), props: [{ type: 'box', x: 112, y: 140, w: 48 }],
    frames: [{ d: .8 }, { x: 56, y: 132, t: 128, a1: -50, e1: -40, d: .6 }, { x: 102, y: 60, t: 170, F1: [118, 110], F2: [114, 112], a1: 150, e1: 150, d: .6 }, { x: 116, y: 100, t: 140, F1: [136, 135], F2: [131, 135], a1: 80, e1: 90, d: .5 }, { x: 132, y: 56, t: 180, a1: 4, e1: 8, d: .8 }, { x: 64, y: 100, t: 180, F1: [68, AY], F2: [63, AY], cut: true, d: .2 }], dur: 3
  });
  add('depth_jump', 'Depth jump', {
    base: { x: 52, y: 62, t: 180, F1: [56, 141], F2: [51, 141] }, props: [{ type: 'box', x: 26, y: 146, w: 44 }],
    frames: [{ d: .8 }, { x: 96, y: 108, t: 176, F1: [100, 170], F2: [95, 172], a1: 70, e1: 80, d: .4 }, { x: 102, y: 128, t: 140, F1: [108, AY], F2: [103, AY], a1: -40, e1: -30, d: .3 }, { x: 108, y: 56, t: 182, F1: [112, 136], F2: [107, 136], f1: 30, a1: 170, e1: 170, d: .6 }, { x: 52, y: 62, F1: [56, 141], F2: [51, 141], f1: 78, a1: 4, e1: 8, cut: true, d: .2 }], dur: 3
  });
  add('broad_jump', 'Salto horizontal', {
    base: S({ x: 50, F1: [54, AY], F2: [49, AY] }),
    frames: [{ d: .6 }, { x: 40, y: 132, t: 128, a1: -50, e1: -40, d: .6 }, { x: 96, y: 76, t: 150, F1: [118, 140], F2: [112, 142], a1: 130, e1: 130, d: .6 }, { x: 128, y: 132, t: 136, F1: [154, AY], F2: [149, AY], a1: 90, e1: 90, d: .5 }, { x: 150, y: 100, t: 180, a1: 4, e1: 8, d: .7 }, { x: 50, F1: [54, AY], F2: [49, AY], cut: true, d: .2 }], dur: 3
  });
  add('hurdle_hops', 'Saltos de vallas', {
    base: S({ x: 50, F1: [54, AY], F2: [49, AY], a1: 30, e1: 60 }), props: [{ type: 'hurdle', x: 100, y: 166 }, { type: 'hurdle', x: 160, y: 166 }],
    frames: [{ x: 60, y: 112, F1: [64, AY], F2: [59, AY], d: .4 }, { x: 98, y: 76, F1: [104, 150], F2: [99, 150], f1: 30, d: .5 }, { x: 132, y: 112, F1: [136, AY], F2: [131, AY], f1: 78, d: .4 }, { x: 60, y: 112, F1: [64, AY], F2: [59, AY], cut: true, d: .2 }], dur: 1.6
  });
  add('pogo', 'Pogo jumps', {
    base: S({ a1: 20, e1: 40 }),
    frames: [{ F1: [104, 172], F2: [99, 172], f1: 34, f2: 34, y: 94 }, { y: 80, F1: [104, 158], F2: [99, 158] }], dur: 0.6
  });
  add('bounds', 'Bounds / zancadas saltadas', {
    base: S({}),
    frames: runFrames(1.25), ease: 'linear', dur: 1.2
  });
  add('skater', 'Skater jumps', {
    base: { view: 'front', x: 64, y: 112, t: 172, F1: [70, AY], l2: -40, k2: 30, a1: -20, e1: -10, a2: -50, e2: -40 },
    frames: [{ d: 0.6 }, { x: 100, y: 84, t: 180, F1: [108, 166], F2: [92, 166], l2: undefined, a1: 10, e1: 10, a2: -10, e2: -10, d: 0.5 }, { x: 136, y: 112, t: 188, F2: [130, AY], F1: undefined, l1: 40, k1: -30, a1: 50, e1: 40, a2: 20, e2: 10, d: 0.6 }, { x: 100, y: 84, t: 180, F1: [108, 166], F2: [92, 166], l1: undefined, a1: 10, e1: 10, a2: -10, e2: -10, d: 0.5 }], free: true, dur: 2.4
  });
  add('landing', 'Aterrizaje (snap down)', {
    base: S({ y: 96, F1: [104, 175], F2: [99, 175], f1: 40, f2: 40, a1: 176, e1: 176 }),
    frames: [{ d: 1 }, { x: 84, y: 128, t: 140, F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, a1: -40, e1: -30, d: .5, ease: 'out' }, { x: 98, y: 106, t: 160, F2: [86, 150], a1: 60, e1: 70, d: 1 }], dur: 2.2
  });
  add('hop_single', 'Salto a una pierna', {
    base: S({ x: 60, F1: [64, AY], l2: 20, k2: -80, a1: 30, e1: 60 }),
    frames: [{ x: 56, y: 116, t: 150, d: .5 }, { x: 96, y: 84, t: 160, F1: [104, 150], d: .5 }, { x: 132, y: 112, t: 150, F1: [140, AY], d: .5 }, { x: 56, y: 116, F1: [64, AY], cut: true, d: .2 }], dur: 1.8
  });
  add('cutting', 'Cambios de dirección', {
    base: { view: 'front', x: 100, y: 116, t: 180, F1: [130, AY], F2: [70, AY], a1: 40, e1: 60 },
    props: [{ type: 'band', from: [100, 120], to: [10, 120] }],
    frames: [{ x: 118, t: 172, F1: [150, AY] }, { x: 82, t: 188, F2: [50, AY], F1: [118, AY] }], dur: 1.4
  });

  /* ============================== CARDIO ============================== */
  add('walk', 'Caminar / marcha', { base: S({}), frames: walk({}), ease: 'linear', dur: 1.4 });
  add('walk_back', 'Arrastre de trineo de espaldas', {
    base: S({ t: 174 }), props: [{ type: 'sled', at: 'hd1', dx: 30 }],
    frames: walk({ t: 172, h1: [-20, 24], armSwing: 0 }).reverse(), ease: 'linear', dur: 1.6
  });
  add('run', 'Correr / sprint', { base: S({}), frames: runFrames(1), ease: 'linear', dur: 0.8 });
  add('jog', 'Trote', { base: S({}), frames: runFrames(0.7), ease: 'linear', dur: 1 });
  add('sled_push', 'Empuje de trineo', {
    base: S({ t: 128 }), props: [{ type: 'sled', at: 'hd1', dx: 2 }],
    frames: runFrames(0.8, { t: 124, y: 112, H1: [150, 116], push: true }), ease: 'linear', dur: 1.2
  });
  add('yoke', 'Paseo de yugo', {
    base: S({ h1: [-2, -8] }), props: [{ type: 'yoke' }],
    frames: walk({ h1: [-2, -8], armSwing: 0, stride: 0.6 }), ease: 'linear', dur: 1.6
  });
  // paseos con carga (loaded carries): misma marcha, distinta posición de brazos
  const carryW = (arms, props, label, name) => add(name, label, {
    base: S(arms), props, frames: walk(Object.assign({ armSwing: 0, stride: 0.8 }, arms)), ease: 'linear', dur: 1.6
  });
  carryW({ a1: 178, e1: 178 }, [BB], 'Paseo con barra sobre la cabeza', 'carry_oh');
  carryW({ a1: 176, e1: 176 }, DB, 'Paseo con mancuernas sobre la cabeza', 'carry_oh_db');
  carryW({ a1: 176, e1: 176, a2: 4, e2: 8 }, KB, 'Paseo con kettlebell sobre la cabeza / camarero', 'carry_oh1');
  carryW({ a1: 18, e1: 162 }, [{ type: 'kb', at: 'hd2', layer: 'mid', dim: true }, { type: 'kb', at: 'hd1' }], 'Paseo en rack frontal', 'carry_rack');
  carryW({ a1: 102, e1: -112 }, [{ type: 'barbell', at: J => A.mv(J.shc, J.t - 90, 9) }], 'Paseo con barra en rack frontal', 'carry_rack_bb');
  carryW({ a1: 18, e1: 162, a2: 2, e2: 2 }, [{ type: 'kb', at: 'hd2', layer: 'mid', dim: true }, { type: 'kb', at: 'hd1' }], 'Paseo mixto (rack y maleta)', 'carry_mixed');
  carryW({ a1: 24, e1: 172, a2: 4, e2: 8 }, [{ type: 'kb', at: 'hd1', up: true }], 'Paseo bottoms-up con kettlebell', 'carry_bu');
  carryW({ a1: 30, e1: 150 }, [{ type: 'barbell', at: 'el1' }], 'Paseo Zercher', 'carry_zercher');
  carryW({ a1: 40, e1: 120 }, [{ type: 'ball', at: J => [J.hd1[0] - 4, J.hd1[1] + 2], r: 17 }], 'Paseo con saco abrazado', 'carry_hug');
  add('tuck_jump', 'Salto con rodillas al pecho', {
    base: S({}),
    frames: [{ d: 1 }, { x: 88, y: 128, t: 150, a1: -40, e1: -30, d: .6 }, { x: 100, y: 62, t: 178, F1: [110, 100], F2: [105, 102], a1: 70, e1: 80, d: .6, ease: 'out' }, { x: 92, y: 124, t: 150, F1: [104, AY], F2: [99, AY], a1: 20, e1: 30, d: .6 }], dur: 2
  });
  add('mb_toss', 'Lanzamiento de balón medicinal hacia arriba / atrás', {
    base: S({ a1: 4, e1: 4 }), props: [{ type: 'ball', at: J => [J.hd1[0] + 2, J.hd1[1] + 4], r: 9 }],
    frames: [{ d: 1 }, { x: 84, y: 132, t: 140, a1: -10, e1: -10, d: .6 }, { x: 100, y: 92, t: 188, a1: 176, e1: 176, d: .5, ease: 'out' }, { a1: 4, e1: 4, d: .6 }], dur: 2.4
  });
  add('wall_ball', 'Wall ball (sentadilla y lanzamiento)', {
    base: S({ a1: 30, e1: 150 }), props: [{ type: 'wall', x: 150, w: 10 }, { type: 'ball', at: J => [J.hd1[0] + 3, J.hd1[1] - 4], r: 9 }],
    frames: [{ d: .6 }, { x: 84, y: 140, t: 158, d: .8 }, { x: 100, y: 98, t: 182, a1: 172, e1: 172, d: .5, ease: 'out' }, { a1: 30, e1: 150, d: .6 }], dur: 2.6
  });
  const crank = [124, 150];
  const pedal = (k, n) => { const a = 180 - k / n * 360; const c = [crank[0] + Math.sin(a * Math.PI / 180) * 15, crank[1] + Math.cos(a * Math.PI / 180) * 15]; const c2 = [crank[0] - Math.sin(a * Math.PI / 180) * 15, crank[1] - Math.cos(a * Math.PI / 180) * 15]; return { F1: c, F2: c2 }; };
  add('bike', 'Bicicleta estática', {
    base: { x: 92, y: 98, t: 148, H1: [150, 82], pf: false, f1: 90, f2: 90 },
    props: [{ type: 'bike', crank, seat: [92, 98], bar: [150, 80] }],
    frames: Array.from({ length: 8 }, (_, k) => pedal(k, 8)), ease: 'linear', dur: 1.2
  });
  add('airbike', 'Air bike', {
    base: { x: 92, y: 98, t: 152, H1: [146, 84], pf: false, f1: 90, f2: 90 },
    props: [{ type: 'bike', crank, seat: [92, 98], bar: [150, 80], fan: true }],
    frames: Array.from({ length: 8 }, (_, k) => Object.assign(pedal(k, 8), { H1: [k < 4 ? 140 + k * 3 : 152 - (k - 4) * 3, 84], H2: [k < 4 ? 148 - k * 3 : 136 + (k - 4) * 3, 84] })), ease: 'linear', dur: 1.1
  });
  add('rower', 'Remo indoor', {
    base: { x: 92, y: 168, t: 154, F1: [140, 168], F2: [136, 168], f1: 40, f2: 40, H1: [146, 140] },
    props: [{ type: 'rower' }],
    frames: [{ d: 1 }, { x: 52, t: 196, H1: [74, 140], d: 1 }], dur: 2
  });
  add('skierg', 'SkiErg', {
    base: S({ a1: 160, e1: 168 }),
    props: [{ type: 'tower', x: 150, top: 4, pulleys: [14] }, { type: 'cable', from: [150, 14], to: 'hd1' }],
    frames: [{ d: 1 }, { x: 88, y: 116, t: 128, a1: 10, e1: 10, d: .8 }], dur: 1.6
  });
  add('stairs', 'Escaladora / subir escalones', {
    base: S({ t: 172, x: 92, H1: [140, 96] }), props: [{ type: 'stairs' }],
    frames: [{ F1: [124, 156], F2: [100, AY] }, { F1: [118, 170], F2: [118, 150] }, { F2: [124, 156], F1: [100, AY] }, { F2: [118, 170], F1: [118, 150] }], ease: 'linear', dur: 1.6
  });

  /* ============================== CALISTENIA ============================== */
  add('hspu', 'Flexión en pino (handstand push-up)', {
    base: { x: 100, y: 84, t: 2, h: 0, pf: false, l1: 180, k1: 180, H1: [102, 182], e1s: 1 },
    props: [{ type: 'wall', x: 84 }],
    frames: [{}, { y: 114 }]
  });
  add('lsit', 'L-sit', {
    base: { x: 100, y: 152, t: 178, pf: false, l1: 92, k1: 92, H1: [100, 172] },
    props: [{ type: 'pad', a: [90, 172], b: [112, 172], w: 4 }, { type: 'pad', a: [92, 172], b: [92, 184], w: 3 }],
    frames: [{}, { y: 150 }], pulse: true, dur: 2
  });
  add('hang', 'Suspensión / tracción en barra', {
    base: { x: 98, y: 101, t: 182, pf: false, l1: 18, k1: -36, H1: [104, 6] },
    props: [{ type: 'pullbar', x: 104, y: 4 }],
    frames: [{}, { y: 103 }], pulse: true, dur: 2.6
  });
  add('hang_feet', 'Tracción axial con pies apoyados', {
    base: { x: 96, y: 124, t: 182, F1: [130, AY], F2: [126, AY], H1: [104, 26] },
    props: [{ type: 'pullbar', x: 104, y: 24 }],
    frames: [{}, { y: 128 }], pulse: true, dur: 2.6
  });

  /* ============================== REHABILITACIÓN ESPECÍFICA ============================== */
  add('codman', 'Pendulares de Codman', {
    base: { x: 72, y: 104, t: 96, F1: [96, AY], F2: [64, AY], H2: [138, 130], a1: -14, e1: -14 },
    props: [{ type: 'table', x: 126, y: 136, w: 60 }],
    frames: [{ a1: -16, e1: -16 }, { a1: 16, e1: 16 }], dur: 2
  });
  add('wand_flex', 'Flexión asistida con bastón (supino)', {
    base: { x: 104, y: 175, t: -90, F1: [136, AY], F2: [132, AY], pf: true, a1: 92, e1: 92 },
    props: [{ type: 'stick', at: 'hd1' }],
    frames: [{}, { a1: 180, e1: 180 }, { a1: -96, e1: -96 }], dur: 3.4
  });
  add('wand_flex90', 'Flexión asistida limitada a 90°', {
    base: { x: 104, y: 175, t: -90, F1: [136, AY], F2: [132, AY], pf: true, a1: 92, e1: 92 },
    props: [{ type: 'stick', at: 'hd1' }],
    frames: [{}, { a1: 178, e1: 178 }], dur: 2.6
  });
  add('wand_er', 'Rotación externa asistida con bastón', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 4, e1: 90, fs1: 0.25, H2: [118, 104] },
    props: [{ type: 'pad', a: 'hd2', b: 'hd1', w: 3 }],
    frames: [{}, { e1: 70, fs1: 1, H2: [140, 100] }]
  });
  add('pulley_overhead', 'Polea de techo (autoasistencia)', {
    base: { x: 90, y: 124, t: 180, F1: [130, AY], F2: [126, AY], a1: 150, e1: 160, a2: 30, e2: 60 },
    props: [{ type: 'bench', a: [66, 132], b: [108, 132], legs: [74, 100] }, { type: 'pullbar', x: 104, y: 10 }, { type: 'cable', from: [104, 10], to: 'hd1' }, { type: 'cable', from: [104, 10], to: 'hd2' }],
    frames: [{}, { a1: 30, e1: 60, a2: 150, e2: 160 }], dur: 3
  });
  add('sleeper', 'Sleeper stretch', {
    base: { x: 104, y: 166, t: -90, pf: false, l1: 120, k1: 60, l2: 122, k2: 62, a1: 180, e1: 180, us1: 0.2, a2: 120, e2: 160 }, roll3: 90,
    frames: [{}, { e1: 110 }], dur: 3
  });
  add('table_slide', 'Deslizamientos en mesa', {
    base: { x: 72, y: 124, t: 178, F1: [112, AY], F2: [108, AY], H1: [116, 134] },
    props: [{ type: 'table', x: 104, y: 138, w: 84 }, { type: 'bench', a: [52, 132], b: [90, 132], legs: [58, 84] }],
    frames: [{}, { t: 136, H1: [170, 134] }], dur: 3
  });
  add('perturb', 'Perturbaciones rítmicas', {
    base: { x: 104, y: 175, t: -90, F1: [136, AY], F2: [132, AY], pf: true, a1: 178, e1: 178 },
    props: [{ type: 'band', from: 'hd1', to: [140, 20] }],
    frames: [{ a1: 172, e1: 174 }, { a1: 186, e1: 184 }, { a1: 176, e1: 176 }, { a1: 184, e1: 186 }], dur: 0.9
  });
  add('plyo_ball', 'Rebotes con pelota a 90/90', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 90, e1: 180, a2: -4, e2: -4 },
    props: [{ type: 'ball', at: 'hd1', r: 6, fill: '#ff6b8b', stroke: '#ffa3b6' }],
    frames: [{ e1: 186 }, { e1: 120, fs1: 0.35 }], dur: 1
  });
  add('neck', 'Cuello: flexión / extensión', {
    base: { x: 82, y: 118, t: 180, F1: [124, AY], F2: [120, AY], H1: [108, 116] },
    props: [{ type: 'bench', a: [60, 126], b: [104, 126], legs: [68, 96] }],
    frames: [{ h: -26 }, { h: 26 }], dur: 2.4
  });
  add('neck_side', 'Cuello: flexión lateral / isometría', {
    base: { view: 'front', x: 100, y: 124, t: 180, l1: 20, k1: 0, ts1: 0.4, pf: false, a1: 4, e1: 4, H2: [84, 34] },
    props: [{ type: 'box', x: 74, y: 128, w: 52 }],
    frames: [{ h: -4 }, { h: 4 }], pulse: true, dur: 2
  });
  add('sciatic_slider', 'Deslizamiento del nervio ciático', {
    base: { x: 82, y: 118, t: 182, pf: false, l1: 90, k1: 0, l2: 92, k2: 4, H1: [90, 128], f1: 70 },
    props: [{ type: 'bench', a: [44, 126], b: [104, 126], legs: [52, 96] }],
    frames: [{ h: 30 }, { k1: 86, f1: 100, h: -30 }], dur: 3
  });
  add('slump', 'Slump dinámico', {
    base: { x: 82, y: 118, t: 158, h: 40, pf: false, l1: 90, k1: 0, l2: 92, k2: 4, h1: [-30, 6], f1: 70 },
    props: [{ type: 'bench', a: [44, 126], b: [104, 126], legs: [52, 96] }],
    frames: [{}, { k1: 84, f1: 105 }], dur: 3
  });
  add('median_slider', 'Neurodinamia del nervio mediano', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 92, e1: 92, w1: -10, a2: -4, e2: -4 },
    frames: [{ w1: -60, h: 18 }, { w1: 30, h: -18 }], dur: 3
  });
  add('ulnar_slider', 'Neurodinamia del nervio cubital', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 4, e1: 4, a2: -4, e2: -4 },
    frames: [{}, { H1: [104, 40], h: 14 }], dur: 3
  });
  add('cross_ed', 'Educación cruzada (carga contralateral)', {
    base: { x: 82, y: 118, t: 186, pf: false, l1: 90, k1: 4, l2: 90, k2: 8, H1: [88, 128] },
    props: [seat, { type: 'pad', a: [62, 126], b: [56, 72], w: 8 }, { type: 'roller', at: J => A.mv(J.an1, J.k1 - 90, 6), r: 5 }],
    frames: [{}, { k1: 84 }]
  });
  add('weight_shift', 'Transferencia de carga / descarga progresiva', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [118, AY], F2: [82, AY], a1: 14, e1: 4 },
    props: [{ type: 'crutch', at: 'hd1', dx: 4 }, { type: 'crutch', at: 'hd2', dx: -4 }],
    frames: [{ x: 94, t: 184 }, { x: 106, t: 176 }], dur: 2.4
  });
  add('glider', 'The Glider (Askling)', {
    base: { x: 104, y: 102, t: 176, F1: [118, AY], F2: [96, AY], a1: 20, e1: 40 },
    props: [{ type: 'pad', a: J => [J.an2[0] - 6, 183], b: J => [J.an2[0] + 12, 183], w: 3 }],
    frames: [{}, { x: 96, y: 116, t: 168, F2: [56, AY], H2: undefined }]
  });
  add('extender', 'The Extender (Askling)', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 178, k1: 92, l2: 90, k2: 90, H1: [112, 150] },
    frames: [{}, { k1: 168 }]
  });

  /* ============================== PRIMEROS PLANOS (mano, pie, cara) ============================== */
  add('hand_glide', 'Deslizamientos tendinosos de la mano', { custom: 'hand', mode: 'glide', dur: 4 });
  add('hand_grip', 'Prensión / masilla terapéutica', { custom: 'hand', mode: 'grip', dur: 1.8 });
  add('hand_wrist', 'Flexo-extensión de muñeca', { custom: 'hand', mode: 'wrist', dur: 2.4 });
  add('hand_dev', 'Desviación radial / cubital', { custom: 'hand', mode: 'dev', dur: 2.2 });
  add('hand_prono', 'Pronosupinación', { custom: 'hand', mode: 'prono', dur: 2.4 });
  add('foot_short', 'Pie corto (short foot)', { custom: 'foot', mode: 'short', dur: 2.6 });
  add('foot_spread', 'Separación activa de dedos', { custom: 'foot', mode: 'spread', dur: 2.2 });
  add('foot_hallux', 'Disociación del hallux', { custom: 'foot', mode: 'hallux', dur: 2.4 });
  add('foot_windlass', 'Estiramiento Windlass / movilización MTF', { custom: 'foot', mode: 'windlass', dur: 2.6 });
  add('foot_massage', 'Masaje / movilización de cicatriz', { custom: 'foot', mode: 'massage', dur: 2.4 });
  add('face', 'Reeducación facial', { custom: 'face', mode: 'all', dur: 6 });
  add('stand', 'Postura de pie', { base: S({}), frames: [{}, { sh: 1 }], dur: 3 });

  /* ---------------------------------------------------------- ciclos de marcha/carrera */
  function walk(o) {
    const sw = o.armSwing ?? 1, st = o.stride ?? 1, base = {};
    ['t', 'h1', 'a1', 'e1', 'a2', 'e2'].forEach(k => { if (o[k] !== undefined) base[k] = o[k]; });
    const arm = (a, b) => sw ? { a1: 4 + a * 22 * sw, e1: 10 + a * 26 * sw, a2: 4 + b * 22 * sw, e2: 10 + b * 26 * sw } : {};
    const fr = [
      Object.assign({ y: 101, F1: [100 + 22 * st, AY], F2: [100 - 20 * st, 175], f1: 95, f2: 40 }, arm(-1, 1)),
      Object.assign({ y: 98, F1: [102, AY], F2: [104, 162], f1: 78, f2: 70 }, arm(0, 0)),
      Object.assign({ y: 101, F2: [100 + 22 * st, AY], F1: [100 - 20 * st, 175], f2: 95, f1: 40 }, arm(1, -1)),
      Object.assign({ y: 98, F2: [102, AY], F1: [104, 162], f2: 78, f1: 70 }, arm(0, 0))
    ];
    return fr.map(f => Object.assign({}, base, f));
  }
  function runFrames(k, o) {
    o = o || {};
    const t = o.t ?? 172, y = o.y ?? 100, st = 14 + 10 * k, lift = 6 * k;
    const armA = (fw) => o.push ? { H1: o.H1, H2: [o.H1[0] - 3, o.H1[1] + 2] } : { a1: fw ? 45 * k + 10 : -35 * k, e1: fw ? 45 * k + 105 : -35 * k + 95, a2: fw ? -35 * k : 45 * k + 10, e2: fw ? -35 * k + 95 : 45 * k + 105 };
    const armN = () => o.push ? { H1: o.H1, H2: [o.H1[0] - 3, o.H1[1] + 2] } : { a1: 5, e1: 95, a2: 5, e2: 95 };
    return [
      Object.assign({ t, y: y + 1, F1: [100 + st, AY], f1: 95, F2: [100 - st - 4, 168 - lift], f2: 40 }, armA(false)),
      Object.assign({ t, y: y - 3 - lift, F1: [102, AY - 2 * k], f1: 78, F2: [108 + 4 * k, 150 - 8 * k], f2: 70 }, armN()),
      Object.assign({ t, y: y + 1, F2: [100 + st, AY], f2: 95, F1: [100 - st - 4, 168 - lift], f1: 40 }, armA(true)),
      Object.assign({ t, y: y - 3 - lift, F2: [102, AY - 2 * k], f2: 78, F1: [108 + 4 * k, 150 - 8 * k], f1: 70 }, armN())
    ];
  }

  // ---- variantes: "base@mod+mod" · posturas (seated, kneel), implemento (db, bb, kb, band),
  //      brazos (uni = a una mano, alt = alternado) y piernas (leg1 = a una pierna)
  const HANDPROPS = new Set(['barbell', 'db', 'kb', 'chain', 'plate']);
  const IMPL = {
    db: (front) => front ? [{ type: 'db', at: 'hd1' }, { type: 'db', at: 'hd2' }] : [{ type: 'db', at: 'hd2', layer: 'mid', dim: true }, { type: 'db', at: 'hd1' }],
    bb: () => [{ type: 'barbell', at: 'wr1' }],
    kb: (front) => front ? [{ type: 'kb', at: 'hd1' }, { type: 'kb', at: 'hd2' }] : [{ type: 'kb', at: 'hd2', layer: 'mid', dim: true }, { type: 'kb', at: 'hd1' }],
    band: () => [{ type: 'band', from: 'an1', to: 'hd1' }, { type: 'handle', at: 'hd1' }]
  };
  const ARMK = ['a1', 'e1', 'h1', 'H1', 'e1s', 'us1', 'fs1', 'w1'];
  const ARM2 = ['a2', 'e2', 'h2', 'H2', 'e2s', 'us2', 'fs2', 'w2'];
  const pickArm = (f, i) => { const o = {}; (i === 1 ? ARMK : ARM2).forEach(k => { if (f[k] !== undefined) o[k] = f[k]; }); return o; };
  const asArm2 = (f, front, t) => {
    const o = {};
    if (f.H1) o.H2 = front ? [200 - f.H1[0], f.H1[1]] : [f.H1[0] - 3.5, f.H1[1] - 1.5];
    else if (f.h1) o.h2 = front ? [f.h1[0], -f.h1[1]] : f.h1.slice();
    else if (f.a1 !== undefined) { o.a2 = front ? 2 * t - f.a1 : f.a1; o.e2 = front ? 2 * t - (f.e1 ?? f.a1) : (f.e1 ?? f.a1); }
    if (f.e1s !== undefined) o.e2s = front ? -f.e1s : f.e1s;
    ['us1', 'fs1', 'w1'].forEach(k => { if (f[k] !== undefined) o[k.replace('1', '2')] = f[k]; });
    return o;
  };
  const clearArm = (f, i) => (i === 1 ? ARMK : ARM2).forEach(k => delete f[k]);

  G.SMVariant = name => {
    const [b, modstr] = name.split('@'), src = T[b];
    if (!src || src.custom || !src.frames) return null;
    const mods = (modstr || '').split('+').filter(Boolean);
    const front = (src.base || {}).view === 'front';
    const rawFrames = src._raw || src.frames;           // cuadros originales (antes del ritmo uniforme)
    const t = Object.assign({}, src, { base: Object.assign({}, src.base), frames: rawFrames.map(f => Object.assign({}, f)), props: (src.props || []).slice() });
    delete t._c; delete t._raw;
    const labels = [];
    for (const mod of mods) {
      if (mod === 'seated' || mod === 'kneel') {
        const legs = ['F1', 'F2', 'l1', 'k1', 'l2', 'k2', 'ts1', 'ss1', 'f1', 'f2', 'x', 'y'];
        const oldY = t.base.y ?? 100, x = t.base.x ?? 100;
        t.frames.forEach(f => legs.forEach(k => delete f[k]));
        legs.forEach(k => delete t.base[k]);
        let y;
        if (mod === 'seated') {
          if (front) { y = 124; Object.assign(t.base, { x, y, l1: 20, k1: 0, ts1: 0.4, pf: false }); t.props.unshift({ type: 'box', x: x - 26, y: 128, w: 52 }); }
          else { y = 126; Object.assign(t.base, { x, y, F1: [x + 40, AY], F2: [x + 36, AY], pf: true }); t.props.unshift({ type: 'bench', a: [x - 24, 134], b: [x + 14, 134], legs: [x - 16, x + 6] }); }
          labels.push('sentado');
        } else {
          y = 137;
          if (front) Object.assign(t.base, { x, y, l1: 3, k1: 3, ss1: 0.12, pf: false, f1: 0 });
          else Object.assign(t.base, { x, y, l1: 0, k1: -90, f1: 0, l2: 0, k2: -90, f2: 0, pf: false });
          labels.push('arrodillado');
        }
        const dy = y - oldY;
        [t.base, ...t.frames].forEach(f => ['H1', 'H2'].forEach(k => { if (f[k]) f[k] = [f[k][0], f[k][1] + dy]; }));
      } else if (IMPL[mod]) {
        t.props = t.props.filter(p => !HANDPROPS.has(p.type) && !(p.type === 'band' && p.to === 'hd1'));
        t.props.push(...IMPL[mod](front));
        labels.push({ db: 'mancuernas', bb: 'barra', kb: 'kettlebell', band: 'banda' }[mod]);
      } else if (mod === 'smith') {
        t.props.unshift({ type: 'rails', at: 'wr1' }); labels.push('Smith');
      } else if (mod === 'uni' || mod === 'alt') {
        const tt = t.base.t ?? 180;
        const rest = asArm2(Object.assign({}, t.base, t.frames[0]), front, tt);   // brazo 2 quieto en la pose inicial
        if (mod === 'uni') {
          t.frames.forEach(f => { clearArm(f, 2); Object.assign(f, rest); });
          clearArm(t.base, 2); Object.assign(t.base, rest);
          t.props = t.props.filter(p => p.at !== 'hd2');
          labels.push('a una mano');
        } else if (t.frames.length === 2) {
          const A0 = Object.assign({}, t.base, t.frames[0]), B0 = Object.assign({}, A0, t.frames[1]);
          const restA1 = pickArm(A0, 1), moveB2 = asArm2(B0, front, tt);
          const f0 = Object.assign({}, t.frames[0], rest);
          const f1 = Object.assign({}, t.frames[1], rest);                                   // se mueve el brazo 1
          const f2 = Object.assign({}, t.frames[1]); clearArm(f2, 1); Object.assign(f2, restA1, moveB2);   // se mueve el brazo 2
          const H = 0.35, M = 1.45;
          t.frames = [[f0, H], [f0, M], [f1, H], [f1, M], [f0, H], [f0, M], [f2, H], [f2, M]].map(([f, d]) => Object.assign({}, f, { d }));
          t.free = true; t.dur = 4 * (H + M); t.ease = 'sine';
          labels.push('alterno');
        }
      } else if (mod === 'leg1') {
        const squat = /squat|sissy|legpress|leg_ext/.test(b);
        const leg = squat ? { l2: 75, k2: 70 } : { l2: 25, k2: -70 };
        [t.base, ...t.frames].forEach(f => { delete f.F2; delete f.l2; delete f.k2; });
        Object.assign(t.base, leg, { f2: 60 });
        labels.push('a una pierna');
      }
    }
    t.label = src.label + (labels.length ? ' (' + labels.join(', ') + ')' : '');
    return t;
  };
  G.SMTemplates = T;
})(window);
/* Codificador GIF animado mínimo (sin dependencias).
   SMGif.encode(frames, w, h, delayMs) -> Uint8Array
   frames: lista de Uint8ClampedArray RGBA (como ImageData.data) */
(function (G) {
  'use strict';

  // Paleta: los 255 colores más frecuentes (a 5 bits por canal) de algunos cuadros de muestra
  function buildPalette(samples) {
    const hist = new Uint32Array(32768);
    for (const d of samples) for (let i = 0; i < d.length; i += 8) hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
    const idx = [];
    for (let i = 0; i < 32768; i++) if (hist[i]) idx.push(i);
    idx.sort((a, b) => hist[b] - hist[a]);
    const top = idx.slice(0, 256);
    const pal = new Uint8Array(256 * 3);
    top.forEach((c, k) => { pal[k * 3] = ((c >> 10) & 31) * 8 + 4; pal[k * 3 + 1] = ((c >> 5) & 31) * 8 + 4; pal[k * 3 + 2] = (c & 31) * 8 + 4; });
    return { pal, n: top.length };
  }

  function mapFrame(d, P, cache) {
    const out = new Uint8Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      let c = cache[key];
      if (c === 255 && cache._set[key] !== 1) {
        let best = 0, bd = 1e9;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        for (let k = 0; k < P.n; k++) {
          const dr = P.pal[k * 3] - r, dg = P.pal[k * 3 + 1] - g, db = P.pal[k * 3 + 2] - b;
          const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
          if (dist < bd) { bd = dist; best = k; }
        }
        cache[key] = c = best; cache._set[key] = 1;
      }
      out[j] = c;
    }
    return out;
  }

  // LZW (código mínimo 8), igual que el algoritmo estándar de GIF
  function lzw(ind, out) {
    const MIN = 8, CLEAR = 256, EOI = 257;
    let size = MIN + 1, next = EOI + 1, cur = 0, bits = 0;
    let dict = new Map();
    const block = [];
    const put = code => {
      cur |= code << bits; bits += size;
      while (bits >= 8) { block.push(cur & 255); cur >>>= 8; bits -= 8; }
    };
    put(CLEAR);
    let prefix = ind[0];
    for (let i = 1; i < ind.length; i++) {
      const k = ind[i], key = (prefix << 8) | k;
      const hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      put(prefix);
      if (next === 4096) { put(CLEAR); dict = new Map(); size = MIN + 1; next = EOI + 1; }
      else { if (next >= (1 << size)) size++; dict.set(key, next++); }
      prefix = k;
    }
    put(prefix); put(EOI);
    if (bits > 0) block.push(cur & 255);
    out.push(MIN);
    for (let i = 0; i < block.length; i += 255) {
      const n = Math.min(255, block.length - i);
      out.push(n);
      for (let j = 0; j < n; j++) out.push(block[i + j]);
    }
    out.push(0);
  }

  function encode(frames, w, h, delay) {
    const samples = [frames[0], frames[Math.floor(frames.length / 3)], frames[Math.floor(frames.length * 2 / 3)]];
    const P = buildPalette(samples);
    const cache = new Uint8Array(32768).fill(255); cache._set = new Uint8Array(32768);
    const out = [];
    const str = s => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
    const u16 = v => { out.push(v & 255, (v >> 8) & 255); };
    str('GIF89a'); u16(w); u16(h); out.push(0xF7, 0, 0);
    for (let i = 0; i < 768; i++) out.push(P.pal[i]);
    out.push(0x21, 0xFF, 11); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0);   // bucle infinito
    const cs = Math.round(delay / 10);
    for (const f of frames) {
      out.push(0x21, 0xF9, 4, 0x04, cs & 255, (cs >> 8) & 255, 0, 0);
      out.push(0x2C); u16(0); u16(0); u16(w); u16(h); out.push(0);
      lzw(mapFrame(f, P, cache), out);
    }
    out.push(0x3B);
    return new Uint8Array(out);
  }

  G.SMGif = { encode };
})(typeof window !== 'undefined' ? window : globalThis);
/* Plantillas "En casa · Inicial": ejercicios fáciles con silla y pared para personas que empiezan o tienen movilidad reducida */
(function (G) {
  'use strict';
  const A = G.SMAnim, T = G.SMTemplates; if (!A || !T) return;
  const AY = 179;
  const S = o => Object.assign({ x: 100, y: 100, t: 180, F1: [104, AY], F2: [99, AY], a1: 4, e1: 8 }, o || {});
  const add = (name, label, def) => { def.label = label; T[name] = def; };
  // silla vista de lado (mirando a la derecha): asiento, patas y respaldo
  const chair = (x0 = 52, x1 = 96, y = 128) => [{ type: 'bench', a: [x0, y], b: [x1, y], legs: [x0 + 6, x1 - 6] }, { type: 'pad', a: [x0 + 1, y], b: [x0 - 4, y - 50], w: 6 }];
  // silla al frente para apoyar las manos (respaldo a la altura de la cadera)
  const chairFront = (x = 140) => [{ type: 'pad', a: [x, 104], b: [x + 3, 128], w: 6 }, { type: 'bench', a: [x, 128], b: [x + 40, 128], legs: [x + 4, x + 36] }];
  const SEAT = { x: 76, y: 120, t: 182, F1: [118, AY], F2: [114, AY], pf: true };

  add('sit_stand', 'Pararse y sentarse de la silla', {
    base: Object.assign({}, SEAT, { a1: 80, e1: 84 }), props: chair(),
    frames: [{}, { x: 92, y: 118, t: 146 }, { x: 110, y: 100, t: 180, a1: 70, e1: 76 }, { x: 92, y: 118, t: 146 }], dur: 4.2
  });
  add('chair_march', 'Marcha sentado', {
    base: { x: 76, y: 120, t: 182, pf: false, l1: 90, k1: 2, l2: 90, k2: 2, f1: 85, f2: 85, a1: 4, e1: 30 }, props: chair(),
    frames: [{}, { l1: 118, k1: 22 }, {}, { l2: 118, k2: 22 }], dur: 2.6
  });
  add('chair_knee_ext', 'Extensión de rodilla sentado', {
    base: { x: 76, y: 120, t: 182, pf: false, l1: 90, k1: 2, l2: 90, k2: 2, f1: 85, f2: 85, a1: 4, e1: 30 }, props: chair(),
    frames: [{}, { k1: 86 }], dur: 3
  });
  add('chair_heel_toe', 'Puntas y talones sentado', {
    base: Object.assign({}, SEAT, { f1: 78, a1: 4, e1: 30 }), props: chair(),
    frames: [{}, { F1: [118, 170], F2: [114, 170], f1: 34, f2: 34 }, {}, { f1: 128, f2: 128 }], dur: 3
  });
  add('chair_arms_up', 'Elevación de brazos sentado', {
    base: Object.assign({}, SEAT, { a1: 4, e1: 6 }), props: chair(),
    frames: [{}, { a1: 172, e1: 174 }], dur: 3
  });
  add('chair_row_band', 'Remo con banda sentado', {
    base: Object.assign({}, SEAT, { H1: [138, 122] }), props: chair().concat([{ type: 'band', from: 'hd1', to: [142, 178] }]),
    frames: [{}, { H1: [96, 116] }], dur: 3
  });
  add('chair_hams_stretch', 'Estiramiento de isquiotibiales sentado', {
    base: { x: 84, y: 120, t: 182, F1: [138, AY], f1: 120, F2: [112, AY], a1: 40, e1: 50 }, props: chair(56, 98),
    frames: [{}, { t: 152, a1: 70, e1: 80 }], dur: 4
  });
  add('wall_pushup', 'Flexiones en la pared', {
    base: { x: 104, y: 99, t: 166, F1: [92, AY], F2: [88, AY], H1: [150, 66], H2: [150, 70] }, props: [{ type: 'wall', x: 152, w: 10 }],
    frames: [{}, { x: 116, y: 100, t: 154 }], dur: 3
  });
  add('chair_calf', 'Elevación de talones con apoyo', {
    base: S({ x: 104, f1: 78, H1: [142, 104], H2: [142, 106] }), props: chairFront(140),
    frames: [{}, { x: 107.5, y: 91, F1: [107.6, 170.4], F2: [102.6, 170.4], f1: 30, f2: 30, H1: [142, 104], H2: [142, 106] }], dur: 3
  });
  add('chair_hip_ext', 'Extensión de cadera de pie con apoyo', {
    base: S({ x: 104, t: 174, H1: [142, 104], H2: [142, 106], F2: [104, AY] }), props: chairFront(140),
    frames: [{ l1: 0, k1: 0 }, { l1: -28, k1: -28 }], dur: 3
  });
  add('chair_knee_curl', 'Flexión de rodilla de pie con apoyo', {
    base: S({ x: 104, t: 178, H1: [142, 104], H2: [142, 106], F2: [104, AY] }), props: chairFront(140),
    frames: [{ l1: 0, k1: 0 }, { l1: 4, k1: -100 }], dur: 3
  });
  add('chair_abd', 'Abducción de cadera de pie con apoyo', {
    base: { view: 'front', x: 96, y: 99, t: 180, l1: 2, k1: 2, l2: -2, k2: -2, a1: 4, e1: 4, H2: [56, 104] },
    props: [{ type: 'pad', a: [40, 104], b: [70, 104], w: 6 }, { type: 'pad', a: [44, 104], b: [44, 184], w: 4 }, { type: 'pad', a: [66, 104], b: [66, 184], w: 4 }],
    frames: [{}, { l1: 30, k1: 30, t: 176 }], dur: 3
  });
  add('chair_balance', 'Equilibrio con apoyo en silla', {
    base: { x: 104, y: 100, t: 180, F1: [106, AY], f1: 78, l2: 14, k2: -60, H1: [142, 104], H2: [142, 106] }, props: chairFront(140),
    frames: [{ t: 178 }, { t: 182 }], dur: 2.4
  });
  add('wall_squat_mini', 'Mini sentadilla apoyado en la pared', {
    base: S({ x: 62, t: 182, F1: [92, AY], F2: [88, AY], a1: 60, e1: 70 }), props: [{ type: 'wall', x: 40, w: 10 }],
    frames: [{}, { x: 60, y: 118, t: 182 }], dur: 3.2
  });
  add('step_in_place', 'Marcha en el lugar con apoyo', {
    base: S({ x: 104, y: 99, H1: [142, 104], H2: [142, 106] }), props: chairFront(140),
    frames: [{ l1: 0, k1: 0, l2: 0, k2: 0 }, { l1: 66, k1: -6 }, { l1: 0, k1: 0 }, { l2: 66, k2: -6 }], dur: 2.6
  });
})(window);
