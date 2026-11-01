import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenizeLyrics,makeLyricsReference,newLyricsAttempt,addLyricsPhrase,calculateLyricsAccuracy,blendVocalAndLyrics} from '../lyrics.js';

const ref=makeLyricsReference('Noite clara estrela no ceu a minha voz ecoa\n' +
 'A luz da lua brilha enquanto a cidade canta\n' +
 'Venha cantar comigo ate chegar de manha\n' +
 'Noite clara estrela no ceu a minha voz ecoa\n' +
 'A luz da lua brilha enquanto a cidade canta\n' +
 'Venha cantar comigo ate chegar de manha');

test('normaliza acentos, pontuação e texto unicode sem se confundir',()=>{
 assert.deepEqual(tokenizeLyrics('Coração, AÇÃO! [Refrão] você\n cantará'),['coracao','acao','voce','cantara']);
 assert.ok(ref.length>40);
 assert.equal(makeLyricsReference('muito curta'),null);
});
test('acertos progressivos produzem maior nota do que frases inventadas',()=>{
 const good=newLyricsAttempt(),bad=newLyricsAttempt();
 addLyricsPhrase(good,ref,'noite clara estrela no ceu a minha voz ecoa');
 addLyricsPhrase(good,ref,'a luz da lua brilha enquanto a cidade canta');
 addLyricsPhrase(good,ref,'venha cantar comigo ate chegar de manha');
 addLyricsPhrase(bad,ref,'um foguete voando longe para outra galaxia');
 addLyricsPhrase(bad,ref,'banana verde andando na chuva agora sozinho');
 addLyricsPhrase(bad,ref,'nada disso faz parte daquele verso original');
 const ok=calculateLyricsAccuracy(good,ref),wrong=calculateLyricsAccuracy(bad,ref);
 assert.equal(ok.reliable,true);
 assert.ok(ok.points>=85,JSON.stringify(ok));
 assert.ok(wrong.points<55,JSON.stringify(wrong));
 assert.ok(blendVocalAndLyrics(90,ok)>blendVocalAndLyrics(90,wrong));
});
test('frases curtas isoladas não penalizam a nota vocal',()=>{
 const a=newLyricsAttempt();
 addLyricsPhrase(a,ref,'noite clara estrela');
 const result=calculateLyricsAccuracy(a,ref);
 assert.equal(result.reliable,false);
 assert.equal(blendVocalAndLyrics(80,result),80);
});
test('não duplica resultados finais repetidos da API de reconhecimento',()=>{
 const a=newLyricsAttempt();
 addLyricsPhrase(a,ref,'noite clara estrela no ceu a minha voz ecoa');
 const before=a.recognized;
 addLyricsPhrase(a,ref,'noite clara estrela no ceu a minha voz ecoa');
 assert.equal(a.recognized,before);
});
test('não gera pontuação de letra sem referência',()=>{
 assert.equal(calculateLyricsAccuracy(newLyricsAttempt(),null),null);
 assert.equal(blendVocalAndLyrics(83,null),83);
});
