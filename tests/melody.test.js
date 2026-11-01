import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMelodyGuide,validMelodyGuide,newMelodyAttempt,addMelodyMeasurement,calculateMelodyAccuracy,blendFunAndMelody} from '../melody.js';

const hz=m=>440*2**((m-69)/12);
const samples=Array.from({length:100},(_,i)=>({t:2+i*.3,hz:hz(60+Math.floor(i/10)%8),clarity:.95}));
const guide=buildMelodyGuide(samples);
test('gera guia compacto e validado, mantendo tempo e nota',()=>{
 assert.ok(guide?.length>=90);
 assert.equal(validMelodyGuide(guide),true);
 assert.ok(Math.abs(guide[0].t-2.1)<.3);
 assert.equal(buildMelodyGuide(samples.slice(0,2)),null);
});
test('afinação correta supera cantar nota única ou errada',()=>{
 const good=newMelodyAttempt(),bad=newMelodyAttempt();
 for(const n of guide){
   const m={voice:true,hz:hz(n.midi),clarity:.97};
   addMelodyMeasurement(good,guide,n.t,m);
   addMelodyMeasurement(bad,guide,n.t,{...m,hz:hz(85)});
 }
 const ok=calculateMelodyAccuracy(good,guide,100);
 const wrong=calculateMelodyAccuracy(bad,guide,100);
 assert.ok(ok.points>=98,JSON.stringify(ok));
 assert.ok(wrong.points<25,JSON.stringify(wrong));
 assert.ok(blendFunAndMelody(90,ok)>blendFunAndMelody(90,wrong));
});
test('não pontua silêncio como afinação',()=>{
 const state=newMelodyAttempt();
 for(const n of guide)addMelodyMeasurement(state,guide,n.t,{voice:false,clarity:0,hz:0});
 assert.equal(calculateMelodyAccuracy(state,guide,100).points,0);
});
test('tentativa curta não inventa nota de afinação',()=>{
 const state=newMelodyAttempt();
 assert.equal(calculateMelodyAccuracy(state,guide,0),null);
});
test('desvio de oitava recebe tolerância parcial',()=>{
 const state=newMelodyAttempt();
 for(const n of guide)addMelodyMeasurement(state,guide,n.t,{voice:true,hz:hz(n.midi+12),clarity:.96});
 const result=calculateMelodyAccuracy(state,guide,100);
 assert.ok(result.points>=80&&result.points<=92,JSON.stringify(result));
});
