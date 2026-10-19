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
  let port;for(let i=0;i<150;i++){const f=path.join(profile,'DevToolsActivePort');if(fs.existsSync(f)){port=+fs.readFileSync(f,'utf8').split('\n')[0];break;}await pause(100);}if(!port)throw new Error('No Chrome debugging port: '+stderr.slice(-1000));
  const tabs=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else{if(m.method==='Runtime.exceptionThrown')errors.push(m.params);if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);}};
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1550,height:1450,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});await waitFor('window.hexReady===true');
  const initial=await evaluate('hexApp.getState()');assert.equal(initial.n,23);assert.equal(initial.step,89);console.log('Loaded',initial);
  let shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'ui-desktop.png'),Buffer.from(shot.data,'base64'));
  const summaries=[];
  for(let i=0;i<games.length;i++){
   if(i){await change('game',i);await waitFor('window.hexReady===true');}
   const state=await evaluate('hexApp.getState()');assert.equal(state.ready,true);assert.equal(state.fields,state.moves+1);assert.equal(state.step,state.moves);const stem=games[i].outputStem;assert.equal(state.placements,games[i].placements);assert.equal(state.moves,games[i].events);
   const labels=await evaluate("({meta:document.getElementById('meta').textContent,source:document.getElementById('source').href,sourceInfo:document.getElementById('sourceInfo').textContent,connection:document.getElementById('connection').textContent})");assert(labels.meta.includes(games[i].ending==='connection'?'実連結で終局':'投了で終局'));assert.equal(labels.source,games[i].url);assert(labels.sourceInfo.includes(games[i].collectionLabel));if(games[i].ending==='connection')assert(labels.connection.includes('黒 完成'));
   await click('prev');assert.equal((await evaluate('hexApp.getState()')).step,games[i].events-1);await click('next');assert.equal((await evaluate('hexApp.getState()')).step,games[i].events);
   await change('time',Math.floor(games[i].events/2));assert.equal((await evaluate('hexApp.getState()')).step,Math.floor(games[i].events/2));await click('all');
   const svg=await evaluate('hexApp.svgText()');assert(!/NaN|Infinity/.test(svg));fs.writeFileSync(path.join(out,stem+'.svg'),svg);
   const png=await evaluate('hexApp.pngDataURL()');const bytes=Buffer.from(png.split(',')[1],'base64');assert.equal(bytes.readUInt32BE(16),(await evaluate("HexExport.layout(document.querySelector('#art svg')).width*2")));assert.equal(bytes.readUInt32BE(20),(await evaluate("HexExport.layout(document.querySelector('#art svg')).height*2")));fs.writeFileSync(path.join(out,stem+'.png'),bytes);summaries.push({...state,stem,labels,svgBytes:Buffer.byteLength(svg),pngBytes:bytes.length});console.log('Rendered',stem);
   if(i===games.length-1){shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'ui-long-game.png'),Buffer.from(shot.data,'base64'));}
  }
  await change('game',3);await waitFor('window.hexReady===true');
  await click('prev');assert.equal((await evaluate('hexApp.getState()')).step,99);await click('next');assert.equal((await evaluate('hexApp.getState()')).step,100);
  await change('time',2);assert.equal((await evaluate('hexApp.getState()')).step,2);await click('position');assert.equal((await evaluate('hexApp.getState()')).mode,'position');
  const before=await evaluate('hexApp.svgText()');await change('density',30);assert.notEqual(await evaluate('hexApp.svgText()'),before);
  await evaluate("document.getElementById('board').checked=true;document.getElementById('board').dispatchEvent(new Event('input'))");await pause(100);const stoneOverlay=await evaluate("(()=>{const circles=[...document.querySelectorAll('#art circle')],g=HexCore.readGame(HEX_GAMES[hexApp.getState().index].sgf),frame=g.frames[hexApp.getState().step],svg=hexApp.svgText(),exported=new DOMParser().parseFromString(svg,'image/svg+xml');return {stones:circles.filter(c=>c.getAttribute('r')==='5').length,occupied:frame.board.filter(Boolean).length,radii:circles.map(c=>+c.getAttribute('r')),exportCircles:exported.querySelectorAll('circle').length,screenCircles:circles.length};})()");
  assert.equal(stoneOverlay.stones,stoneOverlay.occupied);assert.equal(stoneOverlay.occupied,1);assert(stoneOverlay.radii.every(r=>r===5||r===9));assert.equal(stoneOverlay.exportCircles,stoneOverlay.screenCircles);
  const overlayPng=Buffer.from((await evaluate('hexApp.pngDataURL()')).split(',')[1],'base64');assert.equal(overlayPng.readUInt32BE(16),(await evaluate("HexExport.layout(document.querySelector('#art svg')).width*2")));assert.equal(overlayPng.readUInt32BE(20),(await evaluate("HexExport.layout(document.querySelector('#art svg')).height*2")));stoneOverlay.pngBytes=overlayPng.length;
  await click('all');assert.equal((await evaluate('hexApp.getState()')).step,100);assert.equal((await evaluate('hexApp.getState()')).mode,'strata');
  const old=await evaluate('hexApp.svgText()');await change('history',20);assert.notEqual(await evaluate('hexApp.svgText()'),old);
  await click('play');await waitFor('hexApp.getState().step>=2',5000);await click('play');const stopped=(await evaluate('hexApp.getState()')).step;await pause(700);assert.equal((await evaluate('hexApp.getState()')).step,stopped);
  await evaluate("window.exportEvents=[];document.addEventListener('click',e=>{if(e.target instanceof HTMLAnchorElement&&e.target.download){e.preventDefault();exportEvents.push({filename:e.target.download,href:e.target.href});}},true)");
  await click('svg');await click('png');await waitFor('exportEvents.length===2');const exportEvents=await evaluate('exportEvents');assert(exportEvents[0].filename.endsWith('.svg'));assert(exportEvents[1].filename.endsWith('.png'));assert(exportEvents.every(e=>e.href.startsWith('blob:')));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await pause(150);assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'ui-mobile.png'),Buffer.from(shot.data,'base64'));
  assert.equal(errors.length,0);const external=network.filter(u=>/^https?:/.test(u));assert.equal(external.length,0);
  const result={testedAt:new Date().toISOString(),browser:await send('Browser.getVersion'),page:'file:// index.html',games:summaries,stoneOverlay,checks:['all eight games load and export','correct counts and source labels for all games','resignation versus actual connection ending','per-game step back/forward and timeline replay','switch back to cached original game','step back/forward','timeline slider','single-position / strata switch','density changes geometry','history changes opacity','stone overlay without empty-cell dots in screen/SVG/PNG','all-game button','autoplay start/stop','SVG/PNG export buttons','PNG twice cropped SVG dimensions','mobile 390px no overflow','no runtime exception','no HTTP requests'],errors,externalRequests:external};
  fs.writeFileSync(path.join(out,'browser-validation.json'),JSON.stringify(result,null,2));console.log('PASS browser',result.checks.length,'checks; no external requests.');
 }finally{if(ws?.readyState===1){await send('Browser.close').catch(()=>{});ws.close();}else child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
