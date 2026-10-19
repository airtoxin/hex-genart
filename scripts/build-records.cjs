'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),C=require('../src/core.js'),{decodeLG}=require('./lib/littlegolem.cjs');
const root=path.resolve(__dirname,'..'),sources=require('../data/sources.json'),logs=JSON.parse(fs.readFileSync(path.join(root,'data/fetch-log.json'),'utf8')),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const games=sources.map(record=>{
 const originalPath='data/raw/'+record.file,bytes=fs.readFileSync(path.join(root,originalPath));if(sha(bytes)!==record.sha256)throw Error('Source hash mismatch: '+record.file);
 const original=bytes.toString('utf8').replace(/^\uFEFF/,''),sgf=record.sourceKind==='littlegolem'?decodeLG(original).sgf:original,g=C.readGame(sgf),comment=g.root.C?.[0]||'';
 for(const [key,actual]of Object.entries({size:g.n,placements:g.placements,events:g.moves.length,swaps:g.swaps}))if(actual!==record[key])throw Error(key+' mismatch: '+record.file);
 const ending=g.stopReason==='resign'?'resign':g.actual.black||g.actual.white?'connection':g.stopReason;if(ending!==record.ending)throw Error('Ending mismatch');
 const black=g.root.PB?.[0]||/Black:\s*([^\n]+)/.exec(comment)?.[1]||'Black',white=g.root.PW?.[0]||/White:\s*([^\n]+)/.exec(comment)?.[1]||'White';
 return {...record,originalPath,sgf,sgfSha256:sha(sgf),title:black+' × '+white,retrieved:logs.find(x=>x.file===record.file).retrieved,event:g.root.EV?.[0],terminalReason:g.stopReason,variations:g.variations,mainlineCommentNodes:g.commentCount,actualConnection:g.actual};
});
fs.writeFileSync(path.join(root,'data/games.js'),'/* Locally fetched records. Do not redistribute without checking source terms. */\nconst HEX_GAMES='+JSON.stringify(games)+';\nif(typeof module!=="undefined")module.exports=HEX_GAMES;\n');
fs.writeFileSync(path.join(root,'data/selected.json'),JSON.stringify(games.map(({sgf,...rest})=>rest),null,2));
console.log('Built',games.length,'verified local records. Open index.html.');