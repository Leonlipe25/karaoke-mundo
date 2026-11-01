import test from 'node:test';
import assert from 'node:assert/strict';
import { newScore, addScoreFrame, calculateFunScore } from '../audio.js';
import { makeScoreSnapshot, validateScoreSnapshot } from '../score-sync.js';

function sungScore(n=45) {
  const score=newScore();
  for (let i=0;i<n;i++) {
    const note=60 + [0,2,4,5,7][Math.floor(i/9)%5];
    addScoreFrame(score,{voice:true,hz:440*2**((note-69)/12),rms:0.1,clarity:0.95});
  }
  return score;
}
test('sem música selecionada, mostra aguardo sem nota falsa',()=>{
  const p=makeScoreSnapshot({score:newScore(),current:null,playing:false});
  assert.deepEqual(p,{type:'score-update',title:'',phase:'waiting',points:null});
  assert.deepEqual(validateScoreSnapshot(p),{title:'',phase:'waiting',points:null});
});
test('pontuação parcial no celular coincide exatamente com a do Mac',()=>{
  const score=sungScore();
  const p=makeScoreSnapshot({score,current:{title:'Minha Música'},playing:true});
  assert.equal(p.points,calculateFunScore(score));
  assert.equal(p.phase,'playing');
});
test('pausa não zera nota e fim congela o resultado',()=>{
  const score=sungScore();
  const paused=makeScoreSnapshot({score,current:{title:'Canção'},playing:false});
  const end=makeScoreSnapshot({score,current:{title:'Canção'},finished:true});
  assert.equal(paused.phase,'paused');assert.equal(paused.points,end.points);
  assert.equal(end.phase,'finished');
});
test('sem voz suficiente não inventa nota final',()=>{
  const p=makeScoreSnapshot({score:newScore(),current:{title:'Canção'},finished:true});
  assert.equal(p.points,null);
});
test('rejeita mensagens arbitrárias ou pontuação fora do intervalo',()=>{
  assert.equal(validateScoreSnapshot({type:'pitch',points:90,phase:'playing',title:'X'}),null);
  assert.equal(validateScoreSnapshot({type:'score-update',points:110,phase:'playing',title:'X'}),null);
  assert.equal(validateScoreSnapshot({type:'score-update',points:'90',phase:'playing',title:'X'}),null);
});
