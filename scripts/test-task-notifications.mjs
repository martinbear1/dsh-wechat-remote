import test from 'node:test'
import assert from 'node:assert/strict'
import {TaskNotifications,currentTurn,notificationSessionTitle} from '../lib/task-notifications.js'

function fixture(){
  const session={id:'s1',firstLiveSeq:0,events:[{seq:0,type:'turn/start',data:{turn:1}}]},listeners={},sent=[],rows=new Map();
  const agent={id:session.id};let live=session;
  const ctx={get:k=>k==='sessions'?{get:()=>live}:k==='agents'?{roots:()=>[agent]}:null,
    on:(k,fn)=>{listeners[k]=fn;return ()=>{delete listeners[k]}}};
  const relay={origin:'https://relay.example.test',async call(action,value){sent.push({action,...value});if(action==='prepare'){rows.set(value.id,value);return {id:value.id,status:'prepared'}}return {status:'subscribed'}}};
  const feature=new TaskNotifications(ctx,relay);feature.start();
  const append=(type,data)=>session.events.push({seq:session.events.length,type,data});
  return {feature,session,agent,listeners,sent,relay,append,replace:()=>{live={...session}}};
}

test('notification reads current native title, not another session or message body',async()=>{
 const f=fixture();try{
  f.append('message/user',{content:'private prompt, not a title'})
  assert.equal(notificationSessionTitle(f.session),undefined)
  f.append('session/title',{title:'最初标题'})
  await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'})
  f.append('session/title',{title:'杭州城市介绍八百字（2）'})
  f.append('approval/asked',{id:'a'})
  await f.feature.tick();assert.equal(f.sent.at(-1).sessionTitle,'杭州城市介绍八百字（2）')
  f.append('approval/decided',{id:'a'});f.append('session/title',{title:'更名后的标题'})
  f.append('turn/end',{turn:1,reason:{kind:'completed'}})
  await f.feature.tick();assert.equal(f.sent.at(-1).sessionTitle,'更名后的标题')
 }finally{f.feature.dispose()}
})

test('title observation is bounded, Unicode-safe and contains no transcript fallback',()=>{
 const title=value=>notificationSessionTitle({events:[{type:'session/title',data:{title:value}}]})
 assert.equal(title(' a\n b\t c '),'a b c')
 assert.equal(title('长'.repeat(30)),'长'.repeat(19)+'…')
 const emoji=title('🐳'.repeat(20));assert.ok(emoji.length<=20);assert.ok(!/[\uD800-\uDBFF]…$/.test(emoji))
 for(const value of [undefined,{},'', '\n\t'])assert.equal(title(value),undefined)
})
test('completion is explicit and independent of peer connectivity or later turns',async()=>{
  const f=fixture();try{
    await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});
    await f.feature.tick();assert.equal(f.sent.at(-1).state,'running');
    f.append('turn/end',{turn:1,reason:{kind:'completed'}});f.append('turn/start',{turn:2});
    await f.feature.tick();assert.equal(f.sent.at(-1).state,'complete');assert.equal(currentTurn(f.session),2);
  }finally{f.feature.dispose()}
});

