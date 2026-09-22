#!/usr/bin/env node
'use strict';
const assert=require('assert');
const http=require('http');
const {spawnSync}=require('child_process');
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..'), TOOL=path.join(ROOT,'tools','capacity-saturation-probe.js');
function run(args){return spawnSync(process.execPath,[TOOL,...args],{cwd:ROOT,encoding:'utf8',timeout:15000});}
function server(status,close=false){return new Promise((resolve,reject)=>{const s=http.createServer((req,res)=>{if(req.url==='/metrics'){res.writeHead(200,{'content-type':'text/plain'});return res.end('# empty metrics\n')}if(close)return req.socket.destroy();res.writeHead(status);res.end(String(status));});s.listen(0,'127.0.0.1',()=>resolve({s,url:'http://127.0.0.1:'+s.address().port}));s.on('error',reject)})}
(async()=>{
 console.log('\n▸ benchmark false-green regression');
 let r=run(['--validate','--step-seconds','0']);assert.notStrictEqual(r.status,0,'zero step duration must be rejected');
 r=run(['--validate','--warmup-seconds','-1']);assert.notStrictEqual(r.status,0,'negative warmup must be rejected');
 let x=await server(401);try{r=run(['--target',x.url,'--confirm-staging','--staircase','1','--step-seconds','1','--warmup-seconds','0']);assert.notStrictEqual(r.status,0,'all-401 benchmark must not be green')}finally{x.s.close()}
 x=await server(503);try{r=run(['--target',x.url,'--confirm-staging','--staircase','1','--step-seconds','1','--warmup-seconds','0']);assert.notStrictEqual(r.status,0,'5xx benchmark must fail')}finally{x.s.close()}
 x=await server(200,true);try{r=run(['--target',x.url,'--confirm-staging','--staircase','1','--step-seconds','1','--warmup-seconds','0']);assert.notStrictEqual(r.status,0,'transport failure benchmark must fail')}finally{x.s.close()}
 console.log('benchmark false-green regression: 5/5 PASS');
})().catch(e=>{console.error('FAIL',e.stack||e);process.exit(1)});
