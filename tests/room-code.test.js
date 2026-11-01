import test from 'node:test';import assert from 'node:assert/strict';
import {isValidRoomCode,newRoomCode,persistentRoomCode} from '../room-code.js';
const bytes=n=>Uint8Array.from({length:n},(_,i)=>i);
test('sala usa token de 128 bits e não o pequeno código antigo',()=>{
 const id=newRoomCode(bytes);
 assert.equal(id.length,32);assert.equal(isValidRoomCode(id),true);
 assert.equal(isValidRoomCode('A12Z45'),false);
});
test('reabrir navegador conserva o mesmo link sem novo QR',()=>{
 const entries=new Map();
 const storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};
 const a=persistentRoomCode({storage,randomBytes:bytes});
 const b=persistentRoomCode({storage,randomBytes:()=>{throw Error('Não deveria gerar outro código');}});
 assert.equal(a,b);
});
test('trocar código explicitamente invalida o link anterior',()=>{
 const entries=new Map();
 const storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};
 const a=persistentRoomCode({storage,randomBytes:bytes});
 const b=persistentRoomCode({storage,randomBytes:n=>Uint8Array.from({length:n},()=>255),rotate:true});
 assert.notEqual(a,b);assert.equal(isValidRoomCode(b),true);
});
