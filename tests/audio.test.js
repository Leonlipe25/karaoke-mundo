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
  assert.ok(calculateFunScore(score)>50);
});
