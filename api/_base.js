// Utilidades compartidas por las funciones de Vercel: Firebase Admin, sesión verificada y envío de notificaciones (Web Push).
// Variable en Vercel: FIREBASE_SA = JSON de la cuenta de servicio de kinathome-asesorias (Firebase → Configuración → Cuentas de servicio).
// © 2026 StrongMed × Kin At Home by Klgo. David Ponce · Todos los derechos reservados
const admin = require('firebase-admin');
const webpush = require('web-push');
const crypto = require('crypto');

const ORIGENES = ['https://strongmed.vercel.app', 'https://dpckine.github.io', 'capacitor://localhost', 'https://localhost'];
const BUILTIN = { strongmed: { id: 'b-sm', org: 'all', rol: 'admin' }, kinathome: { id: 'b-kah', org: 'kah', rol: 'org' }, nicole: { id: 'b-oral', org: 'all', rol: 'oral' } };

let app = null;
function fb() {
  if (app) return app;
  if (!process.env.FIREBASE_SA) return null;
  try { app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)) }); }
  catch (e) { console.error('FIREBASE_SA inválida', e.message); return null; }
  return app;
}
const db = () => admin.firestore(fb());

// CORS solo para la app; responde el preflight. Devuelve false si la petición ya se respondió.
function cors(req, res, metodos = 'POST') {
  const o = req.headers.origin || '';
  if (o && !ORIGENES.includes(o)) { res.status(403).json({ ok: false }); return false; }
  if (o) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', metodos); res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization'); res.setHeader('Access-Control-Max-Age', '600'); res.status(204).end(); return false; }
  return true;
}

// Límite de intentos por clave (por instancia; frena abusos simples).
const hits = new Map();
function limite(clave, max, ventanaMs = 3600e3) {
  const now = Date.now(), h = (hits.get(clave) || []).filter(x => now - x < ventanaMs);
  if (h.length >= max) return false; h.push(now); hits.set(clave, h);
  if (hits.size > 5000) hits.clear();
  return true;
}
const ipDe = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
function cuerpo(req) { let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } } return b && typeof b === 'object' ? b : {}; }

// Quién llama: verifica el token de Firebase Auth (proyecto StrongMed) y lo traduce a persona o profesional.
async function quien(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ''); if (!m || !fb()) return null;
  let t; try { t = await admin.auth(fb()).verifyIdToken(m[1]); } catch { return null; }
  const email = String(t.email || '').toLowerCase();
  let r = /^([0-9k]{2,12})\.(\d{4})@p\.strongmed\.app$/.exec(email);
  if (r) return { tipo: 'pat', rut: r[1], uid: t.uid, clave: 'pat_' + r[1] };
  r = /^([a-z0-9_-]{1,40})\.[0-9a-f]{20}@pro\.strongmed\.app$/.exec(email);
  if (r) {
    const usuario = r[1]; let a = null;
    try { const s = await db().doc('acceso/' + usuario).get(); if (s.exists) a = s.data(); } catch (e) { console.warn(e.message); }
    if (a && a.activo === false) return null;
    a = a || BUILTIN[usuario]; if (!a || !a.id) return null;
    return { tipo: 'pro', usuario, id: String(a.id), org: a.org || 'sm', rol: a.rol || 'pro', uid: t.uid, clave: 'pro_' + a.id };
  }
  return null;
}

// Claves VAPID: se crean solas la primera vez y quedan en Firestore (config/vapid), que las reglas no dejan leer a nadie.
let vapid = null;
async function claves() {
  if (vapid) return vapid;
  const ref = db().doc('config/vapid');
  let s = await ref.get();
  if (!s.exists) { const k = webpush.generateVAPIDKeys(); try { await ref.create({ ...k, creado: Date.now() }); } catch { } s = await ref.get(); }
  vapid = s.data(); webpush.setVapidDetails('mailto:strongmed.equipo@gmail.com', vapid.publicKey, vapid.privateKey);
  return vapid;
}

const idSub = endpoint => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);

// Envía a todos los teléfonos de un destinatario ('pat_<rut>' o 'pro_<id>'); borra suscripciones vencidas.
async function enviar(dest, aviso) {
  await claves();
  const ref = db().doc('push/' + dest), s = await ref.get(); if (!s.exists) return 0;
  const subs = s.data().subs || {}; let n = 0; const malas = {};
  const carga = JSON.stringify({ title: String(aviso.title || 'StrongMed').slice(0, 80), body: String(aviso.body || '').slice(0, 180), tab: aviso.tab || 'hoy', tag: aviso.tag || '', url: 'https://strongmed.vercel.app/' });
  await Promise.all(Object.entries(subs).map(async ([k, sub]) => {
    if (sub.fcm) {   // app Android de StrongMed (Firebase Cloud Messaging)
      const c = JSON.parse(carga);
      try { await admin.messaging(fb()).send({ token: sub.fcm, notification: { title: c.title, body: c.body }, data: { tab: c.tab, tag: c.tag }, android: { priority: 'high', notification: { tag: c.tag || undefined, color: '#C8F53A' } } }); n++; }
      catch (e) { if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(e.code || '')) malas['subs.' + k] = admin.firestore.FieldValue.delete(); else console.warn('fcm', e.code); }
      return;
    }
    try { await webpush.sendNotification(sub, carga, { TTL: 86400, urgency: 'high' }); n++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) malas['subs.' + k] = admin.firestore.FieldValue.delete(); else console.warn('push', e.statusCode, e.body); }
  }));
  if (Object.keys(malas).length) await ref.update(malas).catch(() => { });
  return n;
}

module.exports = { admin, fb, db, cors, limite, ipDe, cuerpo, quien, claves, enviar, idSub };
