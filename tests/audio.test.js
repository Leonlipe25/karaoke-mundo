import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateVoice, noteName, extractYouTubeId, newScore, addScoreFrame, calculateFunScore } from '../audio.js';

test('YouTube: extract standard, short and mobile links, reject lookalikes', () => {
  const id='dQw4w9WgXcQ';
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v='+id+'&t=15'),id);
  assert.equal(extractYouTubeId('https://youtu.be/'+id),id);
  assert.equal(extractYouTubeId('https://m.youtube.com/shorts/'+id),id);
  assert.equal(extractYouTubeId('https://www.youtube.com/live/'+id),id);
  assert.equal(extractYouTubeId('https://youtube.com.evil.test/watch?v='+id),null);
  assert.equal(extractYouTubeId('https://vimeo.com/123'),null);
});
test('Detectar tom Lá4 em sinal sintetizado',()=>{
  const sampleRate=44100;
  const wave=new Float32Array(2048);
  for(let i=0;i<wave.length;i++)wave[i]=0.3*Math.sin(2*Math.PI*440*i/sampleRate);
  const result=estimateVoice(wave,sampleRate);
  assert.ok(result.voice,JSON.stringify(result));
  assert.ok(Math.abs(result.hz-440)<10,JSON.stringify(result));
  assert.equal(noteName(result.hz),'Lá4');
});
test('Não marcar voz no silêncio',()=>{
  assert.equal(estimateVoice(new Float32Array(2048),48000).voice,false);
});
test('Pontuação recreativa separa silêncio de canto',()=>{
  const score=newScore();
  addScoreFrame(score,{voice:false,rms:0,clarity:0});
  assert.equal(calculateFunScore(score),0);
  addScoreFrame(score,{voice:true,rms:0.12,clarity:0.9});
  assert.ok(calculateFunScore(score)>0);
  assert.ok(calculateFunScore(score)<=55);
});

function samplesFromMidi(notes, {clarity = 0.94, intro = 0, breakEvery = 0} = {}) {
  const score = newScore();
  for (let i = 0; i < intro; i++) addScoreFrame(score, {voice:false,rms:0,clarity:0,hz:0});
  notes.forEach((midi, i) => {
    if (breakEvery && i && i % breakEvery === 0) addScoreFrame(score,{voice:false,rms:0,clarity:0,hz:0});
    const hz = 440 * 2 ** ((midi - 69)/12);
    addScoreFrame(score,{voice:true,rms:0.12,clarity,hz});
  });
  return score;
}

test('Longo trecho com notas sustentadas e variação moderada supera nota única', () => {
  const notes = [60,64,67,65,69,67,62,65,67,64].flatMap(n => Array(7).fill(n));
  const varied=calculateFunScore(samplesFromMidi(notes));
  const monotone=calculateFunScore(samplesFromMidi(Array(notes.length).fill(64)));
  assert.ok(varied > monotone, `varied=${varied}, monotone=${monotone}`);
  assert.ok(varied >= 85 && varied <= 100, `varied=${varied}`);
  assert.ok(monotone < 85, `monotone=${monotone}`);
});

test('Mudanças bruscas a cada amostra pontuam menos que canto estável', () => {
  const unstable = calculateFunScore(samplesFromMidi(Array.from({length: 80}, (_,i) => i%2 ? 77 : 60)));
  const stable = calculateFunScore(samplesFromMidi([60,64,67,65,69,67,62,65,67,64].flatMap(n=>Array(8).fill(n))));
  assert.ok(unstable < stable, `unstable=${unstable}, stable=${stable}`);
  assert.ok(unstable < 80, `unstable=${unstable}`);
});

test('Não entrega 90 pontos após poucos segundos', () => {
  const shortScore = samplesFromMidi(Array(8).fill(60));
  const mediumScore = samplesFromMidi(Array(30).fill(60));
  assert.ok(calculateFunScore(shortScore)<=55);
  assert.ok(calculateFunScore(mediumScore)<=84);
});

test('Introdução instrumental antes de começar a cantar não reduz nota', () => {
  const notes = [60,64,67,65,69,67,62,65,67,64].flatMap(n => Array(8).fill(n));
  const withIntro = calculateFunScore(samplesFromMidi(notes,{intro:120}));
  const withoutIntro = calculateFunScore(samplesFromMidi(notes));
  assert.equal(withIntro,withoutIntro);
});

test('Interrupções frequentes reduzem atividade sem zerar a avaliação', () => {
  const notes = [60,64,67,65,69,67,62,65,67,64].flatMap(n => Array(8).fill(n));
  const continuous = calculateFunScore(samplesFromMidi(notes));
  const paused = calculateFunScore(samplesFromMidi(notes,{breakEvery:3}));
  assert.ok(paused < continuous, `paused=${paused}, continuous=${continuous}`);
  assert.ok(paused >= 0);
});
