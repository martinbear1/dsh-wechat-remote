import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import assert from 'node:assert/strict';
import {waitForInstallControl} from '../installer/bin/native-control.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'installer-handshake-test-')));
const valid=v=>v.pid===123;
try {
  // A live host's delayed HMR must not be classified as permanent failure.
  const delayed=path.join(root,'delayed.json'); let nudges=0,waiting=0;
  const timer=setTimeout(()=>fs.writeFileSync(delayed,JSON.stringify({pid:123})),260);
  try {
    const ready=await waitForInstallControl(delayed,{accept:valid,initialWaitMs:100,timeoutMs:1000,ensureRunning:async()=>{nudges++},onWaiting:()=>waiting++});
    assert.equal(ready.pid,123); assert.equal(nudges,1); assert.equal(waiting,1);
  } finally {clearTimeout(timer)}
  const fast=path.join(root,'fast.json'); fs.writeFileSync(fast,'{"pid":123}');
  await waitForInstallControl(fast,{accept:valid,ensureRunning:()=>{throw Error('already ready')}});
  // Only the explicit offline callback may start a host; its PID is checked.
  const offline=path.join(root,'offline.json'); let started=0;
  await waitForInstallControl(offline,{accept:valid,initialWaitMs:100,timeoutMs:1000,ensureRunning:async()=>{started++;fs.writeFileSync(offline,'{"pid":123}')}});
  assert.equal(started,1);
  const wrong=path.join(root,'wrong.json'); fs.writeFileSync(wrong,'{"pid":456}');
  await assert.rejects(waitForInstallControl(wrong,{accept:valid,initialWaitMs:100,timeoutMs:300,ensureRunning:async()=>{}}));
  const absent=path.join(root,'absent.json'); let retries=0;
  await assert.rejects(waitForInstallControl(absent,{accept:valid,initialWaitMs:100,timeoutMs:300,ensureRunning:async()=>{retries++}}));
  assert.equal(retries,1,'never an unbounded retry loop');
  console.log('PASS delayed/native/offline handshake, PID check and bounded timeout (5 cases)');
} finally {
  assert(path.dirname(root)===fs.realpathSync(os.tmpdir())&&path.basename(root).startsWith('installer-handshake-test-'));
  fs.rmSync(root,{recursive:true});
}