test('native snapshotEvents-only sessions are observed without adding a mutable events property',async()=>{
  const f=fixture();try{
    const log=f.session.events;delete f.session.events;
    f.session.snapshotEvents=(from=0)=>Object.freeze(log.slice(from));
    await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});
    assert.equal(currentTurn(f.session),1);
    log.push({seq:1,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});
    await f.feature.tick();assert.equal(f.sent.at(-1).state,'complete');
    assert.equal(Object.hasOwn(f.session,'events'),false);
  }finally{f.feature.dispose()}
});
test('abort, error and restored/disposed session never become successful completion',async()=>{
  for(const kind of ['aborted','error','interrupted','blocked','max-tokens']){
    const f=fixture();try{await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});f.append('turn/end',{turn:1,reason:{kind}});await f.feature.tick();assert.equal(f.sent.at(-1).state,'cancelled')}finally{f.feature.dispose()}
  }
  const f=fixture();try{await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});f.replace();await f.feature.tick();assert.equal(f.sent.at(-1).state,'cancelled')}finally{f.feature.dispose()}
});
test('existing pending cannot renew; after handling, next reservation observes both kinds',async()=>{
 const f=fixture();try{
  f.append('approval/asked',{id:'old'});
  await assert.rejects(f.feature.request({action:'prepare',kind:'next',sessionId:'s1'}),/先处理/);
  f.append('approval/decided',{id:'old'});
  await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});
  f.append('approval/asked',{id:'new'});await f.feature.tick();assert.equal(f.sent.at(-1).pendingType,'approval');
  f.append('approval/decided',{id:'new'});f.append('turn/end',{turn:1,reason:{kind:'completed'}});
  await f.feature.tick();assert.equal(f.sent.at(-1).state,'complete');
 }finally{f.feature.dispose()}
});
test('question hook preserves result/error/signal and calls next once; observes without a phone socket',async()=>{
  const f=fixture();try{
    await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});
    let finish,calls=0;const signal=new AbortController().signal,value={ok:'unchanged'};
    const run=f.listeners['tools/execute']({name:'ask_user_question',callId:'q1',agent:f.agent,signal},()=>{calls++;return new Promise(r=>{finish=r})});
    await f.feature.tick();assert.equal(f.sent.at(-1).pendingType,'question');assert.equal(calls,1);
    finish(value);assert.equal(await run,value);await f.feature.tick();assert.equal(f.sent.at(-1).state,'running');
    const error=Error('original');await assert.rejects(f.listeners['tools/execute']({name:'ask_user_question',agent:f.agent,callId:'q2',signal},()=>Promise.reject(error)),e=>e===error);
    await f.feature.tick();assert.equal(f.sent.at(-1).state,'running');
    assert.equal(Object.keys(f.listeners).some(k=>k==='approval/request'||k==='user-questions/request'),false);
  }finally{f.feature.dispose()}
});
test('observer/network failure does not affect unrelated tool execution',async()=>{
  const f=fixture();try{
    await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});f.relay.call=async()=>{throw Error('network')};await f.feature.tick();
    const value=Promise.resolve({answer:42});assert.equal(f.listeners['tools/execute']({name:'read_file'},()=>value),value);
  }finally{f.feature.dispose()}
  assert.deepEqual(f.listeners,{});
});

test('concurrent prepare and lost-response retries reuse one observer; wrong turn is rejected',async()=>{
 const f=fixture();try{
  const original=f.relay.call;let release,calls=0
  f.relay.call=(action,value)=>{if(action!=='prepare')return original(action,value);calls++;return new Promise(r=>{release=()=>original(action,value).then(r)})}
  const a=f.feature.request({action:'prepare',kind:'next',sessionId:'s1',turn:1})
  const b=f.feature.request({action:'prepare',kind:'next',sessionId:'s1',turn:1})
  assert.equal(calls,1);release();assert.equal((await a).id,(await b).id)
  await assert.rejects(f.feature.request({action:'prepare',kind:'next',sessionId:'s1',turn:2}),/任务已切换/)
  const reserved=f.sent.find(s=>s.action==='prepare').id
  f.relay.call=async()=>{throw Error('lost response')}
  await assert.rejects(f.feature.request({action:'prepare',kind:'next',sessionId:'s1'}))
  f.relay.call=original;const retry=await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'})
  assert.equal(retry.id,reserved)
 }finally{f.feature.dispose()}
});

test('pending resolved before observation becomes completion, not a stale question',async()=>{
 const f=fixture();try{
  await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'})
  let finish;const run=f.listeners['tools/execute']({name:'ask_user_question',callId:'q',agent:f.agent},()=>new Promise(r=>{finish=r}))
  finish('done');await run;f.append('turn/end',{turn:1,reason:{kind:'completed'}})
  await f.feature.tick();assert.equal(f.sent.at(-1).state,'complete')
 }finally{f.feature.dispose()}
});

test('idle observer has no polling timer; last terminal watch stops it; dispose is idempotent',async()=>{
 const f=fixture();try {
  assert.equal(f.feature.timer,undefined);
  await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});
  assert.ok(f.feature.timer);
  f.relay.call=async()=>({status:'accepted'});await f.feature.tick();
  assert.equal(f.feature.timer,undefined);
  f.feature.start();assert.equal(Object.keys(f.listeners).length,1);
 } finally {f.feature.dispose();f.feature.dispose()}
});

test('permanent cloud rejection removes watch; malformed input never breaks the host',async()=>{
 const f=fixture();try {
  await assert.rejects(f.feature.request(null),/请求无效/);
  await f.feature.request({action:'prepare',kind:'next',sessionId:'s1'});
  f.relay.call=async()=>{throw Object.assign(Error('revoked'),{status:404})};
  await f.feature.tick();assert.equal(f.feature.watches.size,0);assert.equal(f.feature.timer,undefined);
 }finally{f.feature.dispose()}
});
