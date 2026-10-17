// Envía comprobantes de agenda por correo (Gmail). Variables en Vercel: GMAIL_USER, GMAIL_PASS (contraseña de aplicación).
// © 2026 StrongMed × Kin At Home by Klgo. David Ponce · Todos los derechos reservados
const nodemailer = require('nodemailer');
const ORIGENES = ['https://strongmed.vercel.app', 'https://dpckine.github.io'];
const APP = 'https://strongmed.vercel.app';
const hits = new Map();
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = {
  pre:    ['Recibimos tu solicitud de hora', 'Por confirmar', '#f5a524', 'Tu solicitud quedó registrada. Te avisaremos por correo y en la app cuando tu hora esté confirmada.'],
  conf:   ['¡Tu hora está confirmada!', 'Confirmada', '#22c55e', 'Te esperamos. Si necesitas cambiarla, avísanos con anticipación desde la app.'],
  cambio: ['Tu sesión fue reprogramada', 'Reprogramada', '#5aa2ff', 'Estos son los nuevos datos de tu sesión.'],
  cancel: ['Tu sesión fue cancelada', 'Cancelada', '#ef4444', 'Si quieres reagendar, escríbenos por la app o agenda una nueva hora.']
};
const pad = n => String(n).padStart(2, '0');
function rango(fi, h, dur) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fi || ''), t = /^(\d{1,2}):(\d{2})/.exec(h || ''); if (!m || !t) return null;
  const a = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2])), b = new Date(a.getTime() + (Math.min(600, +dur || 60)) * 60000);
  const f = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`; return [f(a), f(b)]; }
function ics(b, r) { const L = s => String(s || '').replace(/[,;\\]/g, m => '\\' + m).replace(/\n/g, ' ');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StrongMed//Agenda//ES', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${L(b.codigo)}-${r[0]}@strongmed`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=America/Santiago:${r[0]}`, `DTEND;TZID=America/Santiago:${r[1]}`, `SUMMARY:${L((b.sesion || 'Sesión') + ' · ' + (b.pro || 'StrongMed'))}`, `LOCATION:${L(b.direccion || b.lugar)}`, `DESCRIPTION:${L('Código ' + b.codigo + ' · ' + APP)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'); }
function html(b, t, r) {
  const fila = (k, v) => v ? `<tr><td style="padding:7px 0;color:#6b7280;font-size:14px;width:38%">${k}</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:#111">${e(v)}</td></tr>` : '';
  const gcal = r && b.tipo !== 'cancel' ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent((b.sesion || 'Sesión') + ' · ' + (b.pro || 'StrongMed'))}&dates=${r[0]}/${r[1]}&ctz=America/Santiago&location=${encodeURIComponent(b.direccion || b.lugar || '')}` : '';
  const acceso = b.usuario ? `<div style="margin-top:18px;padding:16px;border-radius:12px;background:#f4f7e8;border:1px solid #dfe8b8"><div style="font-size:12px;font-weight:800;letter-spacing:.06em;color:#4d5b12;text-transform:uppercase">Tu acceso a la app</div>
    <table style="width:100%;border-collapse:collapse;margin-top:6px">${fila('Usuario (RUT)', b.usuario)}${fila('Clave', b.clave)}</table>
    <div style="font-size:12px;color:#6b7280;margin-top:4px">Con este acceso ves tu agenda, tu plan y conversas con tu profesional. Puedes cambiar tu clave en tu perfil.</div></div>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px 14px"><div style="background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#0b0b0c;padding:18px 22px;color:#fff;font-weight:900;letter-spacing:.04em">STRONG<span style="color:#c8f53a">MED</span>${/kah/.test(b.marca || '') ? ' <span style="font-weight:600;color:#9ca3af">× Kin At Home</span>' : ''}</div>
  <div style="padding:22px"><span style="display:inline-block;padding:4px 10px;border-radius:99px;background:${t[2]}22;color:${t[2]};font-size:12px;font-weight:800">${t[1]}</span>
  <h1 style="margin:12px 0 6px;font-size:22px;color:#111">${t[0]}</h1><p style="margin:0;color:#4b5563;font-size:14px;line-height:1.5">Hola ${e(String(b.nombre || '').split(' ')[0])}. ${t[3]}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px;border-top:1px dashed #d1d5db">${fila('Servicio', b.sesion)}${fila('Profesional', b.pro)}${fila('Fecha', b.fecha)}${fila('Hora', b.hora || 'Por confirmar')}${fila('Lugar', b.lugar)}${fila('Dirección', b.direccion)}${fila('Valor', b.precio)}${fila('Pago', b.pago)}${fila('Código', b.codigo)}</table>
  ${b.link && b.tipo !== 'cancel' ? `<p style="margin:12px 0 0;font-size:14px">Enlace de la videollamada: <a href="${e(b.link)}">${e(b.link)}</a></p>` : ''}
  ${acceso}
  <div style="margin-top:20px"><a href="${APP}" style="display:inline-block;background:#c8f53a;color:#000;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:12px">Abrir la app</a>${gcal ? ` <a href="${gcal}" style="display:inline-block;margin-left:6px;color:#111;font-weight:700;padding:12px 6px">Agregar a mi calendario</a>` : ''}</div>
  </div></div><p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:14px">© 2026 StrongMed × Kin At Home by Klgo. David Ponce · Este correo se envió porque agendaste una hora.</p></div></body></html>`; }
module.exports = async (req, res) => {
  const o = req.headers.origin || ''; if (!ORIGENES.includes(o)) return res.status(403).json({ ok: false });
  res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'content-type'); return res.status(204).end(); }
  if (req.method !== 'POST') return res.status(405).end();
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x', now = Date.now(), h = (hits.get(ip) || []).filter(x => now - x < 3600e3);
  if (h.length >= 30) return res.status(429).json({ ok: false }); h.push(now); hits.set(ip, h);
  let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const t = T[b.tipo]; if (!t || !/^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$/i.test(b.to || '')) return res.status(400).json({ ok: false });
  for (const k of Object.keys(b)) if (typeof b[k] === 'string') b[k] = b[k].slice(0, 300);
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return res.status(503).json({ ok: false, error: 'correo no configurado' });
  const r = rango(b.fechaISO, b.hora, b.dur);
  try {
    const tr = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS } });
    await tr.sendMail({ from: `"StrongMed" <${process.env.GMAIL_USER}>`, to: b.to, subject: `${t[0]} · ${b.fecha || ''}${b.hora ? ' ' + b.hora : ''}`.trim(), html: html(b, t, r),
      ...(r && (b.tipo === 'conf' || b.tipo === 'cambio') ? { icalEvent: { filename: 'sesion.ics', method: 'PUBLISH', content: ics(b, r) } } : {}) });
    return res.status(200).json({ ok: true });
  } catch (err) { console.error(err); return res.status(500).json({ ok: false, error: String(err && (err.response || err.message) || err).slice(0, 200) }); }
};
