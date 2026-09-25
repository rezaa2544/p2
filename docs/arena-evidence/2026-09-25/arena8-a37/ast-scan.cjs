'use strict';
const fs=require('fs'),path=require('path'),acorn=require('acorn'),walk=require('acorn-walk');
const root=process.argv[2], files=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),out={};
const checks=/^(assert\w*|expect\w*|chk|check\w*|ok|eq|equal|strictEqual|deepEqual|deepStrictEqual|notEqual|throws|rejects|verify\w*|ensure\w*)$/i;
for(const file of files){if(!/\.(?:[cm]?js)$/.test(file))continue;let s;try{s=fs.readFileSync(path.join(root,file),'utf8')}catch{continue}
 let ast,comments=[];try{ast=acorn.parse(s,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true,locations:true,onComment:comments})}catch(e){comments=[];try{ast=acorn.parse(s,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true,locations:true,onComment:comments})}catch(e2){out[file]={error:e2.message};continue}}
 const f={checks:[],throws:[],calls:[],markers:[],references:[],comments:comments.map(c=>[c.start,c.end]),strings:[]};
 const name=n=>n?.type==='Identifier'?n.name:n?.type==='MemberExpression'?name(n.object)+'.'+(n.property.name||n.property.value):'';
 const mark=(kind,n,detail)=>f.markers.push({kind,line:n.loc.start.line,start:n.start,end:n.end,detail});
 walk.simple(ast,{
  Literal(n){if(typeof n.value==='string'){f.strings.push([n.start,n.end]);if(/\.(?:[cm]?js|sh)$/.test(n.value)||n.value.startsWith('tests/')||n.value.startsWith('./')||n.value.startsWith('../'))f.references.push({value:n.value,line:n.loc.start.line})}},
  TemplateLiteral(n){f.strings.push([n.start,n.end])},
  ThrowStatement(n){f.throws.push(n.loc.start.line)},
  CatchClause(n){if(n.body.body.length===0)mark('swallowed catch',n,'empty catch body');else if(!/\b(?:throw|reject|fail\w*|process\.exit|console\.(?:error|warn)|audit\w*)\b/.test(s.slice(n.body.start,n.body.end)))mark('swallowed catch',n,'nonempty catch without recognized escalation (review required)')},
  BinaryExpression(n){if(n.operator==='/'&&n.left.type==='Literal'&&n.left.value===0&&n.right.type==='Literal'&&n.right.value===0)mark('0/0',n,'executable zero divided by zero; possibly intentional NaN fixture')},
  LogicalExpression(n){if(n.operator==='||'&&n.right.type==='Literal'&&n.right.value===true)mark('|| true',n,'JavaScript truthy fallback; not shell status masking')},
  CallExpression(n){const full=name(n.callee),last=full.split('.').pop();f.calls.push({name:full,line:n.loc.start.line});if(checks.test(last)||full.startsWith('assert.'))f.checks.push({name:full,line:n.loc.start.line});
    if(full==='assert'&&n.arguments[0]?.type==='Literal'&&n.arguments[0].value===true)mark('assert(true)',n,'executable constant assertion');
    if(full==='process.exit'&&n.arguments[0]?.type==='Literal'&&n.arguments[0].value===0)mark('process.exit(0)',n,'explicit successful process termination; control flow requires review');
    if(last==='catch'&&n.arguments[0]&&['ArrowFunctionExpression','FunctionExpression'].includes(n.arguments[0].type)){const fn=n.arguments[0],body=fn.body;const bodyText=s.slice(body.start,body.end);if(body.type==='BlockStatement'&&body.body.length===0)mark('swallowed catch',n,'empty Promise rejection handler');else if(!/\b(?:throw|reject|fail\w*|process\.exit|console\.(?:error|warn)|audit\w*)\b/.test(bodyText))mark('swallowed catch',n,'Promise rejection converted to fallback (review required)')}
    if(/(?:\.skip|^skip|^skipped|\.todo)$/.test(full))mark('hidden skip',n,'explicit skip API or similarly named helper; not necessarily hidden');
    if(/\b(?:mock|stub|fake)/i.test(full))mark('MOCK',n,'mock/stub/fake named call; fixture candidate');
  }
 });
 walk.ancestor(ast,{ReturnStatement(n,anc){if(!file.startsWith('tests/')||n.argument)return;const conditional=anc.some(a=>a.type==='IfStatement');const callback=anc.find(a=>a.type==='CallExpression'&&/^(test|it|sim)$/.test(name(a.callee)));const nearest=anc.filter(a=>['ArrowFunctionExpression','FunctionExpression','FunctionDeclaration'].includes(a.type)).at(-1);const iteration=anc.some(a=>a.type==='CallExpression'&&/\.(forEach|map|filter|some|every|find|reduce)$/.test(name(a.callee))&&a.arguments.includes(nearest));if(conditional&&callback&&!iteration)mark('hidden skip',n,'conditional bare return inside registered test callback; review whether wrapper counts PASS');}});
 out[file]=f;
}
fs.writeFileSync(process.argv[4],JSON.stringify(out));
