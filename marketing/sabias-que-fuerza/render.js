// Uso: node render.js stills | video   (requiere Playwright y ffmpeg)
const {chromium}=require('playwright');const {spawn}=require('child_process');
(async()=>{
 const mode=process.argv[2]||'stills', out=process.argv[3]||__dirname;
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
 p.on('pageerror',e=>console.error('PAGE ERROR',e.message));
 await p.goto('file://'+__dirname+'/scene.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 const D=await p.evaluate(()=>D);
 if(mode==='stills'){for(const t of (process.argv[4]||'3,9,11,17,20,26,29.5,35').split(',').map(Number)){await p.evaluate(t=>render(t),t);await p.screenshot({path:`${out}/still_${t}.png`});}}
 else{const fps=30;const ff=spawn('ffmpeg',['-y','-f','image2pipe','-framerate',''+fps,'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium','-movflags','+faststart',`${out}/video_sin_audio.mp4`],{stdio:['pipe','ignore','inherit']});
  for(let i=0;i<fps*D;i++){await p.evaluate(t=>render(t),i/fps);const buf=await p.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));}
 await b.close();})();
