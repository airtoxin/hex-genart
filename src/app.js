/* Runs from file://, without a server, package install, or network request. */
'use strict';
const $=id=>document.getElementById(id),C=HexCore,A=HexArt,F=HexFlow,FA=HexCurrentArt;
let visualization='contour',flowFields=[],active,game,fields=[],paths=new Map(),step=0,mode='strata',timer=null,loadToken=0,ready=false,renderQueued=false;
const fieldCache=new Map(),flowCache=new Map();
const records=typeof HEX_GAMES==='undefined'?[]:HEX_GAMES;
for(const [i,g]of records.entries()){const o=document.createElement('option');o.value=i;o.textContent=`${g.date} · ${g.title}`;$('game').append(o);}
function stop(){if(timer)clearInterval(timer);timer=null;$('play').textContent='自動再生';}
function render(){
 if(!ready)return;
 const opts={step,history:+$('history').value/100,density:+$('density').value,board:$('board').checked,mode,paths};
 $('art').innerHTML=visualization==='current'?FA.buildSVG(game,active,flowFields,opts):A.buildSVG(game,active,fields,opts);
 const pair=flowFields[step],ref=visualization==='current'?F.reference(game.n):1;
 $('flowInfo').hidden=visualization!=='current';
 if(visualization==='current')$('flowInfo').textContent='盤全体の通りやすさ（空盤=1）：黒 '+(pair[0].conductance/ref).toFixed(2)+' / 白 '+(pair[1].conductance/ref).toFixed(2)+'。描画した電流：黒 '+Math.round(100*FA.coverage(pair[0],opts.density))+'% / 白 '+Math.round(100*FA.coverage(pair[1],opts.density))+'%。数値は現在局面。積層には過去の流れも残ります。';
 $('densityLabel').textContent=visualization==='current'?'流線の密度':'線密度';
 $('time').value=step;$('step').textContent=`${step} / ${game.moves.length}`;
 const m=game.frames[step].move;$('event').textContent=m?`${m.color===1?'黒':'白'} · ${m.type==='resign'?'投了':m.raw}`:'開始局面';
 const b=game.frames[step].board,black=C.connected(b,game.n,1),white=C.connected(b,game.n,2);
 $('connection').textContent=`実際の石の連結：黒 ${black?'完成':'未完成'} / 白 ${white?'完成':'未完成'}`;
 $('comment').textContent=((game.root.C||[]).join('\n')||'この棋譜には原文コメントがありません。')+(m?.comment?'\n\nこの手の原文コメント：\n'+m.comment:'');
 $('historyValue').textContent=$('history').value+'%';$('densityValue').textContent=$('density').value;
 $('prev').disabled=step===0;$('next').disabled=step===game.moves.length;
 if(step===game.moves.length&&(black||white))$('event').textContent+=' / 連結完成';
 $('status').textContent=(visualization==='current'?'電流 / ':'')+(mode==='strata'?`${step} 手順の地層`:visualization==='current'?'現在局面の流れ':'現在局面の等電位線');
}
function schedule(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
async function load(index){
 const token=++loadToken;stop();ready=false;active=records[index];game=C.readGame(active.sgf);paths=new Map();step=game.moves.length;
 const ending=game.stopReason==='resign'?'投了で終局':game.actual.black||game.actual.white?'実連結で終局':'記録終端';
 $('meta').textContent=`${game.n} × ${game.n} / 着石 ${game.placements} / swap ${game.swaps} / ${ending}`;
 $('sourceInfo').textContent=`${active.collectionLabel}${active.event?' · '+active.event+' · #'+active.id:''}。取得 ${active.retrieved.slice(0,10)} · 主譜 ${game.moves.length} 手順。検討分岐 ${game.variations} 個は表示対象外。${game.excludedTrailingNodes} 個の終局後ノードを除外。`;
 $('source').href=active.url;$('time').max=game.moves.length;
 document.querySelectorAll('button,input').forEach(el=>el.disabled=true);
 if(fieldCache.has(index))fields=fieldCache.get(index);
 else{fields=[];for(let t=0;t<game.frames.length;t++){if(token!==loadToken)return;fields.push(A.prepareFrame(game.frames[t],game.n));if(t%4===0){$('status').textContent=`地層を計算中 ${t} / ${game.moves.length}`;await new Promise(r=>setTimeout(r,0));}}fieldCache.set(index,fields);}
 if(visualization==='current')await prepareFlow(token);
 if(token!==loadToken)return;document.querySelectorAll('button,input').forEach(el=>el.disabled=false);ready=true;render();window.hexReady=true;
}
async function prepareFlow(token){const index=+$('game').value;if(flowCache.has(index)){flowFields=flowCache.get(index);return;}const calculated=[];for(let t=0;t<game.frames.length;t++){if(token!==loadToken)return;calculated.push(F.prepareFrame(game.frames[t],game.n,true));if(t%3===0){$('status').textContent='電流を計算中 '+t+' / '+game.moves.length;await new Promise(r=>setTimeout(r,0));}}flowFields=calculated;flowCache.set(index,calculated);}
 for(const id of ['contour','current'])$(id).onclick=async()=>{try{if(!ready)return;stop();visualization=id;for(const key of ['contour','current']){$(key).classList.toggle('selected',key===id);$(key).setAttribute('aria-pressed',String(key===id));}if(id==='current'){ready=false;window.hexReady=false;document.querySelectorAll('button,input').forEach(el=>el.disabled=true);const token=loadToken;await prepareFlow(token);if(token!==loadToken)return;document.querySelectorAll('button,input').forEach(el=>el.disabled=false);ready=true;window.hexReady=true;}render();}catch(e){showError(e);}};
 $('game').onchange=()=>{window.hexReady=false;load(+$('game').value).catch(showError);};
$('time').oninput=()=>{stop();step=+$('time').value;schedule();};
$('prev').onclick=()=>{stop();step=Math.max(0,step-1);render();};$('next').onclick=()=>{stop();step=Math.min(game.moves.length,step+1);render();};$('all').onclick=()=>{stop();step=game.moves.length;mode='strata';setMode();render();};
$('play').onclick=()=>{if(timer){stop();return;}if(step===game.moves.length)step=0;render();$('play').textContent='停止';timer=setInterval(()=>{step=Math.min(game.moves.length,step+1);render();if(step===game.moves.length)stop();},550);};
function setMode(){for(const id of ['strata','position']){$(id).classList.toggle('selected',mode===id);$(id).setAttribute('aria-pressed',String(mode===id));}}
for(const id of ['strata','position'])$(id).onclick=()=>{mode=id;setMode();render();};
for(const id of ['history','density','board'])$(id).oninput=schedule;
function download(blob,extension){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`hex-${visualization==='current'?'current':'strata'}-${active.date}-${step}-${mode}.${extension}`;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function svgText(){return new XMLSerializer().serializeToString($('art').firstElementChild);}
$('svg').onclick=()=>download(new Blob([svgText()],{type:'image/svg+xml'}),'svg');
$('png').onclick=async()=>{try{$('status').textContent='PNG を書き出しています';const canvas=await rasterize();canvas.toBlob(blob=>{if(!blob){showError(new Error('PNG encode failed'));return;}download(blob,'png');render();},'image/png');}catch(e){showError(e);}};
async function rasterize(){const svg=svgText(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});const canvas=document.createElement('canvas');canvas.width=2800;canvas.height=2600;canvas.getContext('2d').drawImage(img,0,0,2800,2600);URL.revokeObjectURL(url);return canvas;}
function showError(e){$('status').textContent='エラー: '+(e?.message||e);console.error(e);}
window.hexApp={getState:()=>({index:+$('game').value,ready,step,mode,visualization,flowFrames:flowFields.length,n:game.n,moves:game.moves.length,placements:game.placements,fields:fields.length}),svgText,pngDataURL:async()=>(await rasterize()).toDataURL('image/png')};
if(records.length)load(0).catch(showError);else{document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);$('status').textContent='棋譜データを取得してください';$('art').textContent='初回は python scripts/fetch-selected.py と node scripts/build-records.cjs を実行し、再読み込みしてください。';}
