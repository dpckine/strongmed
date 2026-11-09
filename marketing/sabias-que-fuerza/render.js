// Uso: node render.js stills [carpeta] [t1,t2,...] | node render.js video [carpeta]
// Requiere Playwright (Chromium) y ffmpeg. Sirve el repo por HTTP para cargar el modelo 3D (modelos/cuerpo.glb).
const { chromium } = require('playwright'); const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json' };
(async () => {
  const mode = process.argv[2] || 'stills', out = path.resolve(process.argv[3] || __dirname);
  const srv = http.createServer((q, r) => {
    let u = decodeURIComponent(q.url.split('?')[0]); const m = u.match(/\/modelos\/[^/]+$/); if (m) u = m[0]; // el visor 3D pide el modelo relativo a la página
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  const tf = path.join(__dirname, 'voz', 'timing.json');
  if (fs.existsSync(tf)) await p.addInitScript(t => { window.__TIMING = t; }, JSON.parse(fs.readFileSync(tf, 'utf8')));
  await p.goto(`http://localhost:${port}/marketing/sabias-que-fuerza/scene.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => window.ready3D && window.ready3D(), null, { timeout: 60000 });
  await p.waitForTimeout(5000); // carga del cuerpo 3D
  const D = await p.evaluate(() => D), fps = 30;
  const frame = async t => { await p.evaluate(t => { render(t); __step(t * 1000); }, t); };
  if (mode === 'stills') {
    for (const t of (process.argv[4] || '3,9,17,26,36').split(',').map(Number)) {
      for (let k = 6; k >= 0; k--) await frame(t - k / fps);
      await p.screenshot({ path: `${out}/still_${t}.png` });
    }
  } else {
    const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', '' + fps, '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', `${out}/video_sin_audio.mp4`], { stdio: ['pipe', 'ignore', 'inherit'] });
    const N = Math.round(fps * D), t0 = Date.now();
    for (let i = 0; i < N; i++) {
      await frame(i / fps);
      const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 150 === 0) console.log(`cuadro ${i}/${N} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }
  await b.close(); srv.close();
})();
