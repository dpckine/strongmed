/* Importar rutinas desde texto libre (WhatsApp, notas, Hevy).
   SMImport.parse(texto) → { dias:[{titulo, ejercicios:[{nombre, series, reps, kg, rir, descanso, aprox, linea}]}], ignoradas:[...] }
   SMImport.match(nombre, lib) → [{x, s}] candidatos de la biblioteca ordenados por puntaje (0 a 1) */
(function(){
const fold = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const NUM = '\\d+(?:[.,]\\d+)?';
const DIA_RE = /^(d[ií]a|day|sesi[oó]n|semana|rutina|entrenamiento|entreno|workout|bloque|fase|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const SPLIT_RE = /^(push|pull|legs?|upper|lower|full ?body|torso|tren (superior|inferior)|pierna|piernas)( (day|d[ií]a))?( ?[a-d1-9])?$/i;
const GRUPOS = 'pecho|espalda|hombros?|brazos?|biceps|triceps|piernas?|gluteos?|abdomen|abdominales|core|cuadriceps|isquios?|isquiotibiales|femorales?|gemelos|pantorrillas?|dorsales?|trapecios?|antebrazos?|deltoides|cadera|full body|cuerpo completo|tren superior|tren inferior';
const GRUPO_RE = new RegExp(`^(?:(?:${GRUPOS})(?:\\s*(?:y|e|\\+|/|,|&|-)\\s*|\\s+|$))+$`);
const SECCION_RE = /^(calentamiento|activaci[oó]n|warm ?up|enfriamiento|vuelta a la calma|estiramientos?|movilidad|cardio|finisher|circuito|superserie|superset|biserie|triserie|notas?|observaciones?)\b/i;
const BASURA_RE = /https?:\/\/|www\.|@hevyapp|hevy\.com|^(hola|buenas|saludos|gracias|cualquier duda|ojo|nota)\b/i;
const FECHA_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*,.*\d{4}/i;

function limpia(l){ return l.replace(/(\d)️?⃣/g,'$1. ').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu,' ')
  .replace(/[×✕✖]/g,'x').replace(/(\d)\s*\*\s*(\d)/g,'$1x$2').replace(/[*_~`]/g,' ').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim()
  .replace(/^(?:[-•·▪►➤>=+]+\s*)+/,'').replace(/^\(?\d{1,2}\s*[.)\-:]\s+(?!x)/i,'').replace(/^[a-h]\d?\s*[.)\-:]\s+/i,'').replace(/^[a-h]\d\s+/i,'').trim(); }

/* descanso a texto corto: 90 → "90s", 2 min → "2min" */
function restTxt(n, u){ n=parseFloat(String(n).replace(',','.')); if(!n) return ''; u=fold(u||'');
  if(/^(min|m|')/.test(u) || (!u && n<=5)) return n%1 ? `${Math.round(n*60)}s` : `${n}min`; return `${Math.round(n)}s`; }

/* saca de la línea la pauta (series, reps, kg, RIR, descanso) y deja el nombre */
function pauta(line){ let s=' '+line+' ', o={};
  const cut = (re, f) => { s=s.replace(re, (...m)=>{ f(m); return ' '; }); };
  cut(/\b(?:desc(?:anso)?|rest|pausa|recup(?:eraci[oó]n)?)\.?\s*(?:de|entre series)?\s*:?\s*(\d{1,2}):(\d\d)\b/i, m=>{ o.descanso=restTxt(+m[1]*60+ +m[2],'s'); });
  cut(new RegExp(`\\b(?:desc(?:anso)?|rest|pausa|recup(?:eraci[oó]n)?)\\.?\\s*(?:de|entre series)?\\s*:?\\s*(${NUM})(?:\\s*(?:-|a)\\s*(${NUM}))?\\s*(min(?:utos?)?\\b|m\\b|'|seg(?:undos?)?\\b|s\\b|"|'')?`,'i'), m=>{ o.descanso=restTxt(m[2]||m[1], m[3]); });
  cut(/\bRIR\s*:?\s*(\d+(?:\s*[-/]\s*\d+)?)/i, m=>{ o.rir=m[1].replace(/\s/g,''); });
  cut(/(?:\bRPE\s*:?\s*|@\s*)(\d+(?:[.,]5)?)/i, m=>{ const r=10-parseFloat(m[1].replace(',','.')); if(r>=0 && r<=5) o.rir=String(Math.round(r)); });
  cut(new RegExp(`(${NUM})(?:\\s*(?:-|a|/)\\s*(${NUM}))?\\s*(kgs?|kilos?|k)\\b`,'i'), m=>{ o.kg=String(parseFloat((m[2]||m[1]).replace(',','.'))); });
  cut(new RegExp(`(${NUM})(?:\\s*(?:-|a|/)\\s*(${NUM}))?\\s*(lbs?|libras?)\\b`,'i'), m=>{ o.kg=String(Math.round(parseFloat((m[2]||m[1]).replace(',','.'))*0.4536*2)/2); });
  cut(/\b(\d)\s*(?:series?\s*)?(?:de\s*)?(?:aprox(?:imaci[oó]n)?|calentamiento|warm-?ups?)\b\s*\+?/i, m=>{ o.aprox=+m[1]; });
  cut(/\b(\d)\s*A\s*\+/, m=>{ o.aprox=+m[1]; });
  const REPS = `(\\d{1,3}(?:\\s*(?:-|/|a)\\s*\\d{1,3})*|al fallo|fallo|amrap|m[aá]x(?:imo)?)`;
  const uni = (r, u) => { r=/\d/.test(r) ? r.replace(/(\d)\s*a\s*(\d)/g,'$1-$2').replace(/\s/g,'') : r.toLowerCase(); u=fold(u||''); return /^(seg|s\b|"|'')/.test(u) ? r+'s' : /^(min|')/.test(u) ? r+'min' : r; };
  const lado = () => { let l=''; cut(/\b(?:c\/\s*lado|c\/\s*l|x\s*lado|por lado|cada lado|c\/\s*u|cada pierna|cada brazo|por pierna|por brazo|each side|per side)\b/i, ()=>{ l=' c/lado'; }); return l; };
  const lad = lado();
  cut(new RegExp(`\\b(\\d{1,2})\\s*(?:series?|sets?|s)?\\s*x\\s*${REPS}\\s*(reps?\\b|repeticiones\\b|seg(?:undos?)?\\b|s\\b|"|''|min(?:utos?)?\\b)?`,'i'), m=>{ let a=+m[1], r=m[2];
    if(a>12 && /^\d+$/.test(r) && +r<=6){ [a,r]=[+r,String(a)]; } o.series=a; o.reps=uni(r, m[3]); });
  if(!o.series) cut(new RegExp(`\\b(\\d{1,2})\\s*(?:series?|sets?|vueltas?|rondas?)\\s*(?:de|x|con|por)?\\s*${REPS}?\\s*(reps?\\b|repeticiones\\b|seg(?:undos?)?\\b|s\\b|"|min(?:utos?)?\\b)?`,'i'), m=>{ o.series=+m[1]; if(m[2]) o.reps=uni(m[2], m[3]); });
  if(!o.reps) cut(new RegExp(`${REPS}\\s*(reps?\\b|repeticiones\\b|seg(?:undos?)?\\b|segs\\b|"|min(?:utos?)?\\b)`,'i'), m=>{ o.reps=uni(m[1], m[2]); });
  if(!o.reps) cut(/(?:^|\s)(\d{1,2}(?:\s*[-/]\s*\d{1,2}){2,})(?=\s|$)/, m=>{ const v=m[1].split(/[-/]/).map(t=>t.trim()); o.reps=v.join('/'); if(!o.series) o.series=v.length; });
  if(o.reps && lad) o.reps+=lad;
  let n=s.replace(/\(\s*\)/g,' ').replace(/\b(con|de|en|a|y|x|c\/)\s*$/i,'').replace(/\s+/g,' ').trim().replace(/^[\s\-:,.|/]+|[\s\-:,.|/(]+$/g,'').trim();
  n=n.replace(/\b(con|de|en|a|y|x)\s*$/i,'').trim();
  o.nombre = n ? n[0].toUpperCase()+n.slice(1) : '';
  o.tiene = !!(o.series||o.reps||o.kg||o.rir||o.descanso||o.aprox);
  return o; }

/* línea de serie al estilo Hevy: "Set 1: 60 kg x 10", "Serie 2 (calentamiento): 20 kg x 12", "W1: 40kg x 8" */
const SET_RE = /^(?:(?:set|serie)\s*(\d+)\s*(?:\(([^)]*)\))?|(w)\s*\d*|(?:warm-?up|calentamiento)\s*\d*)\s*:\s*(.*)$/i;
function setLinea(m){ const t=m[4]||'', w=!!(m[3] || /warm|calent/i.test(m[0].split(':')[0]+(m[2]||''))); let kg='', reps='', rir='';
  let x=new RegExp(`(${NUM})\\s*(kg|lbs?)?\\s*x\\s*(\\d+)`,'i').exec(t); if(x){ kg=parseFloat(x[1].replace(',','.')); if(/lb/i.test(x[2]||'')) kg=Math.round(kg*0.4536*2)/2; reps=x[3]; }
  else if((x=/(\d+(?:\s*-\s*\d+)?)\s*reps?/i.exec(t))) reps=x[1].replace(/\s/g,'');
  else if((x=/(\d+)\s*(s|seg|sec|secs)\b/i.exec(t))) reps=x[1]+'s';
  else if((x=/(\d+)/.exec(t))) reps=x[1];
  x=/(?:rpe|@)\s*(\d+(?:[.,]5)?)/i.exec(t); if(x){ const r=10-parseFloat(x[1].replace(',','.')); if(r>=0&&r<=5) rir=String(Math.round(r)); }
  return {w, kg, reps, rir}; }

function parse(texto){
  const lines=String(texto||'').replace(/\r/g,'').split('\n'), dias=[], ignoradas=[];
  let dia=null, ult=null, restDia='';
  const nuevoDia = (t, fuerte) => { dia={titulo:t||'', fuerte:!!fuerte, ejercicios:[]}; dias.push(dia); ult=null; restDia=''; return dia; };
  const tit = t => { t=t.replace(/[:\-–|]+$/,'').trim(); return t ? t[0].toUpperCase()+t.slice(1) : t; };
  lines.forEach((raw, idx)=>{ const l=limpia(raw); if(!l) return; const lf=fold(l).replace(/[:.\-]+$/,'').trim();
    if(BASURA_RE.test(l) || FECHA_RE.test(l)) return void ignoradas.push(l);
    const sm=SET_RE.exec(l);
    if(sm && ult){ const st=setLinea(sm); ult._sets=ult._sets||[]; ult._sets.push(st); return; }
    const p=pauta(l);
    if(!p.tiene && l.split(' ').length<=9 && (DIA_RE.test(l) || SPLIT_RE.test(lf))){ if(dia && !dia.ejercicios.length && !dia.fuerte) dia.titulo=tit(l), dia.fuerte=true; else nuevoDia(tit(l), true); return; }
    if(!p.tiene && GRUPO_RE.test(lf)){
      if(!dia) nuevoDia(tit(l), false);
      else if(!dia.ejercicios.length) dia.titulo = dia.titulo ? `${dia.titulo} · ${tit(l)}` : tit(l);
      else if(!dia.fuerte) nuevoDia(tit(l), false);
      else ignoradas.push(l);
      return; }
    if(!p.tiene && (SECCION_RE.test(l) || /:$/.test(l))){ ignoradas.push(l); return; }
    if(!p.nombre){ // solo pauta: completa el ejercicio anterior o fija el descanso del día
      if(p.descanso && !p.series && !p.reps && dia && /entre|general|tod[oa]s/i.test(l)){ dia._rest=p.descanso; return; }
      if(ult){ ['series','reps','kg','rir','descanso','aprox'].forEach(k=>{ if(p[k]!==undefined && !ult[k]) ult[k]=p[k]; }); }
      else if(p.descanso) restDia=p.descanso; else ignoradas.push(l);
      return; }
    if(!p.tiene && l.split(' ').length>9){ ignoradas.push(l); return; }
    if(!dia) nuevoDia('', false);
    ult={nombre:p.nombre, series:p.series, reps:p.reps, kg:p.kg, rir:p.rir, descanso:p.descanso||restDia, aprox:p.aprox, linea:l, n:idx};
    dia.ejercicios.push(ult); });
  // series registradas una a una (Hevy): resume en series × reps y el peso más alto
  dias.forEach(d=>d.ejercicios.forEach(e=>{ if(!e._sets) return; const ef=e._sets.filter(s=>!s.w), ap=e._sets.length-ef.length, rs=ef.map(s=>s.reps).filter(Boolean);
    if(ef.length) e.series=ef.length; if(ap) e.aprox=Math.min(5,ap); if(rs.length) e.reps=rs.every(r=>r===rs[0]) ? rs[0] : rs.join('/');
    const kgs=ef.map(s=>+s.kg).filter(Boolean); if(kgs.length) e.kg=String(Math.max(...kgs)); const rr=ef.map(s=>s.rir).filter(Boolean); if(rr.length) e.rir=rr[rr.length-1]; delete e._sets; }));
  dias.forEach(d=>{ if(d._rest) d.ejercicios.forEach(e=>{ if(!e.descanso) e.descanso=d._rest; }); });
  const out=dias.filter(d=>d.ejercicios.length).map(d=>({titulo:d.titulo, ejercicios:d.ejercicios}));
  return {dias:out, ignoradas}; }

/* ---------- búsqueda en la biblioteca ---------- */
// sinónimos y frases (inglés de Hevy incluido) llevados a un mismo vocabulario; se aplica igual al texto y a la biblioteca
const FRASES = [
  [/\b(press (de )?hombros?|press de hombro|shoulder press|overhead press|ohp|press arnold|arnold press)\b/g, m=>/arnold/.test(m)?'press arnold':'press militar'],
  [/\b(press (de )?banca|press plano|banca plana|bench press|bench)\b/g,'press banca'],
  [/\b(peso muerto|deadlift)\b/g,'pesomuerto'], [/\b(rdl|romanian|rumano)\b/g,'rumano'], [/\b(stiff[- ]leg|piernas? (semi)?rigidas?)\b/g,'rigido'],
  [/\b(hip thrust|empuje de cadera|elevacion(es)? de cadera|hip raise|glute bridge|puente de gluteos?)\b/g, m=>/puente|bridge/.test(m)?'puente gluteo':'hipthrust'],
  [/\b(leg press|prensa de piernas|prensa)\b/g,'prensa'],
  [/\b(leg extension|extension(es)? de cuadriceps|sillon de cuadriceps|silla de cuadriceps|extension de piernas|extensiones de piernas)\b/g,'extension cuadriceps'],
  [/\b(leg curl|curl (de )?(isquios?|isquiotibiales|femoral(es)?|piernas?)|femoral(es)?)\b/g,'curl femoral'],
  [/\b(lat pulldown|pulldown|pull down|jalon(es)?( dorsal(es)?)?|polea al pecho)\b/g,'jalon'],
  [/\b(pull ?ups?|chin ?ups?|dominadas?)\b/g,'dominada'], [/\b(push ?ups?|lagartijas?|flexion(es)? de (brazos|codos)|flexiones)\b/g,'flexion brazo'],
  [/\b(dips?|fondos?)\b/g,'fondos'], [/\b(skull ?crushers?|rompe ?craneos|press frances|frances)\b/g,'frances'],
  [/\b(triceps pushdown|pushdown|press down|extension(es)? de triceps en polea|triceps en polea|triceps polea)\b/g,'extension triceps polea'],
  [/\b(lateral raises?|elevacion(es)? laterales?|vuelos laterales?|laterales)\b/g,'elevacion lateral'],
  [/\b(front raises?|elevacion(es)? frontales?|frontales)\b/g,'elevacion frontal'],
  [/\b(rear delt fly|reverse fly|reverse pec deck|pajaros?|vuelos posteriores|posteriores)\b/g,'pajaro'],
  [/\b(chest fly|pec deck|peck deck|butterfly|aperturas?|contractora|flyes|fly)\b/g,'apertura'],
  [/\b(calf raises?|gemelos?|pantorrillas?|elevacion(es)? de talones|talones|soleo)\b/g, m=>/soleo/.test(m)?'soleo gemelo':'gemelo'],
  [/\b(lunges?|zancadas?|estocadas?|desplantes?)\b/g,'zancada'], [/\b(bulgarian split squat|bulgaras?|split squat)\b/g,'bulgara'],
  [/\b(squats?|sentadillas?)\b/g,'sentadilla'], [/\b(goblet)\b/g,'goblet'], [/\b(hack squat|hack)\b/g,'hack'],
  [/\b(shrugs?|encogimientos? de hombros?|encogimientos?)\b/g,'encogimiento'],
  [/\b(bent over row|barbell row|remos?|rows?)\b/g,'remo'], [/\b(upright row|remo al menton|menton)\b/g,'remo menton'],
  [/\b(seated cable row|remo sentado|gironda|remo bajo)\b/g,'remo sentado polea'],
  [/\b(hammer curl|curl martillo|martillos?)\b/g,'curl martillo'], [/\b(preacher curl|curl (en )?banco scott|scott|predicador)\b/g,'curl predicador'],
  [/\b(bicep curl|biceps curl|curl de biceps|curl biceps)\b/g,'curl biceps'],
  [/\b(crunch(es)?|abdominales?|encogimientos? abdominales?)\b/g,'crunch'], [/\b(planks?|planchas?)\b/g,'plancha'],
  [/\b(hyperextensions?|hiperextension(es)?|lumbares)\b/g,'hiperextension'],
  [/\b(hip abduction|abductores?|abduccion(es)?)\b/g,'abductor'], [/\b(hip adduction|aductores?|aduccion(es)?)\b/g,'aductor'],
  [/\b(face ?pulls?)\b/g,'facepull'], [/\b(pull ?over)\b/g,'pullover'], [/\b(good ?mornings?|buenos dias)\b/g,'buenosdias'],
  [/\b(dumbbells?|db|mancuernas?)\b/g,'mancuerna'], [/\b(barbell|bb|barras?)\b/g,'barra'], [/\b(ez bar|ez|barra z)\b/g,'barraz'],
  [/\b(cables?|poleas?|crossover)\b/g,'polea'], [/\b(smith machine|smith|multipower|multi power)\b/g,'smith'],
  [/\b(machine|lever|maquinas?|sled)\b/g,'maquina'], [/\b(kettlebells?|kb|pesas? rusas?)\b/g,'kettlebell'],
  [/\b(bands?|bandas?|elasticos?|ligas?)\b/g,'banda'], [/\b(bodyweight|peso corporal)\b/g,''],
  [/\b(incline|inclinado|inclinada)\b/g,'inclinado'], [/\b(decline|declinado|declinada)\b/g,'declinado'],
  [/\b(seated|sentado|sentada)\b/g,'sentado'], [/\b(standing|de pie|parado)\b/g,'pie'], [/\b(lying|acostado|tumbado|acostada|tumbada)\b/g,'tumbado'],
  [/\b(single arm|one arm|single leg|one leg|a una mano|una mano|a una pierna|una pierna|unilateral(es)?)\b/g,'unilateral'],
  [/\b(close grip|agarre cerrado|agarre estrecho|cerrado)\b/g,'cerrado'], [/\b(wide grip|agarre abierto|agarre ancho|abierto)\b/g,'abierto'],
  [/\b(military|militar)\b/g,'militar'], [/\b(overhead|sobre la cabeza|tras nuca)\b/g, m=>m==='tras nuca'?'nuca':'cabeza'],
];
const STOP = new Set('de del la el los las con en a al y e para por sobre the with on of in to v 2 version variante'.split(' '));
const stem = w => w.length<=4 ? w : w.replace(/iones$/,'ion').replace(/(les|res|nes)$/,m=>m[0]).replace(/s$/,'');
function toks(s){ let t=' '+fold(s).replace(/[()\[\]/,.;:+\-–_'"]/g,' ').replace(/\s+/g,' ')+' ';
  for(const [re, r] of FRASES) t=t.replace(re, r);
  return t.split(' ').filter(w=>w && !STOP.has(w)).map(stem); }
function lev(a,b){ if(Math.abs(a.length-b.length)>2) return 9; const d=[...Array(b.length+1).keys()];
  for(let i=1;i<=a.length;i++){ let p=d[0]; d[0]=i; for(let j=1;j<=b.length;j++){ const t=d[j]; d[j]=Math.min(d[j]+1, d[j-1]+1, p+(a[i-1]===b[j-1]?0:1)); p=t; } } return d[b.length]; }
function sim(a,b){ if(a===b) return 1; const [c,l]=a.length<b.length?[a,b]:[b,a]; if(c.length>=5 && c.length/l.length>=.7 && l.startsWith(c)) return .85;
  if(a.length>=5 && b.length>=5){ const d=lev(a,b); if(d===1) return .85; if(d===2 && a.length>=8) return .7; } return 0; }

let IDX=null, IDXlib=null;
function index(lib){ if(IDXlib===lib && IDX) return IDX; IDXlib=lib;
  IDX=lib.filter(x=>!x.o).map(x=>({x, vs:[x.n, x.en, ...(x.al||[]).map(a=>a[1])].filter(Boolean).map(v=>({t:toks(v), f:fold(v)})), k:toks(x.k||'')}));
  return IDX; }
// palabras que cambian el ejercicio pesan más si sobran; el implemento pesa poco (si no se escribe, vale cualquiera)
const DIST = new Set('bulgara rumano sumo hack goblet inclinado declinado unilateral cerrado abierto nuca supino rigido salto isometria pausa deficit asistido asistida lastrado banda kettlebell landmine smith copenhague lateral arnold scott predicador invertido inverso caminando cajon'.split(' '));
const EQ = new Set('barra mancuerna polea maquina convencional pie cuerda rkc'.split(' '));
const peso = t => DIST.has(t) ? 2 : EQ.has(t) ? .4 : 1;
function score(A, B, K){ if(!A.length || !B.length) return 0; let hit=0; const usado=new Set();
  A.forEach(a=>{ let b=0, bj=-1; B.forEach((w,j)=>{ const s=sim(a,w); if(s>b){ b=s; bj=j; } }); if(b<.85 && K) K.forEach(w=>{ const s=sim(a,w)*.9; if(s>b){ b=s; bj=-1; } }); hit+=b; if(bj>=0) usado.add(bj); });
  let pu=0, pt=0; B.forEach((w,j)=>{ pt+=peso(w); if(usado.has(j)) pu+=peso(w); });
  return .8*hit/A.length + .2*pu/pt; }
function match(nombre, lib){ const A=toks(nombre), f=fold(nombre).trim(); if(!A.length) return [];
  return index(lib).map(e=>{ let s=0; for(const v of e.vs){ if(v.f===f){ s=1; break; } s=Math.max(s, score(A, v.t, e.k)); }
    if(s<1) s=Math.min(.99, s + (e.x.top?.08:0)); return {x:e.x, s}; }).filter(r=>r.s>.3).sort((a,b)=>b.s-a.s || a.x.n.length-b.x.n.length).slice(0,6); }
/* nivel de confianza: ok (seguro), duda (revisar) o no (no encontrado) */
function nivel(c){ if(!c.length) return 'no'; const a=c[0].s, b=c[1]?c[1].s:0; return a>=.97 || (a>=.85 && a-b>=.04) ? 'ok' : a>=.5 ? 'duda' : 'no'; }

window.SMImport = {parse, match, nivel, toks, pauta};
})();
