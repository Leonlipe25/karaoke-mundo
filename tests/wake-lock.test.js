import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenAwake } from '../wake-lock.js';

function lock() {
  let released = false;
  const handlers = [];
  return {
    get released() { return released; },
    addEventListener(type, fn) { if(type === 'release') handlers.push(fn); },
    async release() {
      released = true;
      for(const fn of handlers) fn();
    },
  };
}

test('navegador sem Wake Lock informa limitação sem lançar erro', async () => {
  const changes=[];
  const manager=createScreenAwake({wakeLock:undefined,isVisible:()=>true,onStatus:x=>changes.push(x)});
  assert.equal(manager.supported(),false);
  assert.equal(await manager.start(),false);
  assert.equal(changes.at(-1),'unsupported');
  await manager.stop();
  assert.equal(changes.at(-1),'idle');
});

test('ativa tela ao iniciar microfone e solta ao pausar', async () => {
  const locks=[];
  const changes=[];
  const manager=createScreenAwake({
    wakeLock:{request:async type=>{assert.equal(type,'screen');const l=lock();locks.push(l);return l;}},
    isVisible:()=>true,onStatus:x=>changes.push(x),
  });
  assert.equal(await manager.start(),true);
  assert.equal(locks.length,1);
  assert.equal(changes.at(-1),'active');
  await manager.stop();
  assert.equal(locks[0].released,true);
  assert.equal(changes.at(-1),'idle');
});

test('requisita novamente quando navegador volta a ficar visível', async () => {
  let visible=false, calls=0;
  const changes=[];
  const manager=createScreenAwake({
    wakeLock:{request:async ()=>{calls++;return lock();}},
    isVisible:()=>visible,onStatus:x=>changes.push(x),
  });
  assert.equal(await manager.start(),false);
  assert.equal(calls,0);
  assert.equal(changes.at(-1),'hidden');
  visible=true;
  manager.visibilityChange();
  await Promise.resolve();await Promise.resolve();
  assert.equal(calls,1);
  assert.equal(changes.at(-1),'active');
  await manager.stop();
});

test('bloqueio obsoleto não permanece ligado após pausa durante a requisição', async () => {
  let resolveRequest;
  const promise=new Promise(resolve=>{resolveRequest=resolve;});
  const l=lock();
  const manager=createScreenAwake({
    wakeLock:{request:()=>promise},
    isVisible:()=>true,
  });
  const starting=manager.start();
  await manager.stop();
  resolveRequest(l);
  assert.equal(await starting,false);
  assert.equal(l.released,true);
});

test('falha do sistema é tratada sem desligar microfone', async () => {
  const changes=[];
  const manager=createScreenAwake({
    wakeLock:{request:async ()=>{throw new Error('battery saver');}},
    isVisible:()=>true,onStatus:x=>changes.push(x),
  });
  assert.equal(await manager.start(),false);
  assert.equal(changes.at(-1),'unavailable');
  await manager.stop();
});
