// Datos de Salud de iPhone que envía el Atajo de Apple de cada persona (pasos, pulso, presión, saturación).
// POST {accion:'codigo'} con sesión de persona → entrega (o reutiliza) su código personal para el Atajo.
// POST {codigo, pasos, fc, fcr, sis, dia, spo2} sin sesión → guarda en salud/{rut}; la app lo lee al abrir.
// © 2026 StrongMed × Kin At Home by Klgo. David Ponce · Todos los derechos reservados
const crypto = require('crypto');
const { fb, db, cors, limite, ipDe, cuerpo, quien } = require('./_base');

const hoyCL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Los Atajos envían números con coma decimal o con texto ("72 lpm"): se toma el primer número.
const num = (v, min, max) => { const m = /-?\d+(?:[.,]\d+)?/.exec(String(v ?? '')); if (!m) return null; const n = parseFloat(m[0].replace(',', '.')); return n >= min && n <= max ? n : null; };

module.exports = async (req, res) => {
  if (!cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();
  if (!fb()) return res.status(503).json({ ok: false, error: 'no configurado' });
  if (!limite('salud-ip:' + ipDe(req), 120)) return res.status(429).json({ ok: false });
  const b = cuerpo(req);
  try {
    if (b.accion === 'codigo') {
      const yo = await quien(req); if (!yo || yo.tipo !== 'pat') return res.status(401).json({ ok: false });
      const ref = db().doc('salud/' + yo.rut), s = await ref.get();
      // el código se guarda solo como huella; si se pide de nuevo se genera otro y el anterior deja de servir
      const codigo = crypto.randomBytes(9).toString('base64url');
      const h = crypto.createHash('sha256').update(codigo).digest('hex');
      if (s.exists && s.data().codigoH) await db().doc('saludCodigos/' + s.data().codigoH).delete().catch(() => { });
      await db().doc('saludCodigos/' + h).set({ rut: yo.rut, ts: Date.now() });
      await ref.set({ codigoH: h, rut: yo.rut }, { merge: true });
      return res.status(200).json({ ok: true, codigo });
    }
    const codigo = String(b.codigo || '').trim(); if (!/^[\w-]{10,40}$/.test(codigo)) return res.status(400).json({ ok: false, error: 'código inválido' });
    if (!limite('salud-cod:' + codigo, 30)) return res.status(429).json({ ok: false });
    const c = await db().doc('saludCodigos/' + crypto.createHash('sha256').update(codigo).digest('hex')).get();
    if (!c.exists) return res.status(401).json({ ok: false, error: 'código no válido: vuelve a copiarlo desde StrongMed' });
    const rut = c.data().rut, ts = Date.now(), d = {}, f = hoyCL();
    const pasos = num(b.pasos, 0, 150000); if (pasos != null) d['pasos.' + f] = Math.round(pasos);
    const fc = num(b.fc, 25, 250); if (fc != null) d.fc = { v: Math.round(fc), ts, src: 'Salud iPhone' };
    const fcr = num(b.fcr, 25, 200); if (fcr != null) d.fcr = { v: Math.round(fcr), ts, src: 'Salud iPhone' };
    const sis = num(b.sis, 50, 260), dia = num(b.dia, 30, 160); if (sis != null && dia != null) d.pa = { sis: Math.round(sis), dia: Math.round(dia), ts, src: 'Salud iPhone' };
    let spo2 = num(b.spo2, 0.5, 100); if (spo2 != null) { if (spo2 <= 1) spo2 *= 100; if (spo2 >= 50) d.spo2 = { v: Math.round(spo2 * 10) / 10, ts, src: 'Salud iPhone' }; }
    if (!Object.keys(d).length) return res.status(400).json({ ok: false, error: 'sin datos' });
    d.recibido = ts;
    await db().doc('salud/' + rut).update(d);
    return res.status(200).json({ ok: true, mensaje: 'Datos enviados a StrongMed' });
  } catch (e) { console.error(e); return res.status(500).json({ ok: false }); }
};
