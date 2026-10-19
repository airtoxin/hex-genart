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
  const cases=[{game:0,visualization:'contour',mode:'strata',board:false},{game:1,visualization:'contour',mode:'position',step:30,board:true},{game:6,visualization:'current',mode:'strata',board:false},{game:7,visualization:'current',mode:'position',step:172,board:true}],results=[];
  fs.mkdirSync(path.join(out,'exports'),{recursive:true});
  for(const spec of cases){
   await change('game',spec.game);await waitFor('window.hexReady===true',60000);await click(spec.visualization);await waitFor('window.hexReady===true',60000);
   await change('time',spec.step??games[spec.game].events);await click(spec.mode);await evaluate("document.getElementById('board').checked="+spec.board+";document.getElementById('board').dispatchEvent(new Event('input'))");await pause(100);
   const result=await evaluate(`(async()=>{
    const live=document.querySelector('#art svg'),before=live.outerHTML,layout=HexExport.layout(live),svg=hexApp.svgText(),doc=new DOMParser().parseFromString(svg,'image/svg+xml'),exported=doc.documentElement;
    const summary=exported.querySelector('[data-export="summary"]'),art=exported.querySelector('[data-export="art"]'),liveSummary=live.querySelector('[data-export="summary"]'),copy=summary.cloneNode(true);copy.removeAttribute('transform');
    const size={width:+exported.getAttribute('width'),height:+exported.getAttribute('height')},text=[...exported.querySelectorAll('text')].map(t=>t.textContent),sourceText=[...liveSummary.querySelectorAll('text')].map(t=>t.textContent),box=liveSummary.getBBox();
    const png=await hexApp.pngDataURL(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();let identical;
    try{await new Promise((r,j)=>{image.onload=r;image.onerror=j;image.src=url;});const canvas=document.createElement('canvas');canvas.width=size.width*2;canvas.height=size.height*2;canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);identical=canvas.toDataURL('image/png')===png;}finally{URL.revokeObjectURL(url);}
    return {svg,png,size,layout,text,sourceText,pixelIdentical:identical,artUnchanged:art.isEqualNode(live.querySelector('[data-export="art"]')),summaryUnchanged:copy.isEqualNode(liveSummary),screenUnchanged:before===live.outerHTML,summaryWithinBounds:box.x+layout.summaryX>=layout.x&&box.y+layout.summaryY>=layout.y&&box.x+box.width+layout.summaryX<=layout.x+layout.width&&box.y+box.height+layout.summaryY<=layout.y+layout.height,visibleSections:exported.querySelectorAll('[data-export]').length};
   })()`);
   assert(result.pixelIdentical);assert(result.artUnchanged);assert(result.summaryUnchanged);assert(result.screenUnchanged);assert(result.summaryWithinBounds);assert.equal(result.visibleSections,2);assert.equal(result.text.length,3);assert.deepEqual(result.text,result.sourceText);assert(result.size.width<1400);assert(result.size.height<1300);
   const png=Buffer.from(result.png.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),result.size.width*2);assert.equal(png.readUInt32BE(20),result.size.height*2);const stem=spec.visualization+'-'+spec.mode;fs.writeFileSync(path.join(out,'exports',stem+'.svg'),result.svg);fs.writeFileSync(path.join(out,'exports',stem+'.png'),png);
   const {svg,png:ignored,...evidence}=result;results.push({...spec,...evidence,svgBytes:Buffer.byteLength(svg),pngBytes:png.length});console.log('PASS export',stem,result.size);
  }
  await evaluate("window.exportsClicked=[];document.addEventListener('click',e=>{if(e.target instanceof HTMLAnchorElement&&e.target.download){e.preventDefault();exportsClicked.push(e.target.download);}},true)");await click('svg');await click('png');await waitFor('exportsClicked.length===2');assert.equal(errors.length,0);assert.equal(network.filter(u=>/^https?:/.test(u)).length,0);
  fs.writeFileSync(path.join(out,'export-validation.json'),JSON.stringify({testedAt:new Date().toISOString(),browser:await send('Browser.getVersion'),cases:results,exportButtons:true,errors,externalRequests:[]},null,2));console.log('PASS all cropped exports');
 }finally{if(ws?.readyState===1){await send('Browser.close').catch(()=>{});ws.close();}else child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
