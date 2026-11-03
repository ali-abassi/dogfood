import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const moduleUrl=new URL('../lib/source-operator.mjs',import.meta.url).href;
test('a native request worktree refuses source actions even with no forwarded native environment flag',()=>{
 const data=mkdtempSync(join(tmpdir(),'dogfood-operator-'));
 try{
  const checkout=join(data,'request');mkdirSync(checkout);mkdirSync(join(data,'agent-board'));
  writeFileSync(join(data,'agent-board','fixture.json'),JSON.stringify({projectId:'fixture',cards:[{checkout}]}));
  const env={...process.env,DOGFOOD_DATA:data};delete env.DOGFOOD_NATIVE_REQUEST;delete env.DOGFOOD_PROJECT;
  const script=`import {assertSourceOperator} from ${JSON.stringify(moduleUrl)};try{assertSourceOperator();console.log('allowed')}catch(e){console.log(e.status+':'+e.message)}`;
  const inside=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:checkout,env,encoding:'utf8'});
  assert.match(inside,/403:.*explicit operator action/);
  const outside=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:data,env,encoding:'utf8'});assert.equal(outside.trim(),'allowed');
 }finally{rmSync(data,{recursive:true,force:true});}
});
