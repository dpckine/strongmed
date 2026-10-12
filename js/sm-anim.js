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
      const hd = mv(wr, e + (p['w' + i] || 0), L.hand * Math.min(1, fs + 0.3));
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
    if (p.view === 'front') {      // en frontal se conservan los objetivos de pie (rodilla proyectada)
      if (p.F1) { delete out.l1; delete out.k1; }
      if (p.F2 || (p.F1 && !('l2' in p))) { delete out.l2; delete out.k2; }
    }
    return out;
  }
  function mix(A, B, u) {
    const out = {};
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
    for (const k of keys) {
      const a = A[k], b = B[k];
      if (a === undefined) { out[k] = b; continue; }
      if (b === undefined) { out[k] = a; continue; }
      if (typeof a === 'number' && typeof b === 'number') out[k] = ANGLES.has(k) ? lerpAng(a, b, u) : lerp(a, b, u);
      else if (Array.isArray(a) && Array.isArray(b)) out[k] = a.map((v, i) => lerp(v, b[i], u));
      else out[k] = u < 0.5 ? a : b;
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
  function compile(tpl) {
    if (tpl._c) return tpl._c;
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

  // ---------------------------------------------------------------- dibujo
  const line = (a, b, w, c, extra = '') => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
  const poly = (pts, w, c, extra = '') => `<polyline points="${pts.map(pt).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const circ = (p, r, fill, stroke = 'none', sw = 0, extra = '') => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;

  function figure(J, hl, layer) {
    // layer: 'far' | 'body' | 'near'
    const H = hl || {};
    const c = (part, far) => H[part] ? (far ? COL.hlFar : COL.hl) : (far ? COL.far : COL.near);
    const glow = part => H[part] ? ' filter="url(#glow)"' : '';
    let s = '';
    if (layer === 'far' || (layer === 'near' && J.front)) {
      // en vista frontal ambos lados se pintan igual de claros
      const far = !J.front;
      const i = J.front && layer === 'near' ? 1 : 2;
      if (!(J.front && layer === 'far' && i === 1)) {
        // pierna
        s += line(J['H' + i] || J.H2, J['kn' + i], 11, c('th', far), glow('th'));
        s += line(J['kn' + i], J['an' + i], 9, c('sh', far), glow('sh'));
        s += line(J['he' + i], J['to' + i], 6, c('ft', far), glow('ft'));
        // brazo
        s += line(J['S' + i], J['el' + i], 9, c('ua', far), glow('ua'));
        s += line(J['el' + i], J['wr' + i], 8, c('fa', far), glow('fa'));
        s += line(J['wr' + i], J['hd' + i], 6.5, c('fa', far));
      }
      if (J.front && layer === 'near') {
        // en frontal, el lado "lejano" (izquierdo) se dibuja aquí también
        s += line(J.H2, J.kn2, 11, c('th'), glow('th')) + line(J.kn2, J.an2, 9, c('sh'), glow('sh')) + line(J.he2, J.to2, 6, c('ft'));
        s += line(J.S2, J.el2, 9, c('ua'), glow('ua')) + line(J.el2, J.wr2, 8, c('fa'), glow('fa')) + line(J.wr2, J.hd2, 6.5, c('fa'));
      }
      return s;
    }
    if (layer === 'body') {
      if (J.front) {
        const sw = 30, hw = 17;
        const n = J.n;
        const p1 = [J.S1[0] + n[0] * 3, J.S1[1] + n[1] * 3], p2 = [J.S2[0] - n[0] * 3, J.S2[1] - n[1] * 3];
        const q1 = [J.hip[0] + n[0] * hw / 2, J.hip[1] + n[1] * hw / 2], q2 = [J.hip[0] - n[0] * hw / 2, J.hip[1] - n[1] * hw / 2];
        s += `<path d="M${pt(p1)} L${pt(p2)} Q${pt([(p2[0] + q2[0]) / 2 - n[0] * 2, (p2[1] + q2[1]) / 2 - n[1] * 2])} ${pt(q2)} L${pt(q1)} Q${pt([(p1[0] + q1[0]) / 2 + n[0] * 2, (p1[1] + q1[1]) / 2 + n[1] * 2])} ${pt(p1)} Z" fill="${c('torso')}" stroke="${c('torso')}" stroke-width="5" stroke-linejoin="round"${glow('torso')}/>`;
        s += line(J.shc, J.neck, 7, COL.near);
        s += circ(J.head, L.head, c('head'));
        return s + (sw ? '' : '');
      }
      // tronco lateral con algo de forma (pecho más ancho que cintura)
      const u = J.u, n = J.n;
      const chest = mv(J.hip, J.t, L.torso * 0.62);
      const a = [J.hip[0] + n[0] * 5.5, J.hip[1] + n[1] * 5.5], b = [J.hip[0] - n[0] * 6, J.hip[1] - n[1] * 6];
      const cF = [chest[0] + n[0] * 8, chest[1] + n[1] * 8], cB = [chest[0] - n[0] * 7, chest[1] - n[1] * 7];
      const sF = [J.shc[0] + n[0] * 5 - u[0] * 1, J.shc[1] + n[1] * 5 - u[1] * 1], sB = [J.shc[0] - n[0] * 5.5, J.shc[1] - n[1] * 5.5];
      s += `<path d="M${pt(a)} Q${pt(cF)} ${pt(sF)} L${pt(sB)} Q${pt(cB)} ${pt(b)} Z" fill="${c('torso')}" stroke="${c('torso')}" stroke-width="4" stroke-linejoin="round"${glow('torso')}/>`;
      s += line(J.shc, J.neck, 7, COL.near);
      s += circ(J.head, L.head, c('head'));
      // ojo para indicar hacia dónde mira
      const fwd = dir(J.t + (J.p.h || 0) - 90), eye = [J.head[0] + fwd[0] * 4.2 + J.u[0] * 0, J.head[1] + fwd[1] * 4.2];
      s += circ(eye, 1.3, '#0c0d0e');
      return s;
    }
    if (layer === 'near' && !J.front) {
      s += line(J.H1, J.kn1, 11, c('th'), glow('th'));
      s += line(J.kn1, J.an1, 9, c('sh'), glow('sh'));
      s += line(J.he1, J.to1, 6, c('ft'), glow('ft'));
      return s;
    }
    if (layer === 'arm') {
      if (J.front) return '';
      s += line(J.S1, J.el1, 9, c('ua'), glow('ua'));
      s += line(J.el1, J.wr1, 8, c('fa'), glow('fa'));
      s += line(J.wr1, J.hd1, 6.5, c('fa'));
      return s;
    }
    return s;
  }

  // ---------------------------------------------------------------- implementos
  function at(J, a) {
    if (typeof a === 'function') return a(J);
    if (typeof a === 'string') return J[a];
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
      const p = at(J, o.at || 'wr1'); const r = o.r || 13;
      return circ(p, r, COL.plate, COL.plateRim, 2) + circ(p, r * 0.55, 'none', '#3a424d', 1.2) + circ(p, 2.6, COL.metal);
    },
    plate: (J, o) => { const p = at(J, o.at); const r = o.r || 9; return circ(p, r, COL.plate, COL.plateRim, 1.8) + circ(p, 2, COL.metal); },
    db: (J, o) => {
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
      const p = o.pivot, h = at(J, o.at || 'hd1'); const v = [h[0] - p[0], h[1] - p[1]]; const m = Math.hypot(...v) || 1;
      const e = [h[0] + v[0] / m * 12, h[1] + v[1] / m * 12];
      return line(p, e, 3.2, COL.metal) + circ(e, 10, COL.plate, COL.plateRim, 1.8) + circ(p, 3.5, COL.padDark);
    },
    platform: (J, o) => { const p = at(J, o.at || 'an1'); const d = dir(o.a); return line([p[0] - d[0] * 18, p[1] - d[1] * 18], [p[0] + d[0] * 18, p[1] + d[1] * 18], 5, COL.pad) + line(p, mv(p, o.a + 90, 0), 0, COL.pad); },
    pad: (J, o) => { const a = at(J, o.a), b = at(J, o.b); return line(a, b, o.w || 7, COL.pad); },
    rope: (J, o, T) => {
      const a = at(J, o.from), b = o.to; let d = `M${pt(a)}`;
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
  function render(tpl, phase, hl, T) {
    if (tpl.custom) return G.SMCustom[tpl.custom](tpl, phase, hl, T);
    const { spec } = poseAt(tpl, phase);
    const J = solve(spec);
    const layer = lay => (tpl.props || []).filter(o => (o.layer || defaultLayer(o.type)) === lay).map(o => PROPS[o.type] ? PROPS[o.type](J, o, T) : '').join('');
    let s = '';
    // sombra
    const cx = J.front ? J.hip[0] : (J.an1[0] + J.an2[0] + J.hip[0]) / 3;
    s += `<ellipse cx="${f1(cx)}" cy="${FLOOR + 1}" rx="34" ry="3.2" fill="#000" opacity=".35"/>`;
    s += layer('back');
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
    return ({ bench: 'back', box: 'back', wall: 'back', table: 'back', pullbar: 'back', hbar: 'back', tower: 'back', bike: 'back', stairs: 'back', rower: 'back', hurdle: 'back', foam: 'back', bosu: 'back', slant: 'back', sled: 'back', text: 'back', yoke: 'back', cable: 'mid', band: 'mid', rope: 'hand', barbell: 'hand', db: 'hand', kb: 'hand', ball: 'hand', stick: 'hand', landmine: 'hand', handle: 'hand', plate: 'hand', platform: 'back', pad: 'back', roller: 'back', crutch: 'hand', chain: 'hand' })[type] || 'hand';
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

  // ---------------------------------------------------------------- reproductor
  const players = new Set();
  let raf = null, last = 0;
  const reduce = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function frameSVG(tplName, phase, hl, T) {
    const tpl = G.SMTemplates[tplName] || G.SMTemplates.stand;
    return render(tpl, phase, hl, T ?? phase * (tpl.dur || 2.6));
  }
  function fullSVG(tplName, phase, hl, T, mark) {
    const tpl = G.SMTemplates[tplName] || G.SMTemplates.stand;
    const wm = mark ? `<g font-family="Inter,Arial,sans-serif" font-weight="800" font-size="7.5"><text x="-1" y="-3" fill="#ffffff" opacity=".9">STRONG<tspan fill="#bbf426">MED</tspan><tspan fill="#64748b"> × </tspan>Kin <tspan fill="#bbf426">At Home</tspan></text>${mark.title ? `<text x="-1" y="196" fill="#cbd5e1" font-size="7" font-weight="700">${mark.title.replace(/[&<>]/g, '')}</text>` : ''}</g>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" width="420" height="420">${DEFS}${bgFor(tpl)}<g>${frameSVG(tplName, phase, hl, T)}</g>${wm}</svg>`;
  }

  function mount(el, tplName, hl, opts = {}) {
    const tpl = G.SMTemplates[tplName] || G.SMTemplates.stand;
    el.innerHTML = `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Animación del ejercicio">${DEFS}${bgFor(tpl)}<g class="fig"></g></svg>`;
    const g = el.querySelector('.fig');
    const P = { el, g, tpl, hl, off: opts.phase ?? Math.random(), visible: true, speed: opts.speed || 1, clock: 0, paused: false };
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
      P.g.innerHTML = render(P.tpl, ph, P.hl, P.clock);
    }
  }

  G.SMAnim = { mount, unmount, unmountWithin, fullSVG, frameSVG, solve, L, FLOOR, COL, dir, mv, ang, lerp, circ, line, poly, pt, f1, DEFS, BG, VB };
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
    const v = [Ft[0] - Sh[0], Ft[1] - Sh[1]], m = Math.hypot(v[0], v[1]);
    return Object.assign({ x: Sh[0] + v[0] / m * 46, y: Sh[1] + v[1] / m * 46, S: Sh, F1: Ft, F2: [Ft[0] + 2, Ft[1]] }, extra || {});
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
  const BBback = { type: 'barbell', at: J => A.mv(A.mv(J.shc, J.t + 90, 10), J.t + 180, 3), r: 11, layer: 'mid' };
  const DB = [{ type: 'db', at: 'hd2', layer: 'mid', dim: true }, { type: 'db', at: 'hd1' }];
  const DB1 = [{ type: 'db', at: 'hd1' }];
  const DBF = [{ type: 'db', at: 'hd1' }, { type: 'db', at: 'hd2' }];        // vista frontal
  const KB = [{ type: 'kb', at: 'hd1' }];
  const flatBench = { type: 'bench', a: [36, 141], b: [150, 141] };
  const seat = { type: 'bench', a: [60, 128], b: [104, 128], legs: [68, 96] };

  /* ============================== TREN INFERIOR ============================== */
  add('squat', 'Sentadilla con barra trasera', {
    base: S({ t: 178, h1: [-3, -9], h: -4 }), props: [BBback],
    frames: [{}, { x: 79, y: 140, t: 136, h: 12 }]
  });
  add('squat_front', 'Sentadilla frontal', {
    base: S({ t: 178, a1: 102, e1: -112 }), props: [{ type: 'barbell', at: J => A.mv(J.shc, J.t - 90, 9) }],
    frames: [{}, { x: 84, y: 141, t: 156 }]
  });
  add('squat_goblet', 'Sentadilla goblet', {
    base: S({ t: 178, h1: [-12, 11] }), props: [{ type: 'kb', at: 'hd1', up: false }],
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
  add('squat_banded', 'Sentadilla con bandas / cadenas', {
    base: S({ t: 178, h1: [-3, -9], h: -4 }), props: [BBback, { type: 'band', from: J => A.mv(J.shc, J.t + 90, 7), to: [94, 184] }],
    frames: [{}, { x: 79, y: 140, t: 136, h: 12 }]
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
    base: { x: 72, y: 150, t: 222, h: -10, H1: [80, 158], F1: [112, 108], F2: [108, 110], pf: true, f1: 30, f2: 30 },
    props: [{ type: 'pad', a: [34, 104], b: [62, 152], w: 10 }, { type: 'pad', a: [56, 160], b: [96, 160], w: 8 }, { type: 'platform', at: J => A.mv(J.an1, 30, 6), a: 125 }, { type: 'pad', a: [60, 164], b: [40, 184], w: 4 }],
    frames: [{}, { F1: [140, 82], F2: [136, 84] }]
  });
  add('hack', 'Hack squat', {
    base: { x: 100, y: 96, t: 164, F1: [120, 168], F2: [116, 168], h1: [-2, -7], f1: 70 },
    props: [{ type: 'slant', x: 96, w: 50, h: 14 }, { type: 'pad', a: J => A.mv(J.hip, J.t + 90, 9), b: J => A.mv(J.shc, J.t + 90, 9), w: 8 }],
    frames: [{}, { x: 86, y: 132, t: 160 }]
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
    props: [seat, { type: 'pad', a: [62, 126], b: [56, 72], w: 8 }, { type: 'roller', at: J => A.mv(J.an1, J.k1 + 90, 6), r: 5 }, { type: 'pad', a: [96, 112], b: [112, 112], w: 6 }],
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
  add('lunge', 'Zancada', {
    base: S({ a1: 2, e1: 2 }), props: DB,
    frames: [{}, { x: 96, y: 138, F1: [126, AY], F2: [60, 171], f2: 25 }]
  });
  add('lunge_bw', 'Zancada sin carga', {
    base: S({ a1: 4, e1: 8 }),
    frames: [{}, { x: 96, y: 138, F1: [126, AY], F2: [60, 171], f2: 25 }]
  });
  add('lunge_bb', 'Zancada con barra', {
    base: S({ h1: [-3, -9] }), props: [BBback],
    frames: [{}, { x: 96, y: 138, F1: [126, AY], F2: [60, 171], f2: 25 }]
  });
  add('lunge_reverse', 'Zancada trasera', {
    base: S({ x: 110, a1: 2, e1: 2, F1: [114, AY], F2: [110, AY] }), props: DB,
    frames: [{}, { x: 104, y: 138, F1: [126, AY], F2: [64, 171], f2: 25 }]
  });
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
    frames: [{}, { y: 90, F1: [104, 169], F2: [99, 169], f1: 30, f2: 30 }]
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
    base: S({ a1: 2, e1: 2, F2: [99, AY] }), props: DB1,
    frames: [{}, { x: 86, y: 104, t: 96, l2: -96, k2: -96, pf: true, a1: 2, e1: 2 }]
  });
  add('diver', 'The Diver (Askling)', {
    base: S({ a1: 4, e1: 4 }),
    frames: [{}, { x: 86, y: 104, t: 98, l2: -94, k2: -94, a1: 96, e1: 96 }]
  });
  add('deadlift', 'Peso muerto', {
    base: { x: 80, y: 130, t: 124, F1: [104, AY], F2: [99, AY], H1: [106, 171] }, props: [BB],
    frames: [{ d: 1 }, { x: 100, y: 100, t: 180, H1: [104, 112], d: 1.2 }]
  });
  add('deadlift_trap', 'Peso muerto con barra hexagonal', {
    base: { x: 82, y: 132, t: 132, F1: [104, AY], F2: [99, AY], H1: [98, 162] },
    props: [{ type: 'pad', a: J => [J.wr1[0] - 26, J.wr1[1] + 2], b: J => [J.wr1[0] + 24, J.wr1[1] + 2], w: 4, layer: 'hand' }, { type: 'plate', at: J => [J.wr1[0] - 26, J.wr1[1] + 2], r: 13 }, { type: 'plate', at: J => [J.wr1[0] + 24, J.wr1[1] + 2], r: 13 }],
    frames: [{ d: 1 }, { x: 100, y: 100, t: 180, H1: [99, 116], d: 1.2 }]
  });
  add('rackpull', 'Rack pull', {
    base: { x: 82, y: 112, t: 138, F1: [104, AY], F2: [99, AY], H1: [106, 140] },
    props: [{ type: 'pad', a: [116, 152], b: [116, 184], w: 4 }, { type: 'pad', a: [110, 152], b: [124, 152], w: 3 }, BB],
    frames: [{}, { x: 100, y: 100, t: 180, H1: [104, 112] }]
  });
  add('goodmorning', 'Buenos días (good morning)', {
    base: S({ h1: [-3, -9], h: -4 }), props: [BBback],
    frames: [{}, { x: 78, y: 104, t: 98, h: 10 }]
  });
  add('hipthrust', 'Hip thrust con barra', {
    base: { x: 92, y: 160, S: [60, 125], h: -20, F1: [134, AY], F2: [130, AY], H1: [76, 152], pf: true },
    props: [{ type: 'bench', a: [16, 132], b: [64, 132], legs: [24, 56] }, { type: 'barbell', at: 'hipTop' }],
    frames: [{}, { x: 104, y: 126 }]
  });
  add('hipthrust_machine', 'Hip thrust en máquina / suelo con polea', {
    base: { x: 92, y: 160, S: [60, 125], h: -20, F1: [134, AY], F2: [130, AY], H1: [96, 150], pf: true },
    props: [{ type: 'bench', a: [16, 132], b: [64, 132], legs: [24, 56] }, { type: 'pad', a: J => A.mv(J.hipTop, J.t + 180, 12), b: J => A.mv(J.hipTop, J.t, 12), w: 6, layer: 'hand' }],
    frames: [{}, { x: 104, y: 126 }]
  });
  add('bridge', 'Puente de glúteo', {
    base: { x: 90, y: 175, S: [46, 177], h: -10, F1: [124, AY], F2: [120, AY], a1: 80, e1: 80, pf: true },
    frames: [{}, { x: 96, y: 146 }]
  });
  add('bridge_iso', 'Puente de glúteo isométrico', {
    base: { x: 96, y: 146, S: [46, 177], h: -10, F1: [124, AY], F2: [120, AY], a1: 80, e1: 80, pf: true },
    frames: [{}, { y: 147 }], pulse: true, dur: 2
  });
  add('bridge_single', 'Puente de glúteo a una pierna', {
    base: { x: 90, y: 175, S: [46, 177], h: -10, F1: [124, AY], F2: [120, AY], a1: 80, e1: 80, pf: true },
    frames: [{ l2: 150, k2: 150 }, { x: 96, y: 146, l2: 120, k2: 120 }]
  });
  add('kickback_glute', 'Patada de glúteo en polea', {
    base: S({ t: 166, H1: [128, 82], F1: [104, AY] }),
    props: [{ type: 'tower', x: 136, top: 50, pulleys: [176] }, { type: 'cable', from: [136, 176], to: 'an2', dim: true }],
    frames: [{ l2: 4, k2: -10 }, { l2: -44, k2: -40 }]
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
  add('abduction_machine', 'Abducción en máquina', {
    base: { view: 'front', x: 100, y: 126, t: 180, l1: 24, k1: 0, ts1: 0.38, ss1: 1, F1: undefined, pf: false, a1: 30, e1: 10, H1: [126, 130] },
    props: [{ type: 'box', x: 70, y: 128, w: 60 }],
    frames: [{ l1: 18 }, { l1: 70 }]
  });
  add('adduction_machine', 'Aducción en máquina', {
    base: { view: 'front', x: 100, y: 126, t: 180, l1: 70, k1: 0, ts1: 0.38, pf: false, H1: [126, 130] },
    props: [{ type: 'box', x: 70, y: 128, w: 60 }],
    frames: [{ l1: 70 }, { l1: 16 }]
  });
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
    base: { view: 'front', x: 100, y: 168, t: -90, l1: 90, k1: 90, l2: 92, k2: 92, a1: 0, e1: 0, h: 0, H2: [70, 182], pf: false },
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
    base: S({ a1: 4, e1: 8 }),
    frames: [{ l1: 0, k1: 0 }, { l1: 96, k1: 0 }, { l1: 0, k1: 0, l2: 0, k2: 0 }, { l2: 96, k2: 0 }], dur: 2.4
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
    base: { x: 104, y: 175, t: -90, pf: false, l1: 120, k1: 120, F2: [136, AY], h1: [-40, -8] },
    props: [{ type: 'band', from: 'to1', to: 'hd1' }],
    frames: [{ f1: 70 }, { l1: 150, k1: 150, f1: 120 }]
  });
  add('heel_slide', 'Deslizamiento de talón', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 92, k1: 92, l2: 92, k2: 92, a1: 92, e1: 92 },
    props: [{ type: 'roller', at: J => [J.an1[0] + 4, 182], r: 3 }],
    frames: [{}, { F1: [138, 178], pf: true }]
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
    frames: [{ F2: [100, AY] }, { x: 92, y: 118, t: 158, F2: [150, 180], pf: true }, { F2: [100, AY], x: 100, y: 104, t: 180 }, { x: 110, y: 118, t: 132, F2: [46, 180] }], dur: 4
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
    base: Object.assign({}, benchBody, { H1: [78, 124] }), props: [flatBench, ...DB],
    frames: [{}, { H1: [74, 85] }]
  });
  add('bench_incline', 'Press inclinado', {
    base: { x: 116, y: 140, S: [80, 110], h: 6, F1: [154, AY], F2: [150, AY], H1: [86, 106] },
    props: [{ type: 'bench', a: [104, 146], b: [138, 146], legs: [112, 132], back: [[106, 146], [66, 112]] }, BB],
    frames: [{}, { H1: [96, 66] }]
  });
  add('bench_incline_db', 'Press inclinado con mancuernas', {
    base: { x: 116, y: 140, S: [80, 110], h: 6, F1: [154, AY], F2: [150, AY], H1: [88, 104] },
    props: [{ type: 'bench', a: [104, 146], b: [138, 146], legs: [112, 132], back: [[106, 146], [66, 112]] }, ...DB],
    frames: [{}, { H1: [96, 66] }]
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
    base: Object.assign({}, benchBody, { a1: 182, e1: 182, us1: 1, fs1: 1 }), props: [flatBench, ...DB],
    frames: [{ us1: 0.3, fs1: 0.3, e1: 150 }, { us1: 1, fs1: 1, e1: 182 }]
  });
  add('pullover', 'Pullover', {
    base: Object.assign({}, benchBody, { y: 133, a1: -96, e1: -96 }), props: [flatBench, { type: 'db', at: 'hd1', k: 1.3 }],
    frames: [{}, { a1: 178, e1: 178 }]
  });
  add('fly_front', 'Aperturas / cruces (vista frontal)', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [114, AY], H1: [154, 70] },
    frames: [{}, { H1: [104, 82] }]
  });
  add('cable_fly_high', 'Cruces en polea alta', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [114, AY], H1: [150, 58] },
    props: [{ type: 'tower', x: 188, top: 6, pulleys: [16] }, { type: 'tower', x: 12, top: 6, pulleys: [16] }, { type: 'cable', from: [188, 16], to: 'hd1' }, { type: 'cable', from: [12, 16], to: 'hd2' }],
    frames: [{}, { H1: [106, 104] }]
  });
  add('cable_fly_mid', 'Cruces en polea media', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [114, AY], H1: [154, 74] },
    props: [{ type: 'tower', x: 188, top: 6, pulleys: [72] }, { type: 'tower', x: 12, top: 6, pulleys: [72] }, { type: 'cable', from: [188, 72], to: 'hd1' }, { type: 'cable', from: [12, 72], to: 'hd2' }],
    frames: [{}, { H1: [104, 80] }]
  });
  add('cable_fly_low', 'Cruces en polea baja', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [114, AY], H1: [150, 106] },
    props: [{ type: 'tower', x: 188, top: 6, pulleys: [176] }, { type: 'tower', x: 12, top: 6, pulleys: [176] }, { type: 'cable', from: [188, 176], to: 'hd1' }, { type: 'cable', from: [12, 176], to: 'hd2' }],
    frames: [{}, { H1: [106, 60] }]
  });
  add('pecdeck', 'Contractora (pec deck)', {
    base: { view: 'front', x: 100, y: 124, t: 180, l1: 20, k1: 0, ts1: 0.4, pf: false, a1: 92, e1: 182 },
    props: [{ type: 'box', x: 74, y: 128, w: 52 }, { type: 'pad', a: J => J.el1, b: J => J.wr1, w: 6, layer: 'hand' }, { type: 'pad', a: J => J.el2, b: J => J.wr2, w: 6, layer: 'hand' }],
    frames: [{}, { us1: 0.28 }]
  });
  add('pushup', 'Flexión de brazos', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], e1s: 1, h: -6 }),
    frames: [{}, plank([134, 160], [12, 179], { h: -6 })]
  });
  add('pushup_knee', 'Flexión de brazos de rodillas', {
    base: kneePlank([132, 131], [58, 178], { H1: [134, 182], e1s: 1, h: -6 }),
    frames: [{}, kneePlank([136, 158], [58, 178], { h: -6 })]
  });
  add('pushup_incline', 'Flexión inclinada (manos elevadas)', {
    base: plank([132, 100], [26, 179], { H1: [138, 142], e1s: 1, h: -6 }),
    props: [{ type: 'box', x: 120, y: 144, w: 40 }],
    frames: [{}, plank([134, 124], [26, 179], { h: -6 })]
  });
  add('pushup_decline', 'Flexión declinada (pies elevados)', {
    base: plank([132, 132], [28, 138], { H1: [134, 182], e1s: 1, h: -6, pf: false }),
    props: [{ type: 'box', x: 8, y: 144, w: 34 }],
    frames: [{}, plank([134, 160], [28, 138], { h: -6, pf: false })]
  });
  add('pushup_scap', 'Flexiones escapulares', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], e1s: 1, h: -6 }),
    frames: [{ y: 0 }, plank([132, 125], [12, 179], { h: -6 })].map((f, i) => i ? f : {}), pulse: true, dur: 1.8
  });
  add('planche', 'Planche lean / progresiones', {
    base: plank([132, 131], [12, 179], { H1: [134, 182], e1s: 1, h: -6 }),
    frames: [{}, plank([148, 136], [26, 179], { h: -6 })]
  });
  add('dips', 'Fondos en paralelas', {
    base: { x: 100, y: 102, t: 176, H1: [106, 104], pf: false, l1: 20, k1: -50 },
    props: [{ type: 'pad', a: [94, 106], b: [126, 106], w: 4 }, { type: 'pad', a: [122, 106], b: [122, 184], w: 3 }],
    frames: [{}, { x: 94, y: 130, t: 162 }]
  });
  add('dips_bench', 'Fondos en banco', {
    base: { x: 68, y: 124, t: 178, H1: [62, 134], e1s: 1, F1: [140, AY], F2: [136, AY], pf: true, f1: 50 },
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
    props: [{ type: 'landmine', pivot: [14, 182] }],
    frames: [{}, { h1: [36, 34], t: 168 }]
  });
  add('landmine_press_kneel', 'Press en Landmine en caballero', {
    base: { x: 92, y: 136, t: 178, pf: false, l2: 4, k2: -90, f2: 0, F1: [124, AY], h1: [-2, 12] },
    props: [{ type: 'landmine', pivot: [14, 182] }],
    frames: [{}, { h1: [36, 30], t: 172 }]
  });
  add('landmine_chest', 'Press de pecho en Landmine', {
    base: { x: 96, y: 102, t: 170, F1: [118, AY], F2: [80, AY], h1: [-14, 12] },
    props: [{ type: 'landmine', pivot: [10, 182] }],
    frames: [{}, { h1: [12, 46], t: 164 }]
  });
  add('lateral', 'Elevaciones laterales', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: 10, e1: 14 },
    props: DBF, frames: [{}, { a1: 86, e1: 92 }]
  });
  add('lateral_cable', 'Elevación lateral en polea', {
    base: { view: 'front', x: 96, y: 99, t: 180, F1: [108, AY], a1: -10, e1: -6, a2: -10, e2: -10, H2: [70, 104] },
    props: [{ type: 'tower', x: 40, top: 40, pulleys: [176] }, { type: 'cable', from: [40, 176], to: 'hd1' }],
    frames: [{}, { a1: 84, e1: 90 }]
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
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [112, AY], a1: -18, e1: -12 },
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
    props: [{ type: 'tower', x: 176, top: 6, pulleys: [44] }, { type: 'cable', from: [176, 44], to: 'hd1' }],
    frames: [{}, { H1: [116, 40], e1s: 1 }]
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
    props: [{ type: 'bench', a: [56, 128], b: [96, 128], legs: [64, 90] }, { type: 'pad', a: [112, 74], b: [112, 108], w: 8 }],
    frames: [{}, { H1: [100, 100] }]
  });
  add('row_tbar', 'Remo en barra T / Landmine', {
    base: { x: 82, y: 108, t: 120, F1: [106, AY], F2: [101, AY], H1: [116, 150] },
    props: [{ type: 'landmine', pivot: [196, 182] }],
    frames: [{}, { H1: [104, 120] }]
  });
  add('row_inverted', 'Remo invertido', {
    base: plank([66, 166], [192, 179], { H1: [68, 118], e1s: 1, h: 8 }),
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
    frames: [{}, { H1: [100, 92] }]
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
    base: { x: 98, y: 152, t: 182, pf: false, l1: 90, k1: -10, H1: [104, 56] },
    props: [{ type: 'pullbar', x: 104, y: 54 }],
    frames: [{ d: 1 }, { y: 114, t: 196, d: .8 }, { x: 104, y: 80, t: 170, e1s: 1, l1: 40, k1: -20, d: .6 }, { x: 102, y: 54, t: 176, l1: 10, k1: -10, d: 1 }], dur: 3.2
  });
  add('front_lever', 'Front lever', {
    base: { x: 108, y: 70, t: -92, h: 8, pf: false, l1: 92, k1: 92, H1: [56, 22] },
    props: [{ type: 'pullbar', x: 56, y: 20 }],
    frames: [{}, { x: 104, y: 52, t: -96 }], pulse: true
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
    base: S({ a1: -6, e1: 150 }),
    props: [{ type: 'tower', x: 132, top: 6, pulleys: [14] }, { type: 'cable', from: [132, 14], to: 'hd1' }],
    frames: [{}, { e1: 6 }]
  });
  add('oh_ext', 'Extensión de tríceps sobre la cabeza', {
    base: S({ a1: 172, e1: -18 }), props: [{ type: 'db', at: 'hd1', k: 1.2 }],
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
    base: { x: 100, y: 175, t: -90, h: -4, F1: [134, AY], l2: 90, k2: 90, pf: true, H1: [100, 182] },
    frames: [{}, { t: -104, h: -6 }], pulse: true
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
    base: { x: 100, y: 112, t: 180, pf: false, l1: 2, k1: 2, a1: 20, e1: 92 },
    props: [{ type: 'pad', a: [90, 84], b: [112, 84], w: 6 }, { type: 'pad', a: [80, 60], b: [80, 184], w: 6 }],
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
    frames: [{}, plank([118, 156], [-2, 179], { h: -6 })]
  });
  add('side_plank', 'Plancha lateral', {
    base: { view: 'front', x: 108, y: 157, t: -112, pf: false, l1: 68, k1: 68, l2: 68, k2: 68, a2: 0, e2: -90, fs2: 0.6, a1: 158, e1: 158 },
    frames: [{ y: 160, t: -110 }, { y: 152, t: -114 }], pulse: true
  });
  add('deadbug', 'Dead bug', {
    base: { x: 104, y: 175, t: -90, pf: false, l1: 180, k1: 92, l2: 180, k2: 92, a1: 180, e1: 180 },
    frames: [{}, { a1: -100, e1: -100, l2: 100, k2: 100 }, {}, { a2: -100, e2: -100, l1: 100, k1: 100 }], dur: 3.6
  });
  add('birddog', 'Bird dog', {
    base: { x: 72, y: 136, t: 92, pf: false, l1: 0, k1: -90, f1: 0, a1: 0, e1: 0, h: -6 },
    frames: [{}, { a1: 94, e1: 94, l2: -94, k2: -94 }, {}, { a2: 94, e2: 94, l1: -94, k1: -94 }], dur: 3.6
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
    base: { view: 'front', x: 100, y: 164, t: 180, l1: 34, k1: -8, ts1: 0.45, ss1: 0.5, pf: false, a1: 20, e1: 0, a2: 20, e2: -20 },
    props: [{ type: 'ball', at: J => [(J.hd1[0] + J.hd2[0]) / 2, (J.hd1[1] + J.hd2[1]) / 2], r: 8 }],
    frames: [{ a1: 40, e1: 20, a2: 40, e2: 10, t: 176 }, { a1: -40, e1: -10, a2: -40, e2: -20, t: 184 }]
  });
  add('landmine_twist', 'Landmine twist / rainbows', {
    base: { view: 'front', x: 100, y: 99, t: 180, F1: [124, AY], F2: [76, AY], a1: 150, e1: 150, a2: 150, e2: 150 },
    props: [{ type: 'landmine', pivot: [100, 184], at: J => [(J.hd1[0] + J.hd2[0]) / 2, (J.hd1[1] + J.hd2[1]) / 2] }],
    frames: [{ a1: 140, e1: 140, a2: 140, e2: 140 }, { a1: -140, e1: -140, a2: -140, e2: -140 }]
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
    base: { x: 96, y: 176, t: 90, h: -10, pf: false, l1: -90, k1: -90, a1: 90, e1: 90 },
    frames: [{}, { t: 74, l1: -76, k1: -76, a1: 104, e1: 104 }]
  });
  add('hyper', 'Hiperextensión a 45°', {
    base: { x: 110, y: 118, t: 34, pf: true, F1: [60, 176], F2: [56, 176], f1: 50, h1: [-8, 10] },
    props: [{ type: 'pad', a: [112, 126], b: [126, 112], w: 9 }, { type: 'pad', a: [116, 126], b: [96, 184], w: 4 }, { type: 'pad', a: [50, 180], b: [70, 176], w: 4 }],
    frames: [{}, { t: 138 }]
  });
  add('reverse_hyper', 'Reverse hyper', {
    base: { x: 84, y: 112, t: 92, h: -6, pf: false, l1: 2, k1: 2, H1: [148, 122] },
    props: [{ type: 'bench', a: [86, 121], b: [156, 121] }],
    frames: [{}, { l1: -84, k1: -84 }]
  });
  add('jefferson', 'Jefferson curl', {
    base: { x: 100, y: 64, t: 180, F1: [104, 143], F2: [99, 143], a1: 2, e1: 2 },
    props: [{ type: 'box', x: 78, y: 148, w: 46 }, ...DB],
    frames: [{}, { x: 90, y: 68, t: 16, h: 30 }], dur: 3.6
  });
  add('mckenzie', 'Extensión en prono (McKenzie)', {
    base: { x: 90, y: 176, t: 90, h: -8, pf: false, l1: -90, k1: -90, H1: [130, 182], e1s: 1 },
    frames: [{}, { t: 134, h: 0 }]
  });
  add('cobra_stretch', 'Estiramiento en prono / cobra', {
    base: { x: 90, y: 176, t: 90, h: -8, pf: false, l1: -90, k1: -90, a1: 0, e1: 92 },
    frames: [{}, { t: 116, h: 0 }]
  });
  add('thoracic_roller', 'Extensión torácica sobre foam roller', {
    base: { x: 104, y: 174, t: -96, h: 0, F1: [136, AY], F2: [132, AY], pf: true, h1: [10, -4] },
    props: [{ type: 'roller', at: [70, 174], r: 8 }],
    frames: [{ t: -104 }, { t: -80, h: 10 }]
  });
  add('open_book', 'Libro abierto (open book)', {
    base: { x: 104, y: 168, t: -90, pf: false, l1: 150, k1: 60, l2: 152, k2: 62, a2: 0, e2: 60, a1: 100, e1: 100 },
    frames: [{}, { a1: -100, e1: -100, t: -84 }], dur: 3.2
  });
  add('foam_quad', 'Liberación miofascial con foam roller', {
    base: { x: 100, y: 166, t: 96, h: -6, pf: false, l1: -94, k1: -94, a1: 4, e1: 92 },
    props: [{ type: 'roller', at: [74, 176], r: 7 }],
    frames: [{ x: 110 }, { x: 90 }]
  });
  add('getup', 'Turkish get-up', {
    base: { x: 104, y: 174, t: -90, pf: false, F1: [134, AY], l2: 92, k2: 92, a1: 182, e1: 182, a2: -140, e2: -140 },
    props: [{ type: 'kb', at: 'hd1', up: true }],
    frames: [{ d: 1 }, { t: -140, H2: [62, 182], d: 1 }, { x: 98, y: 137, t: 182, pf: false, l2: 4, k2: -90, f2: 0, F1: [128, AY], a1: 182, e1: 182, d: 1 }, { x: 100, y: 100, t: 180, F1: [104, AY], F2: [99, AY], pf: true, d: 1.2 }], dur: 5
  });

  /* ============================== POTENCIA / OLÍMPICOS ============================== */
  add('clean', 'Cargada (clean)', {
    base: { x: 80, y: 130, t: 124, F1: [104, AY], F2: [99, AY], H1: [106, 171] }, props: [BB],
    frames: [{ d: 1 }, { x: 102, y: 96, t: 186, F1: [104, 174], F2: [99, 174], f1: 40, f2: 40, H1: [108, 106], d: .5 }, { x: 88, y: 122, t: 164, F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, a1: 102, e1: -112, d: .5 }, { x: 100, y: 100, t: 178, d: 1 }], dur: 2.6
  });
  add('snatch', 'Arrancada (snatch)', {
    base: { x: 80, y: 128, t: 120, F1: [104, AY], F2: [99, AY], H1: [104, 171] }, props: [BB],
    frames: [{ d: 1 }, { x: 102, y: 96, t: 186, F1: [104, 174], F2: [99, 174], f1: 40, f2: 40, H1: [110, 102], d: .5 }, { x: 88, y: 128, t: 166, F1: [104, AY], F2: [99, AY], f1: 78, f2: 78, a1: 174, e1: 176, d: .5 }, { x: 100, y: 100, t: 180, a1: 176, e1: 178, d: 1 }], dur: 2.8
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
    props: [{ type: 'landmine', pivot: [12, 182] }],
    frames: [{ d: 1 }, { x: 96, y: 104, t: 176, h1: [-2, 12], d: .8 }, { h1: [38, 32], d: 1 }], dur: 2.8
  });
  add('punch_rot', 'Golpe rotacional / lanzamiento', {
    base: { x: 96, y: 104, t: 176, F1: [126, AY], F2: [72, 174], f2: 30, h1: [-6, 6] },
    props: [{ type: 'landmine', pivot: [10, 182] }],
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
    base: { view: 'front', x: 60, y: 112, t: 174, F1: [64, AY], l2: -30, k2: 40, a1: 60, e1: 40 },
    frames: [{ d: 1 }, { x: 100, y: 80, t: 180, F1: [110, 160], F2: [90, 160], d: .5 }, { x: 140, y: 112, t: 186, F2: [136, AY], l1: 30, k1: -40, d: 1 }, { x: 100, y: 80, t: 180, F1: [110, 160], F2: [90, 160], d: .5 }], dur: 2.4
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
  const crank = [124, 150];
  const pedal = (k, n) => { const a = k / n * 360; const c = [crank[0] + Math.sin(a * Math.PI / 180) * 15, crank[1] + Math.cos(a * Math.PI / 180) * 15]; const c2 = [crank[0] - Math.sin(a * Math.PI / 180) * 15, crank[1] - Math.cos(a * Math.PI / 180) * 15]; return { F1: c, F2: c2 }; };
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
    base: { x: 104, y: 166, t: -90, pf: false, l1: 120, k1: 60, l2: 122, k2: 62, a1: 180, e1: 180, us1: 0.2, a2: 120, e2: 160 },
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
    const t = o.t ?? 172, y = o.y ?? 100;
    const arms = (s) => o.push ? { H1: o.H1, H2: [o.H1[0] - 3, o.H1[1] + 2] } : { a1: 40 * s, e1: 40 * s + 80, a2: -40 * s, e2: -40 * s + 80 };
    return [
      Object.assign({ t, y: y + 2, F1: [106, AY], F2: [70 - 10 * k, 150], f1: 78, f2: 60 }, arms(1)),
      Object.assign({ t, y: y - 8 * k, F1: [82 - 8 * k, 168 - 6 * k], F2: [120 + 8 * k, 156], f1: 40, f2: 80 }, arms(0.2)),
      Object.assign({ t, y: y + 2, F2: [106, AY], F1: [70 - 10 * k, 150], f2: 78, f1: 60 }, arms(-1)),
      Object.assign({ t, y: y - 8 * k, F2: [82 - 8 * k, 168 - 6 * k], F1: [120 + 8 * k, 156], f2: 40, f1: 80 }, arms(-0.2))
    ];
  }

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
