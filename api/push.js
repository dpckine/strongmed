// Notificaciones al teléfono con la app cerrada (Web Push). Solo acepta llamadas con sesión de Firebase verificada.
// GET  /api/push            → clave pública para suscribirse
// POST /api/push {accion}   → sub | quitar | enviar | rec | recQuitar
// © 2026 StrongMed × Kin At Home by Klgo. David Ponce · Todos los derechos reservados
const { admin, fb, db, cors, limite, ipDe, cuerpo, quien, claves, enviar, idSub } = require('./_base');

const txt = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const rutOk = r => /^[0-9k]{2,12}$/.test(String(r || ''));
const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
const TABS = ['hoy', 'agenda', 'plan', 'chat', 'progreso', 'ficha', 'inicio', 'personas', 'mensajes'];

module.exports = async (req, res) => {
  if (!cors(req, res, 'GET, POST')) return;
  if (!fb()) return res.status(503).json({ ok: false, error: 'notificaciones no configuradas' });
  if (!limite('ip:' + ipDe(req), 600)) return res.status(429).json({ ok: false });
  try {
    if (req.method === 'GET') { const k = await claves(); res.setHeader('Cache-Control', 'public, max-age=3600'); return res.status(200).json({ ok: true, publicKey: k.publicKey }); }
    if (req.method !== 'POST') return res.status(405).end();
    const yo = await quien(req); if (!yo) return res.status(401).json({ ok: false });
    const b = cuerpo(req);

    if (b.accion === 'sub' && b.fcm) {   // token de la app Android
      const tk = String(b.fcm); if (!/^[\w:\-]{20,400}$/.test(tk)) return res.status(400).json({ ok: false });
      await db().doc('push/' + yo.clave).set({ subs: { [idSub(tk)]: { fcm: tk, ts: Date.now(), ua: 'android-app' } }, tipo: yo.tipo }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (b.accion === 'sub') {
      const s = b.sub || {}, k = s.keys || {};
      if (!/^https:\/\/[^\s]{10,800}$/.test(s.endpoint || '') || !k.p256dh || !k.auth || String(k.p256dh).length > 200 || String(k.auth).length > 100) return res.status(400).json({ ok: false });
      await db().doc('push/' + yo.clave).set({ subs: { [idSub(s.endpoint)]: { endpoint: s.endpoint, keys: { p256dh: String(k.p256dh), auth: String(k.auth) }, ts: Date.now(), ua: txt(req.headers['user-agent'], 120) } }, tipo: yo.tipo }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (b.accion === 'quitar') {
      if (b.endpoint && String(b.endpoint).length < 900) await db().doc('push/' + yo.clave).update({ ['subs.' + idSub(String(b.endpoint))]: admin.firestore.FieldValue.delete() }).catch(() => { });
      return res.status(200).json({ ok: true });
    }
    if (b.accion === 'enviar') {
      const a = b.a || {}; let dest = null;
      if (a.pro) dest = 'pro_' + txt(a.pro, 60).replace(/[^\w-]/g, '');
      else if (a.rut && rutOk(a.rut)) dest = 'pat_' + a.rut;
      if (!dest) return res.status(400).json({ ok: false });
      if (yo.tipo === 'pat' && !dest.startsWith('pro_')) return res.status(403).json({ ok: false });   // una persona solo avisa a profesionales
      if (dest === yo.clave) return res.status(200).json({ ok: true, n: 0 });
      if (!limite('env:' + yo.clave, yo.tipo === 'pro' ? 400 : 60)) return res.status(429).json({ ok: false });
      const n = await enviar(dest, { title: txt(b.title, 80), body: txt(b.body, 180), tab: TABS.includes(b.tab) ? b.tab : 'hoy', tag: txt(b.tag, 60) });
      return res.status(200).json({ ok: true, n });
    }
    if (b.accion === 'rec' || b.accion === 'recQuitar') {
      if (yo.tipo !== 'pro') return res.status(403).json({ ok: false });
      const id = txt(b.citaId, 60).replace(/[^\w-]/g, ''); if (!id) return res.status(400).json({ ok: false });
      const ref = db().doc('recordatorios/' + id);
      if (b.accion === 'recQuitar') { await ref.delete().catch(() => { }); return res.status(200).json({ ok: true }); }
      if (!rutOk(b.rut) || !fechaOk(b.fecha)) return res.status(400).json({ ok: false });
      await ref.set({ dest: 'pat_' + b.rut, fecha: b.fecha, hora: txt(b.hora, 5), texto: txt(b.texto, 160), proId: yo.id, enviado: false, ts: Date.now() });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false });
  } catch (e) { console.error(e); return res.status(500).json({ ok: false }); }
};
