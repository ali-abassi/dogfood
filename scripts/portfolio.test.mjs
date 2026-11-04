import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const data=mkdtempSync(join(tmpdir(),'dogfood-portfolio-'));process.env.DOGFOOD_DATA=data;
const {createProject,registerPage,recordVerdicts}=await import('../lib/store.mjs');
const {portfolio,setActiveProjects}=await import('../lib/portfolio.mjs');
after(()=>rmSync(data,{recursive:true,force:true}));
test('current portfolio selection preserves historical project bytes and rejects stale/invalid updates',()=>{
 createProject({id:'current',name:'Current',url:'http://localhost:1234'});createProject({id:'history',name:'Earlier audit',url:'http://localhost:1234'});
 const before=readFileSync(join(data,'projects/history.json'),'utf8');assert.equal(portfolio().configured,false);
 const saved=setActiveProjects({projects:['current']},'agent:fixture');assert.deepEqual(saved.active.map(p=>p.id),['current']);assert.deepEqual(saved.history.map(p=>p.id),['history']);
 assert.throws(()=>setActiveProjects({projects:['history'],expectedRevision:'stale'}),/changed/);
 assert.throws(()=>setActiveProjects({projects:['missing'],expectedRevision:saved.revision}),/does not exist/);
 assert.equal(readFileSync(join(data,'projects/history.json'),'utf8'),before);assert.deepEqual(portfolio().projects,['current']);
 process.env.DOGFOOD_NATIVE_REQUEST='1';try{assert.throws(()=>setActiveProjects({projects:['history'],expectedRevision:saved.revision}),/explicit operator action/);}finally{delete process.env.DOGFOOD_NATIVE_REQUEST;}
 const switched=setActiveProjects({projects:['history'],expectedRevision:saved.revision});assert.deepEqual(switched.history.map(p=>p.id),['current']);assert.equal(readFileSync(join(data,'projects/history.json'),'utf8'),before);
});

test('an unavailable selected project cannot hide the rest of the portfolio',()=>{
 const previous=portfolio();setActiveProjects({projects:['history','current'],expectedRevision:previous.revision});
 rmSync(join(data,'projects/current.json'));
 const view=portfolio();assert.equal(view.active.length,2);assert.equal(view.active[0].id,'history');assert.equal(view.active[1].unavailable,true);assert.equal(view.active[1].pages,null);
});

test('portfolio names a blocked feature even when its captures are not blocked',()=>{
 createProject({id:'blocked-project',name:'Blocked service',url:'http://localhost:1234'});
 registerPage('blocked-project',{id:'home',name:'Home',group:'App',route:'/',features:[{id:'delivery',name:'Deliver a post'}]});
 recordVerdicts('blocked-project','home',{features:[{id:'delivery',status:'blocked',note:'Live delivery is disabled in this isolated QA fixture.'}]},'agent:fixture');
 const before=portfolio();const after=setActiveProjects({projects:['blocked-project'],expectedRevision:before.revision});assert.equal(after.active[0].blocked,1);
});
