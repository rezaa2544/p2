'use strict';
const fs=require('fs'),vm=require('vm'),acorn=require('acorn'),walk=require('acorn-walk');
const file='/home/user/p2/tests/smoke.js',source=fs.readFileSync(file,'utf8');
const tree=acorn.parse(source,{ecmaVersion:'latest',locations:true});let wrapper,call;
walk.simple(tree,{FunctionDeclaration(n){if(n.id?.name==='test')wrapper=source.slice(n.start,n.end)},CallExpression(n){if(n.callee.type==='Identifier'&&n.callee.name==='test'&&n.loc.start.line===640)call=source.slice(n.start,n.end)}});
if(!wrapper||!call)throw Error('exact wrapper/callback extraction failed');
(async()=>{for(const present of [false,true]){
 const logs=[];let assertions=0;
 const context={setTimeout,console:{log:(...x)=>logs.push(x.join(' '))},W:(s)=>s==='window.__sy'?(present?42:null):s==='S.user.school_id'?1:undefined,assert:(condition,message)=>{assertions++;if(!condition)throw Error(message||'fixture negative control')}};
 const result=await vm.runInNewContext('(async()=>{let pass=0,fail=0,errors=[],testQueue=[],__seq=Promise.resolve();\n'+wrapper+'\n'+call+'; await __seq; return {pass,fail,errors};})()',context);
 console.log(JSON.stringify({source:file,wrapper_lines:'33-60',callback_line:640,missing_fixture:!present,assertions,...result,logs,scope:'isolated exact production-test wrapper/callback; W is controlled fixture, not full app execution'}));
 if(!present&&!(result.pass===1&&result.fail===0&&assertions===0))process.exitCode=1;
 if(present&&result.fail!==1)process.exitCode=1;
}})().catch(e=>{console.error(e);process.exitCode=1});
