import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { HistoryImportController } from '../lib/history-import/controller.js';
import { ImportReceipts } from '../lib/history-import/receipts.js';
import { parseImportSource, parseImportArchive, parseImportConversation } from '../lib/history-import/parse.js';
import { readArchiveConversation } from '../lib/history-import/source-v3.js';
import { openZipFile } from '../lib/history-import/zip-reader.js';
import { FeatureAccess } from '../lib/feature-access.js';
import { selectHistoryBranch } from '../lib/history-import/source.js';
import { entries, conversation, zip } from './history-import-v3-fixture.mjs';
import { assertArchiveRemoved } from './archive-cleanup-fixture.mjs';
const base=tmpdir(), part=4*1024*1024;
const signal=()=>new AbortController().signal;
const descriptor=(size,id='IndependentSynthetic0123456789')=>({v:1,scheme:'xsalsa20-poly1305-chunks-v1',contentKind:'artifact',objectId:id,key:Buffer.alloc(32,1).toString('base64url'),noncePrefix:Buffer.alloc(16,2).toString('base64url'),plainBytes:size,cipherBytes:size+20*Math.ceil(size/(256*1024)),chunkBytes:256*1024});
async function fixture(t,overrides={}) {
  const root=await mkdtemp(path.join(base,'zip-review-'));let allowed=true;
  const ports={capabilities:async()=>({supported:true}),authorize:async()=>({owner:'synthetic-owner',assertCurrent(){if(!allowed)throw Error('authorization-changed')}}),owner:async()=> 'synthetic-owner',
    receipts:new ImportReceipts(path.join(root,'receipts')),stagingDirectory:path.join(root,'spool'),parse:parseImportSource,parseArchive:parseImportArchive,readConversation:parseImportConversation,
    share:async()=>Buffer.alloc(0),commit:async()=>{throw Error('not authorized to create a real session')},inspect:async()=>({state:'not-found'}),...overrides};
  const controller=new HistoryImportController(ports),call=(action,input={})=>controller.control(action,input,signal());
  t.after(async()=>{controller.dispose();await new Promise(r=>setTimeout(r,50));assert.equal(path.dirname(root),path.resolve(base));await rm(root,{recursive:true,force:true})});
  return{root,controller,call,revoke:()=>{allowed=false}};
}
async function staged(f){const bytes=zip(entries()),s=await f.call('archive.start',{name:'fixture.zip',size:bytes.length});await f.call('archive.chunk',{uploadId:s.uploadId,offset:0,data:bytes.toString('base64')});return await f.call('archive.finish',{uploadId:s.uploadId});}
test('acknowledged object replay never redownloads, resigns or double charges',async t=>{
  let downloads=0;const f=await fixture(t,{loadObject:async()=>{downloads++;return Buffer.alloc(8)}}),s=await f.call('archive.start',{name:'fixture.zip',size:8}),d=descriptor(8);
  assert.equal((await f.call('archive.object',{uploadId:s.uploadId,offset:0,descriptor:d})).offset,8);
  assert.equal((await f.call('archive.object',{uploadId:s.uploadId,offset:0,descriptor:{...d}})).offset,8);
  assert.equal(downloads,1,'retry must acknowledge staged bytes without another cloud ticket');
  await assert.rejects(f.call('archive.object',{uploadId:s.uploadId,offset:0,descriptor:descriptor(8,'DifferentSynthetic0123456789')}),/invalid-chunk/);assert.equal(downloads,1);
});
test('future offset and changed owner are rejected before object IO',async t=>{
  let downloads=0;const f=await fixture(t,{loadObject:async()=>{downloads++;return Buffer.alloc(part)}}),s=await f.call('archive.start',{name:'fixture.zip',size:part*2});
  await assert.rejects(f.call('archive.object',{uploadId:s.uploadId,offset:part,descriptor:descriptor(part)}),/invalid-chunk/);assert.equal(downloads,0);
  f.revoke();await assert.rejects(f.call('archive.object',{uploadId:s.uploadId,offset:0,descriptor:descriptor(part)}),/authorization-changed/);assert.equal(downloads,0);
});
test('lazy preview rechecks captured authority after async parse and never exposes/cache stale source',async t=>{
  let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const f=await fixture(t,{readConversation:async(...args)=>{const value=await parseImportConversation(...args);entered();await gate;return value}}),s=await staged(f);
  const pending=f.call('preview',{sourceId:s.sourceId,conversationId:'synthetic-v3',branchId:'2'});await started;f.revoke();release();
  await assert.rejects(pending,/authorization-changed/);assert.equal(f.controller.previews.size,0);assert.equal(f.controller.sources.get(s.sourceId).value.conversations[0].messages.length,0);
});
test('release during lazy preview cannot return a preview or leave an unpinned spool',async t=>{
  let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const f=await fixture(t,{readConversation:async(...args)=>{const value=await parseImportConversation(...args);entered();await gate;return value}}),s=await staged(f),file=f.controller.sources.get(s.sourceId).archive.file;
  const pending=f.call('preview',{sourceId:s.sourceId,conversationId:'synthetic-v3',branchId:'2'});await started;await f.call('release',{sourceId:s.sourceId});release();
  await assert.rejects(pending,/expired/);const cleanupMs=await assertArchiveRemoved(file);assert.equal(f.controller.previews.size,0);
  console.log(JSON.stringify({case:'release-during-preview',cleanupMs}));
});
test('download completing after release cannot append or revive the archive',async t=>{
  let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const f=await fixture(t,{loadObject:async()=>{entered();await gate;return Buffer.alloc(8)}}),s=await f.call('archive.start',{name:'fixture.zip',size:8}),file=f.controller.archives.get(s.uploadId).archive.file;
  const pending=f.call('archive.object',{uploadId:s.uploadId,offset:0,descriptor:descriptor(8)});await started;await f.call('release',{uploadId:s.uploadId});release();
  await assert.rejects(pending,/expired/);await assert.rejects(stat(file),{code:'ENOENT'});assert.equal(f.controller.archives.size,0);
});
test('restored image references do not retain a false missing-attachment warning',async t=>{
  const f=await fixture(t),value=conversation(),entry='chat_sessions/synthetic-v3_files/photo.png';value.messages[0].fragments.push({type:'FILE',files:[{file_name:'photo.png',is_image:true,export_path:entry}]});
  const file=path.join(f.root,'image.zip');await writeFile(file,zip([...entries(value),[entry,Buffer.from('synthetic-image-bytes')]]));
  const parsed=await readArchiveConversation(file,value.id),selected=selectHistoryBranch(parsed,'2');assert.equal(selected.messages[0].fragments[1].files[0].exportPath,entry);
  assert(!selected.warnings.includes('attachment-content-unavailable'));
});
test('bounded compressed data, CRC, local headers and foreign image references fail closed',async t=>{
  const f=await fixture(t),packed=zip([['large.txt',Buffer.alloc(1024*1024,65)]]),reader=await openZipFile(packed);
  try{await assert.rejects(reader.read('large.txt',1024),/invalid-zip/)}finally{await reader.close()}
  const corrupt=zip([['a.txt','abc']],{compress:false});corrupt[35]^=1;const broken=await openZipFile(corrupt);
  try{await assert.rejects(broken.read('a.txt',1024),/invalid-zip/)}finally{await broken.close()}
  const mismatched=zip([['a.txt','abc']],{compress:false});mismatched.writeUInt32LE(4,18);await assert.rejects(openZipFile(mismatched),/invalid-zip/);
  for(const name of ['../outside','/absolute','C:/outside','folder\\outside','folder/../outside'])await assert.rejects(openZipFile(zip([[name,'x']])),/invalid-zip/);
  const value=conversation(),foreign='chat_sessions/other_files/photo.png';value.messages[0].fragments.push({type:'FILE',files:[{file_name:'photo.png',is_image:true,export_path:foreign}]});
  const file=path.join(f.root,'foreign.zip');await writeFile(file,zip([...entries(value),[foreign,'other-conversation-image']]));const parsed=await readArchiveConversation(file,value.id);
  assert.equal(parsed.messages[0].fragments[1].files[0].exportPath,undefined);assert(selectHistoryBranch(parsed,'2').warnings.includes('attachment-content-unavailable'));
});
test('authority revocation during archive catalog parse cannot create a source',async t=>{
  let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const f=await fixture(t,{parseArchive:async(...args)=>{const value=await parseImportArchive(...args);entered();await gate;return value}}),bytes=zip(entries()),s=await f.call('archive.start',{name:'fixture.zip',size:bytes.length});
  const file=f.controller.archives.get(s.uploadId).archive.file;await f.call('archive.chunk',{uploadId:s.uploadId,offset:0,data:bytes.toString('base64')});const pending=f.call('archive.finish',{uploadId:s.uploadId});await started;f.revoke();release();
  await assert.rejects(pending,/authorization-changed/);assert.equal(f.controller.sources.size,0);assert.equal(f.controller.archives.size,0);await assert.rejects(stat(file),{code:'ENOENT'});
});
test('archive object, catalog and lazy preview can cross natural lease expiry with the same owner',async t=>{
  let clock=0,reads=0;const nodeId='synthetic-review-node',grant={allowed:true,reason:'allowed',validUntil:1000000};
  const access=new FeatureAccess({nodeId:()=>nodeId,read:async()=>{reads++;return{schemaVersion:1,nodeId,accountInstance:'synthetic-account',checkedAt:100,expiresAt:60100,features:{group_assistant:grant,clawbot:grant,history_import:grant}}}},undefined,()=>clock);
  t.after(()=>access.close());await access.setHistoryImportEnabled(true);const bytes=zip(entries());
  const f=await fixture(t,{authorize:s=>access.authorizeHistoryImport(s),owner:s=>access.currentOwner(s),loadObject:async()=>{clock+=60001;return bytes},
    parseArchive:async(...args)=>{const parsed=await parseImportArchive(...args);clock+=60001;return parsed},readConversation:async(...args)=>{const parsed=await parseImportConversation(...args);clock+=60001;return parsed}});
  const start=await f.call('archive.start',{name:'expiry.zip',size:bytes.length});assert.equal((await f.call('archive.object',{uploadId:start.uploadId,offset:0,descriptor:descriptor(bytes.length)})).offset,bytes.length);
  const source=await f.call('archive.finish',{uploadId:start.uploadId}),preview=await f.call('preview',{sourceId:source.sourceId,conversationId:'synthetic-v3',branchId:'2'});
  assert(preview.previewId);assert.equal(reads,4,'each natural expiry refreshes the same captured owner once');
});
test('explicit authorization invalidation during object download cannot be healed by revalidation',async t=>{
  const nodeId='synthetic-review-node',grant={allowed:true,reason:'allowed',validUntil:1000000};
  const access=new FeatureAccess({nodeId:()=>nodeId,read:async()=>({schemaVersion:1,nodeId,accountInstance:'synthetic-account',checkedAt:100,expiresAt:60100,features:{group_assistant:grant,clawbot:grant,history_import:grant}})});
  t.after(()=>access.close());await access.setHistoryImportEnabled(true);
  const f=await fixture(t,{authorize:s=>access.authorizeHistoryImport(s),owner:s=>access.currentOwner(s),loadObject:async()=>{access.invalidate();return Buffer.alloc(8)}}),start=await f.call('archive.start',{name:'revoked.zip',size:8});
  await assert.rejects(f.call('archive.object',{uploadId:start.uploadId,offset:0,descriptor:descriptor(8)}),e=>e.code==='feature-access-denied');assert.equal(f.controller.archives.get(start.uploadId).archive.offset,0);
});
