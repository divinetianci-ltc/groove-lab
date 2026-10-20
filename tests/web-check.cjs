// Run after build.py and build_web.py; validates the deployed small-file format.
const assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=path.resolve(__dirname,'../../groove-lab-web'),zip=path.resolve(__dirname,'../../groove-lab-mainroom.zip');
async function main(){
  let marker='',audioFailures=false;
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.replace(/^\/groove-lab\//,'')||'index.html',file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||(audioFailures&&name.startsWith('audio/'))){res.writeHead(404);res.end();return}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    if(name==='index.html')res.end(fs.readFileSync(file,'utf8').replace('<head>',`<head><meta name="test-network-marker" content="${marker}">`));else fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/groove-lab/`;
  const browser=await chromium.launch({headless:true,...(process.env.GROOVE_BROWSER_EXECUTABLE?{executablePath:process.env.GROOVE_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
  try{
    for(const width of [1440,375]){
      const context=await browser.newContext({viewport:{width,height:900},isMobile:width<760,hasTouch:width<760}),page=await context.newPage(),errors=[];let audioRequests=0;
      page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/audio/'))audioRequests++});
      await page.goto(base);assert.equal(await page.locator('.cell').count(),128);assert.equal(audioRequests,0,'the editor must open without downloading audio');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const press=async s=>width<760?await page.locator(s).tap():await page.locator(s).click();
      await press('[data-rhythm="3"]');await press('.cell[data-lane="kick"][data-tick="0"]');await press('#rollMode');await press('.cell[data-lane="snare"][data-tick="12"]');
      await press('#copyBarsToggle');await press('.copy-target[data-target="all"]');await press('#closeBarCopy');assert.equal(await page.evaluate(()=>data.rolls.snare[156]),true);
      await press('#play');await page.waitForFunction(()=>playing&&sampleCount()===24,{},{timeout:20000});await press('#play');
      assert.equal(audioRequests,35);assert(await page.evaluate(()=>Object.values(sampleBuffers).flat().filter(Boolean).every(b=>b.numberOfChannels===2)));
      await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      marker='updated';await page.reload();assert.equal(await page.locator('meta[name="test-network-marker"]').getAttribute('content'),marker);
      await context.setOffline(true);await page.reload();assert.equal(await page.evaluate(()=>data.kick[0]),2);await press('#play');await page.waitForFunction(()=>playing&&sampleCount()===24,{},{timeout:15000});await press('#play');
      assert.deepEqual(errors,[]);console.log(`${width}px web: lightweight editor, touch/click, copy, Double, 24 stereo samples, online update and offline playback passed.`);
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,acceptDownloads:true}),page=await context.newPage();
    await page.goto(base+'download.html');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const pending=page.waitForEvent('download');await page.locator('#download').tap();const download=await pending;assert.equal(download.suggestedFilename(),'groove-lab-mainroom.zip');
    const actual=fs.readFileSync(await download.path()),expected=fs.readFileSync(zip);assert(actual.equals(expected),'downloaded ZIP must exactly match the tested offline package');
    console.log('Download page: ZIP reconstructed and SHA-256 verified:',crypto.createHash('sha256').update(actual).digest('hex'));
    await context.close();
    // A missing asset must produce a visible warning, never count as a loaded recording.
    audioFailures=true;const broken=await browser.newContext(),failed=await broken.newPage();await failed.goto(base);await failed.locator('#play').click();await failed.waitForFunction(()=>!starting);assert.equal(await failed.evaluate(()=>sampleCount()),0);assert.match(await failed.locator('#soundMessage').textContent(),/24 个采样无法解码/);await broken.close();
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
