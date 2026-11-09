const {chromium}=require('playwright');const {spawn}=require('child_process');
(async()=>{
 const mode=process.argv[2]||'stills';
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
 await p.goto('file://'+__dirname+'/scene.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 if(mode==='stills'){for(const t of [3,10,17.5,24.5,29]){await p.evaluate(t=>render(t),t);await p.screenshot({path:`still_${t}.png`});}}
 else{const fps=30,D=30;const ff=spawn('ffmpeg',['-y','-f','image2pipe','-framerate',''+fps,'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium','-movflags','+faststart','out.mp4'],{stdio:['pipe','ignore','inherit']});
  for(let i=0;i<fps*D;i++){await p.evaluate(t=>render(t),i/fps);const buf=await p.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
  ff.stdin.end();await new Promise(r=>ff.on('close',r));}
 await b.close();})();
