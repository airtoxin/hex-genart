'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const games=require('../data/games.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'hex-strata-headless-'));
const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--allow-file-access-from-files','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
fs.mkdirSync(out,{recursive:true});
let stderr='';child.stderr.on('data',b=>stderr+=b.toString());
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map(),errors=[],network=[];
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},30000);pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r);},reject:e=>{clearTimeout(timeout);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function waitFor(expression,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await pause(100);}throw new Error('Wait timed out: '+expression);}
async function click(id){await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);}
async function change(id,value){await evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));})()`);await pause(60);}
(async()=>{
 try{
  let port;for(let i=0;i<150;i++){const f=path.join(profile,'DevToolsActivePort');if(fs.existsSync(f)){port=+fs.readFileSync(f,'utf8').split('\n')[0];break;}await pause(100);}if(!port)throw new Error('No Chrome debugging port');
  const tabs=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else{if(m.method==='Runtime.exceptionThrown')errors.push(m.params);if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);}};
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1550,height:1450,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});await waitFor('window.hexReady===true');
  const original=await evaluate('hexApp.svgText()');await click('current');await waitFor('window.hexReady===true');assert.equal((await evaluate('hexApp.getState()')).visualization,'current');await click('contour');assert.equal(await evaluate('hexApp.svgText()'),original);await click('current');await waitFor('window.hexReady===true');
  const summaries=[];
  for(let i=0;i<games.length;i++){
   if(i){await change('game',i);await waitFor('window.hexReady===true',60000);}
   const state=await evaluate('hexApp.getState()');assert.equal(state.flowFrames,games[i].events+1);assert.equal(state.step,games[i].events);assert.equal(state.visualization,'current');
   const svg=await evaluate('hexApp.svgText()');assert(!/NaN|Infinity/.test(svg));assert(!svg.includes('<circle'));assert(await evaluate("document.querySelector('#art svg').textContent.includes('SHARED ASINH WIDTH SCALE')"));
   const png=Buffer.from((await evaluate('hexApp.pngDataURL()')).split(',')[1],'base64');assert.equal(png.readUInt32BE(16),(await evaluate("HexExport.layout(document.querySelector('#art svg')).width*2")));assert.equal(png.readUInt32BE(20),(await evaluate("HexExport.layout(document.querySelector('#art svg')).height*2")));
   await click('prev');assert.equal((await evaluate('hexApp.getState()')).step,games[i].events-1);await click('next');assert.equal((await evaluate('hexApp.getState()')).step,games[i].events);
   const info=await evaluate("document.getElementById('flowInfo').textContent");summaries.push({...state,svgBytes:Buffer.byteLength(svg),pngBytes:png.length,info});console.log('Current verified',games[i].outputStem);
   if(i===6){fs.writeFileSync(path.join(out,'current-1349483-strata.svg'),svg);fs.writeFileSync(path.join(out,'current-1349483-strata.png'),png);}
   if(i===7){await click('position');const final=await evaluate("document.querySelector('#art svg').outerHTML");assert(final.includes('WHITE: BLOCKED'));assert(final.includes('BLACK: STONE CONNECTION'));assert.equal(await evaluate("document.querySelectorAll('[data-flow][data-color=\"2\"]').length"),0);await click('strata');assert(await evaluate("document.querySelectorAll('[data-flow][data-color=\"2\"]').length>0"));}
  }
  await change('game',6);await waitFor('window.hexReady===true');await change('time',120);await click('position');await evaluate("document.getElementById('board').checked=true;document.getElementById('board').dispatchEvent(new Event('input'))");await pause(100);
  assert(await evaluate("[...document.querySelectorAll('#art circle')].every(c=>+c.getAttribute('r')>=5)"));
  const before=await evaluate('hexApp.svgText()');await change('density',30);assert.notEqual(await evaluate('hexApp.svgText()'),before);await change('density',18);
  fs.writeFileSync(path.join(out,'current-1349483-step120.svg'),await evaluate('hexApp.svgText()'));fs.writeFileSync(path.join(out,'current-1349483-step120.png'),Buffer.from((await evaluate('hexApp.pngDataURL()')).split(',')[1],'base64'));
  let shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'ui-current.png'),Buffer.from(shot.data,'base64'));
  await click('all');const old=await evaluate('hexApp.svgText()');await change('history',20);assert.notEqual(await evaluate('hexApp.svgText()'),old);await change('time',0);assert.equal((await evaluate('hexApp.getState()')).step,0);assert(await evaluate("document.querySelectorAll('[data-flow]').length>0"));
  await click('play');await waitFor('hexApp.getState().step>=2',5000);await click('play');const stopped=(await evaluate('hexApp.getState()')).step;await pause(700);assert.equal((await evaluate('hexApp.getState()')).step,stopped);
  await evaluate("window.exportEvents=[];document.addEventListener('click',e=>{if(e.target instanceof HTMLAnchorElement&&e.target.download){e.preventDefault();exportEvents.push({filename:e.target.download,href:e.target.href});}},true)");await click('svg');await click('png');await waitFor('exportEvents.length===2');assert((await evaluate('exportEvents')).every(e=>e.filename.startsWith('hex-current-')&&e.href.startsWith('blob:')));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await pause(100);assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'ui-current-mobile.png'),Buffer.from(shot.data,'base64'));
  assert.equal(errors.length,0);const external=network.filter(u=>/^https?:/.test(u));assert.equal(external.length,0);
  const result={testedAt:new Date().toISOString(),browser:await send('Browser.getVersion'),games:summaries,checks:['contour output unchanged after mode round trip','all eight current games calculate and SVG/PNG export','per-game previous and next','shared scale legend','no empty-cell dots','actual connection versus blocked flow','strata retains earlier flow of losing colour','position and timeline','density changes drawing only','history opacity','empty-board flow','autoplay starts and stops','current SVG/PNG export buttons and filenames','mobile 390px no overflow','no runtime exception','no HTTP requests'],errors,externalRequests:external};fs.writeFileSync(path.join(out,'current-browser-validation.json'),JSON.stringify(result,null,2));console.log('PASS current browser',result.checks.length,'checks');
 }finally{if(ws?.readyState===1){await send('Browser.close').catch(()=>{});ws.close();}else child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});