// Optional real Chromium check: npm install playwright; set GROOVE_BROWSER_EXECUTABLE if needed.
const assert=require('assert'),path=require('path'),fs=require('fs'),http=require('http'),{pathToFileURL}=require('url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
async function main(){
  const browser=await chromium.launch({headless:true,...(process.env.GROOVE_BROWSER_EXECUTABLE?{executablePath:process.env.GROOVE_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
  try{for(const [width,height] of (process.env.GROOVE_TEST_VIEWPORTS?JSON.parse(process.env.GROOVE_TEST_VIEWPORTS):[[1440,1000],[375,812],[390,844],[320,740],[740,375]])){
    const mobile=width<760,context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const started=Date.now();await page.goto(url,{waitUntil:'load'});
    assert.equal(await page.locator('.cell').count(),128);
    assert.equal(await page.evaluate(()=>encodedSampleBank===null&&Object.values(sampleRecords).every(r=>!r.bytes)),true);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the page must fit its viewport');
    if(mobile){
      assert.equal(await page.locator('#playerDock').evaluate(el=>getComputedStyle(el).position),'fixed');
      assert.equal(await page.locator('#rangeButtons').isVisible(),false,'half-beat settings start collapsed');
      assert(await page.locator('.cell').first().evaluate(el=>el.getBoundingClientRect().width>=44&&el.getBoundingClientRect().height>=44));
      if(height>500)assert(await page.locator('#timelineScroll').evaluate(el=>el.getBoundingClientRect().top<innerHeight*.75),'editing starts higher on a phone');
    }
    const press=async selector=>{const target=page.locator(selector);await(mobile?target.tap():target.click())};
    await press('.cell[data-lane="kick"][data-tick="0"]');
    assert.equal(await page.locator('.cell[data-lane="kick"][data-tick="0"]').getAttribute('data-v'),'0');
    await press('[data-rhythm="4"]');
    for(const tick of [0,12,24,36]){
      const selector=`.cell[data-lane="kick"][data-tick="${tick}"]`;
      for(const value of ['2','3','1','0']){await press(selector);assert.equal(await page.locator(selector).getAttribute('data-v'),value)}
    }
    assert.deepEqual(await page.evaluate(()=>beats.slice(0,4).map(c=>c.div)),[4,4,4,4]);
    assert.equal(await page.evaluate(()=>beats[4].div),0);
    await press('#rollMode');await press('.cell[data-lane="snare"][data-tick="12"]');
    assert.equal(await page.evaluate(()=>data.rolls.snare[12]),true);
    await press('#copyBarsToggle');await press('.copy-target[data-target="all"]');
    assert.equal(await page.evaluate(()=>data.rolls.snare[156]),true);
    await press('#closeBarCopy');
    if(mobile){
      await page.locator('#timelineScroll').scrollIntoViewIfNeeded();
      const session=await context.newCDPSession(page),r=await page.locator('#timelineScroll').boundingBox(),dock=await page.locator('#playerDock').boundingBox(),before=await page.locator('#timelineScroll').evaluate(el=>el.scrollLeft);
      const x=r.x+r.width-25,y=(Math.max(0,r.y)+Math.min(r.y+r.height,dock.y))/2;
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*20,y}]});await page.waitForTimeout(16)}
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      try{await page.waitForFunction(previous=>document.getElementById('timelineScroll').scrollLeft>previous+10,before,{timeout:5000})}catch(error){console.log('Swipe diagnostic',{width,height,r,dock,x,y,before,after:await page.locator('#timelineScroll').evaluate(el=>el.scrollLeft),hit:await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,160),{x,y})});throw error}
      await page.evaluate(()=>new Promise(resolve=>{const el=document.getElementById('timelineScroll');let timer;const done=()=>{el.removeEventListener('scroll',settle);resolve()},settle=()=>{clearTimeout(timer);timer=setTimeout(done,160)};el.addEventListener('scroll',settle);settle()}));
    }
    await press('.bar-jump[data-bar="3"]');try{await page.waitForFunction(()=>document.getElementById('timelineScroll').scrollLeft>300,{},{timeout:5000})}catch(error){console.log('Jump diagnostic',await page.evaluate(()=>({selectedBeat,left:document.getElementById('timelineScroll').scrollLeft,head:document.getElementById('barHead-3').getBoundingClientRect().toJSON(),scroll:document.getElementById('timelineScroll').getBoundingClientRect().toJSON()})));throw error}
    await press('#beat-12');await press('[data-rhythm="3"]');
    await press('.cell[data-lane="rack2"][data-tick="144"]');
    assert.equal(await page.evaluate(()=>data.rack2[144]),2);
    if(mobile){
      await press('#scopeToggle');assert.equal(await page.locator('#rangeButtons').isVisible(),true);
      await press('[data-range="left"]');await press('[data-rhythm="4"]');
      assert.equal(await page.locator('#scopeToggle').textContent(),'前半拍 · 选项');
      await press('[data-range="beat"]');await press('#scopeToggle');
      assert.equal(await page.locator('#rangeButtons').isVisible(),false);
    }
    await press('#play');await page.waitForFunction(()=>playing&&sampleCount()===24,{},{timeout:15000});
    assert.equal(await page.evaluate(()=>Object.values(sampleBuffers).flat().filter(Boolean).every(b=>b.numberOfChannels===2&&b.duration>0&&b.duration<=12)),true);
    await press('#play');assert.equal(await page.evaluate(()=>playing),false);
    await page.reload();assert.equal(await page.evaluate(()=>data.rack2[144]),2);
    assert.equal(await page.evaluate(()=>data.rolls.snare[156]),true);
    assert.deepEqual(errors,[]);
    console.log(`${width}x${height}: loaded, dock, touch targets, half-beat fold, tap/click, Double, copy, scroll, 24 audio buffers and reload passed (${Date.now()-started} ms total)`);
    await context.close();
  }
  let marker='',server;
  const root=path.resolve(__dirname,'..'),allowed=new Set(['index.html','sw.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png']);
  try{
    server=http.createServer((req,res)=>{
      const name=new URL(req.url,'http://localhost').pathname.replace(/^\/groove-lab\//,'')||'index.html';
      if(!allowed.has(name)){res.writeHead(404);res.end();return}
      const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(name)];
      res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-cache');
      if(name==='index.html')res.end(fs.readFileSync(path.join(root,name),'utf8').replace('<head>',`<head><meta name="test-network-marker" content="${marker}">`));else fs.createReadStream(path.join(root,name)).pipe(res);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true}),page=await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/groove-lab/`);
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.locator('[data-rhythm="3"]').tap();await page.locator('.cell[data-lane="kick"][data-tick="0"]').tap();
    await page.locator('#play').tap();await page.waitForFunction(()=>playing&&sampleCount()===24,{},{timeout:15000});await page.locator('#play').tap();
    marker='new-network-version';await page.reload();
    assert.equal(await page.locator('meta[name="test-network-marker"]').getAttribute('content'),marker,'online navigation must load a newer version');
    assert.equal(await page.evaluate(()=>data.kick[0]),2);
    await context.setOffline(true);await page.reload();assert.equal(await page.evaluate(()=>data.kick[0]),2);
    await page.locator('#play').tap();await page.waitForFunction(()=>playing&&sampleCount()===24,{},{timeout:15000});await page.locator('#play').tap();
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert(manifest.icons.some(i=>i.sizes==='192x192'));assert(manifest.icons.some(i=>i.sizes==='512x512'));
    console.log('Project path /groove-lab/: service worker, new online version, saved rhythm, offline reload and 24-buffer playback passed.');
    await context.close();
  }finally{if(server)await new Promise(resolve=>server.close(resolve))}
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
