// Recordatorio del día anterior: Vercel lo ejecuta una vez al día (vercel.json → crons) y avisa las sesiones de mañana.
// Si existe CRON_SECRET en Vercel, Vercel firma la llamada con ella. Cada recordatorio se envía una sola vez.
// © 2026 StrongMed × Kin At Home by Klgo. David Ponce · Todos los derechos reservados
const { fb, db, enviar } = require('./_base');

const manana = () => { const d = new Date(Date.now() + 864e5); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };

module.exports = async (req, res) => {
  const s = process.env.CRON_SECRET;
  // con CRON_SECRET se exige la firma; sin ella, solo el cron de Vercel (repetir la llamada no reenvía nada)
  if (s ? req.headers.authorization !== `Bearer ${s}` : !/^vercel-cron\//.test(req.headers['user-agent'] || '')) return res.status(401).json({ ok: false });
  if (!fb()) return res.status(503).json({ ok: false, error: 'notificaciones no configuradas' });
  const f = manana(); let n = 0, total = 0;
  try {
    const q = await db().collection('recordatorios').where('fecha', '==', f).where('enviado', '==', false).get();
    for (const d of q.docs) {
      const r = d.data(); total++;
      try { n += await enviar(r.dest, { title: 'Recordatorio: tu sesión es mañana', body: r.texto || `Mañana a las ${r.hora}`, tab: 'agenda', tag: 'rec-' + d.id }); } catch (e) { console.warn(e.message); }
      await d.ref.update({ enviado: true, enviadoTs: Date.now() }).catch(() => { });
    }
    // limpieza: recordatorios de hace más de 7 días
    const viejo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const old = await db().collection('recordatorios').where('fecha', '<', viejo).limit(200).get();
    await Promise.all(old.docs.map(d => d.ref.delete().catch(() => { })));
    return res.status(200).json({ ok: true, fecha: f, recordatorios: total, avisos: n });
  } catch (e) { console.error(e); return res.status(500).json({ ok: false }); }
};
