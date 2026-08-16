/**
 * MktScreenshots — Universal marketing screenshot/GIF/freeze toolkit
 *
 * Usage in cheats.js:
 *   MktScreenshots.onLangChange = function(lang){ (game-specific: update bots, killfeed etc) };
 *   MktScreenshots.onPanelToggle = function(){ (toggle cheat panel) };
 *
 * Hotkeys:
 *   Ctrl+Shift+9 — toggle cheat panel (calls onPanelToggle)
 *   L — cycle language
 *   J — PC screenshot 1920x1080
 *   K — mobile screenshot 1080x1920
 *   O — toggle GIF recording
 *   P — silent freeze/unfreeze
 *   Ctrl+L then J — batch PC screenshots (all 13 langs)
 *   Ctrl+L then K — batch mobile screenshots (all 13 langs)
 */
(function(){
  'use strict';

  const LANGS=['ru','en','es','tr','pt','ar','id','fr','ja','it','de','hi','zh'];
  let langIdx=0;

  // ===== PUBLIC API =====
  const API = window.MktScreenshots = {
    /** Override: called after language switch with new lang code. Use for game-specific updates (bots, killfeed, etc.) */
    onLangChange: null,
    /** Override: called when Ctrl+Shift+9 pressed. Use to toggle cheat panel. */
    onPanelToggle: null,
    /** Override: additional overlay compositing. fn(outCtx, tw, th) */
    onCompositeOverlays: null,
    /** Current lang list */
    LANGS: LANGS,
    /** Take single screenshot */
    takeScreenshot: takeScreenshot,
    /** Take batch screenshots (all langs) */
    batchScreenshots: batchScreenshots,
    /** Toggle GIF recording */
    toggleGifRecording: toggleGifRecording,
    /** Cycle language */
    cycleLang: cycleLang,
    /** Toggle freeze */
    toggleFreeze: toggleFreeze,
    /** Show notification toast */
    showNotify: showNotify,
    /** Is currently frozen */
    get frozen(){ return !!window._cheatFrozen; }
  };

  // ===== NOTIFICATION =====
  let notifyEl=null,notifyTimer=0;
  function showNotify(text){
    if(!notifyEl){
      notifyEl=document.createElement('div');
      notifyEl.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:rgba(0,0,0,0.85);border:2px solid #4a9eff;border-radius:12px;padding:16px 32px;font-family:monospace;font-size:20px;color:#fff;pointer-events:none;transition:opacity 0.3s;';
      document.body.appendChild(notifyEl);
    }
    notifyEl.textContent=text;
    notifyEl.style.opacity='1';
    notifyEl.style.display='block';
    clearTimeout(notifyTimer);
    notifyTimer=setTimeout(()=>{notifyEl.style.opacity='0';setTimeout(()=>{notifyEl.style.display='none';},300);},1500);
  }

  // ===== SCREENSHOT OVERLAY COMPOSITING =====
  function compositeOverlays(outCtx,tw,th){
    // Minimap (separate canvas) — top-right
    var miniEl=document.getElementById('minimap');
    if(miniEl&&getComputedStyle(miniEl).display!=='none'){
      var mw=miniEl.width,mh=miniEl.height;
      var mx=tw-mw-14,my=62;
      outCtx.save();
      outCtx.fillStyle='rgba(0,0,0,0.7)';
      outCtx.beginPath();outCtx.roundRect(mx-2,my-2,mw+4,mh+4,6);outCtx.fill();
      outCtx.strokeStyle='rgba(74,158,255,0.15)';outCtx.lineWidth=2;
      outCtx.beginPath();outCtx.roundRect(mx-2,my-2,mw+4,mh+4,6);outCtx.stroke();
      outCtx.drawImage(miniEl,mx,my);
      outCtx.restore();
    }
    // Controls hint (bottom center)
    var hintEl=document.getElementById('controls-hint');
    if(hintEl&&getComputedStyle(hintEl).display!=='none'){
      var lines=hintEl.innerText.split('\n').filter(function(l){return l.trim();});
      if(lines.length){
        outCtx.save();
        outCtx.font='9px "Courier New",monospace';outCtx.textAlign='center';
        var ly=th-8-lines.length*14;
        var maxW=0;lines.forEach(function(l){var w=outCtx.measureText(l).width;if(w>maxW)maxW=w;});
        outCtx.fillStyle='rgba(0,0,0,0.4)';
        outCtx.beginPath();outCtx.roundRect(tw/2-maxW/2-16,ly-12,maxW+32,lines.length*14+16,6);outCtx.fill();
        outCtx.fillStyle='rgba(255,255,255,0.15)';
        lines.forEach(function(l){outCtx.fillText(l,tw/2,ly);ly+=14;});
        outCtx.restore();
      }
    }
    // Vehicle hint (above controls hint)
    var vhEl=document.getElementById('vehicle-hint');
    if(vhEl&&getComputedStyle(vhEl).display!=='none'&&vhEl.innerText.trim()){
      outCtx.save();
      outCtx.font='12px "Courier New",monospace';outCtx.textAlign='center';
      outCtx.fillStyle='#fbbf24';
      var vhLines=vhEl.innerText.split('\n').filter(function(l){return l.trim();});
      var vly=th-60-vhLines.length*16;
      vhLines.forEach(function(l){outCtx.fillText(l,tw/2,vly);vly+=16;});
      outCtx.restore();
    }
    // Mobile UI: joysticks + action buttons (for mobile screenshots)
    var isMobileShot=(tw<th)||(typeof isMobile!=='undefined'&&isMobile);
    if(isMobileShot&&typeof gameState!=='undefined'&&gameState==='PLAYING'){
      outCtx.save();
      // Left joystick (movement) — bottom-left
      var ljx=tw*0.18, ljy=th*0.72, ljr=Math.min(60,tw*0.08);
      outCtx.globalAlpha=0.25;
      outCtx.beginPath();outCtx.arc(ljx,ljy,ljr,0,Math.PI*2);
      outCtx.strokeStyle='#4a9eff';outCtx.lineWidth=2;outCtx.stroke();
      outCtx.globalAlpha=0.4;
      outCtx.beginPath();outCtx.arc(ljx+ljr*0.3,ljy-ljr*0.2,ljr*0.36,0,Math.PI*2);
      outCtx.fillStyle='rgba(74,158,255,0.5)';outCtx.fill();
      // Right joystick (aim) — bottom-right
      var rjx=tw*0.82, rjy=th*0.72;
      outCtx.globalAlpha=0.25;
      outCtx.beginPath();outCtx.arc(rjx,rjy,ljr,0,Math.PI*2);
      outCtx.strokeStyle='#f97316';outCtx.lineWidth=2;outCtx.stroke();
      outCtx.globalAlpha=0.4;
      outCtx.beginPath();outCtx.arc(rjx+ljr*0.25,rjy-ljr*0.15,ljr*0.36,0,Math.PI*2);
      outCtx.fillStyle='rgba(249,115,22,0.5)';outCtx.fill();
      // Action buttons — right side
      var abEl=document.getElementById('mobile-action-bar');
      if(abEl){
        var btns=abEl.querySelectorAll('[id^="ab-"]');
        var abx=tw-30, aby=th*0.45, abr=20, abgap=6, drawn=0;
        outCtx.globalAlpha=0.7;outCtx.textAlign='center';outCtx.textBaseline='middle';
        outCtx.font='16px sans-serif';
        btns.forEach(function(b){
          if(getComputedStyle(b).display==='none')return;
          outCtx.fillStyle='rgba(255,255,255,0.1)';
          outCtx.beginPath();outCtx.arc(abx,aby+drawn*(abr*2+abgap),abr,0,Math.PI*2);outCtx.fill();
          outCtx.strokeStyle='rgba(255,255,255,0.25)';outCtx.lineWidth=1.5;
          outCtx.beginPath();outCtx.arc(abx,aby+drawn*(abr*2+abgap),abr,0,Math.PI*2);outCtx.stroke();
          outCtx.fillStyle='#fff';
          outCtx.fillText(b.textContent,abx,aby+drawn*(abr*2+abgap));
          drawn++;
        });
      }
      // Pause button — top-right
      outCtx.globalAlpha=0.6;
      outCtx.fillStyle='rgba(255,255,255,0.15)';
      outCtx.beginPath();outCtx.arc(tw-28,24,18,0,Math.PI*2);outCtx.fill();
      outCtx.strokeStyle='rgba(255,255,255,0.3)';outCtx.lineWidth=2;
      outCtx.beginPath();outCtx.arc(tw-28,24,18,0,Math.PI*2);outCtx.stroke();
      outCtx.fillStyle='rgba(255,255,255,0.8)';outCtx.font='16px sans-serif';
      outCtx.textAlign='center';outCtx.textBaseline='middle';
      outCtx.fillText('\u23F8',tw-28,24);
      outCtx.restore();
    }
    // Custom overlays from game
    if(API.onCompositeOverlays)API.onCompositeOverlays(outCtx,tw,th);
  }

  // ===== LANG CYCLING =====
  function cycleLang(){
    langIdx=(langIdx+1)%LANGS.length;
    let lang=LANGS[langIdx];
    if(typeof Plat!=='undefined'&&Plat&&Plat.setLang)Plat.setLang(lang);
    // Game-specific updates via hook
    if(API.onLangChange)API.onLangChange(lang);
    showNotify('\u{1F310} '+lang.toUpperCase());
  }

  // ===== SCREENSHOT =====
  function takeScreenshot(targetW,targetH,prefix){
    let lang=(typeof Plat!=='undefined'&&Plat&&Plat.getLang)?Plat.getLang():'ru';
    let fname=(prefix||'screen')+'_'+lang+'.png';
    showNotify('\u{1F4F8} '+targetW+'x'+targetH+' \u2192 '+fname);

    let gameCanvas=document.getElementById('game');
    let bgCanvas=document.getElementById('menu-bg-canvas');
    if(!gameCanvas)return;

    // Save current state
    let origW=typeof W!=='undefined'?W:gameCanvas.width;
    let origH=typeof H!=='undefined'?H:gameCanvas.height;

    // Resize canvas to target
    if(typeof W!=='undefined')W=targetW;
    if(typeof H!=='undefined')H=targetH;
    gameCanvas.width=targetW;gameCanvas.height=targetH;
    gameCanvas.style.width=targetW+'px';gameCanvas.style.height=targetH+'px';
    if(bgCanvas){bgCanvas.width=targetW;bgCanvas.height=targetH;bgCanvas.style.width=targetW+'px';}

    // Force one render frame — use real rAF even when frozen
    let raf=window._cheatRaf||requestAnimationFrame;
    if(window._cheatFrozen&&typeof render==='function'){render();}
    raf(()=>{
      raf(()=>{
        let outCanvas=document.createElement('canvas');
        outCanvas.width=targetW;outCanvas.height=targetH;
        let outCtx=outCanvas.getContext('2d');
        if(bgCanvas)outCtx.drawImage(bgCanvas,0,0);
        outCtx.drawImage(gameCanvas,0,0);
        compositeOverlays(outCtx,targetW,targetH);

        outCanvas.toBlob(function(blob){
          let a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download=fname;
          a.click();
          URL.revokeObjectURL(a.href);
        },'image/png');

        // Restore original size
        if(typeof W!=='undefined')W=origW;
        if(typeof H!=='undefined')H=origH;
        gameCanvas.width=origW;gameCanvas.height=origH;
        gameCanvas.style.width=origW+'px';gameCanvas.style.height=origH+'px';
        if(bgCanvas){bgCanvas.width=origW;bgCanvas.height=origH;bgCanvas.style.width=origW+'px';}
      });
    });
  }

  // ===== GIF RECORDING =====
  let gifRecording=false;
  let gifFrames=[];
  let gifStartTime=0;
  let gifW=0,gifH=0;
  let gifInterval=null;
  const GIF_FPS=10;
  const GIF_MAX_SECONDS=15;

  function toggleGifRecording(){
    if(gifRecording){stopGifRecording();}else{startGifRecording();}
  }

  function startGifRecording(){
    let gameCanvas=document.getElementById('game');
    if(!gameCanvas)return;
    gifW=gameCanvas.width;gifH=gameCanvas.height;
    gifFrames=[];gifRecording=true;gifStartTime=Date.now();
    showNotify('\u{1F534} REC \u2014 press O to stop');
    gifInterval=setInterval(()=>{
      if(!gifRecording)return;
      if(Date.now()-gifStartTime>GIF_MAX_SECONDS*1000){stopGifRecording();return;}
      captureGifFrame();
    },1000/GIF_FPS);
  }

  function captureGifFrame(){
    let gameCanvas=document.getElementById('game');
    let bgCanvas=document.getElementById('menu-bg-canvas');
    let scale=Math.min(1,480/Math.max(gifW,gifH));
    let fw=Math.round(gifW*scale),fh=Math.round(gifH*scale);
    let tmpCanvas=document.createElement('canvas');
    tmpCanvas.width=fw;tmpCanvas.height=fh;
    let tmpCtx=tmpCanvas.getContext('2d');
    if(bgCanvas)tmpCtx.drawImage(bgCanvas,0,0,fw,fh);
    tmpCtx.drawImage(gameCanvas,0,0,fw,fh);
    gifFrames.push(tmpCtx.getImageData(0,0,fw,fh));
  }

  function stopGifRecording(){
    gifRecording=false;clearInterval(gifInterval);
    let lang=(typeof Plat!=='undefined'&&Plat&&Plat.getLang)?Plat.getLang():'ru';
    let fname='gameplayvideo_'+lang+'.gif';
    showNotify('\u23F3 Encoding GIF ('+gifFrames.length+' frames)...');
    setTimeout(()=>{
      try{
        let fw=gifFrames[0]?gifFrames[0].width:480;
        let fh=gifFrames[0]?gifFrames[0].height:270;
        let blob=encodeGIF(gifFrames,fw,fh,Math.round(100/GIF_FPS));
        let a=document.createElement('a');
        a.href=URL.createObjectURL(blob);a.download=fname;a.click();
        URL.revokeObjectURL(a.href);
        let sizeMB=(blob.size/1024/1024).toFixed(1);
        showNotify('\u2705 GIF saved: '+fname+' ('+sizeMB+'MB, '+gifFrames.length+' frames)');
      }catch(e){
        console.error('GIF encode error:',e);
        showNotify('\u274C GIF error: '+e.message);
      }
      gifFrames=[];
    },50);
  }

  // ===== MINIMAL GIF89a ENCODER =====
  function encodeGIF(frames,w,h,delay){
    let buf=[];
    function writeByte(b){buf.push(b&0xff);}
    function writeShort(s){buf.push(s&0xff);buf.push((s>>8)&0xff);}
    function writeStr(s){for(let i=0;i<s.length;i++)buf.push(s.charCodeAt(i));}
    function writeBytes(a){for(let i=0;i<a.length;i++)buf.push(a[i]);}

    let palette=[];
    for(let r=0;r<6;r++)for(let g=0;g<6;g++)for(let b=0;b<6;b++){
      palette.push(Math.round(r*51),Math.round(g*51),Math.round(b*51));
    }
    for(let i=0;i<40;i++){let v=Math.round(i*255/39);palette.push(v,v,v);}

    function findClosest(r,g,b){
      let ri=Math.round(r/51),gi=Math.round(g/51),bi=Math.round(b/51);
      ri=Math.min(5,Math.max(0,ri));gi=Math.min(5,Math.max(0,gi));bi=Math.min(5,Math.max(0,bi));
      let idx=ri*36+gi*6+bi;
      let avg=(r+g+b)/3;
      let webR=ri*51,webG=gi*51,webB=bi*51;
      let webDist=(r-webR)*(r-webR)+(g-webG)*(g-webG)+(b-webB)*(b-webB);
      let grayIdx=Math.round(avg*39/255);
      grayIdx=Math.min(39,Math.max(0,grayIdx));
      let gv=Math.round(grayIdx*255/39);
      let grayDist=(r-gv)*(r-gv)+(g-gv)*(g-gv)+(b-gv)*(b-gv);
      return grayDist<webDist ? 216+grayIdx : idx;
    }

    writeStr('GIF89a');writeShort(w);writeShort(h);
    writeByte(0xf7);writeByte(0);writeByte(0);
    writeBytes(palette);
    writeByte(0x21);writeByte(0xff);writeByte(0x0b);
    writeStr('NETSCAPE2.0');
    writeByte(3);writeByte(1);writeShort(0);writeByte(0);

    for(let fi=0;fi<frames.length;fi++){
      let frame=frames[fi];let pixels=frame.data;
      writeByte(0x21);writeByte(0xf9);writeByte(4);
      writeByte(0x00);writeShort(delay);writeByte(0);writeByte(0);
      writeByte(0x2c);writeShort(0);writeShort(0);writeShort(w);writeShort(h);writeByte(0);
      let minCodeSize=8;writeByte(minCodeSize);
      let indexed=new Uint8Array(w*h);
      for(let i=0;i<w*h;i++){let off=i*4;indexed[i]=findClosest(pixels[off],pixels[off+1],pixels[off+2]);}
      let lzwData=lzwEncode(minCodeSize,indexed);
      let pos=0;
      while(pos<lzwData.length){let chunk=Math.min(255,lzwData.length-pos);writeByte(chunk);for(let i=0;i<chunk;i++)buf.push(lzwData[pos+i]);pos+=chunk;}
      writeByte(0);
    }
    writeByte(0x3b);
    return new Blob([new Uint8Array(buf)],{type:'image/gif'});
  }

  function lzwEncode(minCodeSize,pixels){
    let clearCode=1<<minCodeSize;let eoiCode=clearCode+1;
    let codeSize=minCodeSize+1;let nextCode=eoiCode+1;let maxCode=(1<<codeSize);
    let table={};
    function initTable(){table={};for(let i=0;i<clearCode;i++)table[String(i)]={code:i};nextCode=eoiCode+1;codeSize=minCodeSize+1;maxCode=1<<codeSize;}
    let output=[];let bitBuf=0,bitCount=0;
    function writeCode(code){bitBuf|=(code<<bitCount);bitCount+=codeSize;while(bitCount>=8){output.push(bitBuf&0xff);bitBuf>>=8;bitCount-=8;}}
    initTable();writeCode(clearCode);
    if(pixels.length===0){writeCode(eoiCode);if(bitCount>0)output.push(bitBuf&0xff);return output;}
    let current=String(pixels[0]);
    for(let i=1;i<pixels.length;i++){
      let next=current+','+pixels[i];
      if(table[next]){current=next;}
      else{writeCode(table[current].code);if(nextCode<4096){table[next]={code:nextCode++};if(nextCode>maxCode&&codeSize<12){codeSize++;maxCode=1<<codeSize;}}else{writeCode(clearCode);initTable();}current=String(pixels[i]);}
    }
    writeCode(table[current].code);writeCode(eoiCode);
    if(bitCount>0)output.push(bitBuf&0xff);
    return output;
  }

  // ===== BATCH SCREENSHOTS (ALL LANGS) =====
  let batchRunning=false;
  async function batchScreenshots(targetW,targetH,prefix){
    if(batchRunning){showNotify('\u26A0\uFE0F Batch already running');return;}
    batchRunning=true;
    let total=LANGS.length;
    for(let i=0;i<total;i++){
      let lang=LANGS[i];
      if(typeof Plat!=='undefined'&&Plat&&Plat.setLang)Plat.setLang(lang);
      if(API.onLangChange)API.onLangChange(lang);
      showNotify('\u{1F4F8} '+prefix+' '+(i+1)+'/'+total+': '+lang.toUpperCase());
      await new Promise(r=>setTimeout(r,300));
      await new Promise(resolve=>{
        let gameCanvas=document.getElementById('game');
        let bgCanvas=document.getElementById('menu-bg-canvas');
        if(!gameCanvas){resolve();return;}
        let origW=typeof W!=='undefined'?W:gameCanvas.width;
        let origH=typeof H!=='undefined'?H:gameCanvas.height;
        if(typeof W!=='undefined')W=targetW;
        if(typeof H!=='undefined')H=targetH;
        gameCanvas.width=targetW;gameCanvas.height=targetH;
        gameCanvas.style.width=targetW+'px';gameCanvas.style.height=targetH+'px';
        if(bgCanvas){bgCanvas.width=targetW;bgCanvas.height=targetH;bgCanvas.style.width=targetW+'px';}
        let raf=window._cheatRaf||requestAnimationFrame;
        if(window._cheatFrozen&&typeof render==='function'){render();}
        raf(()=>{raf(()=>{
          let outCanvas=document.createElement('canvas');
          outCanvas.width=targetW;outCanvas.height=targetH;
          let outCtx=outCanvas.getContext('2d');
          if(bgCanvas)outCtx.drawImage(bgCanvas,0,0);
          outCtx.drawImage(gameCanvas,0,0);
          compositeOverlays(outCtx,targetW,targetH);
          outCanvas.toBlob(function(blob){
            let a=document.createElement('a');
            a.href=URL.createObjectURL(blob);a.download=prefix+'_'+lang+'.png';a.click();
            URL.revokeObjectURL(a.href);
            if(typeof W!=='undefined')W=origW;
            if(typeof H!=='undefined')H=origH;
            gameCanvas.width=origW;gameCanvas.height=origH;
            gameCanvas.style.width=origW+'px';gameCanvas.style.height=origH+'px';
            if(bgCanvas){bgCanvas.width=origW;bgCanvas.height=origH;bgCanvas.style.width=origW+'px';}
            resolve();
          },'image/png');
        });});
      });
      await new Promise(r=>setTimeout(r,500));
    }
    batchRunning=false;
    showNotify('\u2705 Done! '+total+' screenshots saved');
  }

  // ===== FREEZE =====
  function toggleFreeze(){
    if(typeof window._cheatFrozen==='undefined')window._cheatFrozen=false;
    window._cheatFrozen=!window._cheatFrozen;
    if(window._cheatFrozen){
      if(!window._cheatRaf)window._cheatRaf=window.requestAnimationFrame.bind(window);
      window._frozenCallbacks=[];
      window.requestAnimationFrame=function(cb){window._frozenCallbacks.push(cb);};
      showNotify('\u23F8 FROZEN (P to unfreeze)');
    } else {
      if(window._cheatRaf){window.requestAnimationFrame=window._cheatRaf;}
      window._frozenCallbacks=null;
      if(typeof loop==='function')window.requestAnimationFrame(loop);
      showNotify('\u25B6 UNFROZEN');
    }
  }

  // ===== GIF INDICATOR UPDATE =====
  function updateGifIndicator(){
    let recEl=document.getElementById('mkt-rec-indicator');
    if(recEl){
      if(gifRecording){
        let elapsed=Math.round((Date.now()-gifStartTime)/1000);
        recEl.textContent='\u{1F534} REC '+elapsed+'s ('+gifFrames.length+' frames)';
        recEl.style.display='block';
      }else{recEl.style.display='none';}
    }
  }
  setInterval(updateGifIndicator,500);

  // ===== KEY HANDLER =====
  let ctrlLPressed=false,ctrlLTimer=0;

  document.addEventListener('keydown',function(e){
    // Ctrl+Shift+9 — toggle cheat panel
    if(e.ctrlKey&&e.shiftKey&&e.code==='Digit9'){
      e.preventDefault();
      if(API.onPanelToggle)API.onPanelToggle();
      return;
    }
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;

    // Ctrl+L — start chord
    if(e.ctrlKey&&!e.shiftKey&&e.code==='KeyL'){
      e.preventDefault();ctrlLPressed=true;clearTimeout(ctrlLTimer);
      ctrlLTimer=setTimeout(()=>{ctrlLPressed=false;},1500);
      showNotify('\u2328\uFE0F Ctrl+L... press J (PC) or K (mobile)');
      return;
    }
    if(ctrlLPressed&&e.code==='KeyJ'){
      e.preventDefault();ctrlLPressed=false;clearTimeout(ctrlLTimer);
      batchScreenshots(1920,1080,'screen_pc');return;
    }
    if(ctrlLPressed&&e.code==='KeyK'){
      e.preventDefault();ctrlLPressed=false;clearTimeout(ctrlLTimer);
      batchScreenshots(1080,1920,'screen_mb');return;
    }
    // L — cycle language
    if(e.code==='KeyL'&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();cycleLang();return;}
    // J — single PC screenshot
    if(e.code==='KeyJ'&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();takeScreenshot(1920,1080,'screen_pc');return;}
    // K — single mobile screenshot
    if(e.code==='KeyK'&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();takeScreenshot(1080,1920,'screen_mb');return;}
    // O — toggle GIF
    if(e.code==='KeyO'&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();toggleGifRecording();return;}
    // P — freeze
    if(e.code==='KeyP'&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();toggleFreeze();return;}
  });

  // Sync lang index on init
  setTimeout(()=>{
    if(typeof Plat!=='undefined'&&Plat&&Plat.getLang){
      let cur=Plat.getLang();
      let idx=LANGS.indexOf(cur);
      if(idx>=0)langIdx=idx;
    }
  },100);
})();
