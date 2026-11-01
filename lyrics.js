/**
 * Compara frases reconhecidas com uma letra de referência autorizada.
 * Nunca tenta extrair legendas ou áudio de vídeos de terceiros.
 * O reconhecimento de fala pode falhar com canto e música ao fundo.
 */
const MAX_REFERENCE_WORDS = 1200;
export function tokenizeLyrics(text) {
  if (typeof text !== 'string') return [];
  const clean = text.slice(0,20000)
    .replace(/\[[^\]]{0,100}\]/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g,' ')
    .replace(/[-']/g,' ')
    .trim();
  return clean.match(/[a-z0-9]+/g)?.slice(0,MAX_REFERENCE_WORDS) || [];
}
export function makeLyricsReference(text) {
  const words=tokenizeLyrics(text);
  return words.length >= 16 ? words : null;
}
export function newLyricsAttempt() {
  return { cursor:0, recognized:0, correct:0, accepted:0, lastChunk:'', excerpt:'', chunks:0 };
}
function lcs(a,b) {
  // Frases curtas, janela de no máximo 2x a frase: custo controlado.
  const previous=new Uint16Array(b.length+1);
  const current=new Uint16Array(b.length+1);
  for (let i=1;i<=a.length;i++) {
    for(let j=1;j<=b.length;j++) {
      current[j]=a[i-1]===b[j-1] ? previous[j-1]+1 : Math.max(previous[j],current[j-1]);
    }
    previous.set(current);
  }
  return previous[b.length];
}
export function addLyricsPhrase(attempt, reference, phrase) {
  if(!attempt||!Array.isArray(reference)||reference.length<16) return null;
  const heard=tokenizeLyrics(phrase).slice(0,45);
  if(heard.length<2) return null;
  const fingerprint=heard.join(' ');
  if(fingerprint===attempt.lastChunk)return null;
  attempt.lastChunk=fingerprint;
  attempt.excerpt=heard.slice(-10).join(' ');
  attempt.recognized+=heard.length;
  attempt.chunks++;
  const start=Math.max(0,Math.min(attempt.cursor,reference.length-1));
  // Uma frase pode se repetir no refrão. Procura localmente e depois nos
  // próximos versos; não compara uma transcrição curta à letra inteira.
  const lookahead=Math.min(reference.length, Math.max(90,heard.length*9));
  const candidates=[];
  for(let i=start;i<Math.min(reference.length,start+lookahead);i++){
    const window=reference.slice(i,Math.min(reference.length,i+heard.length+Math.min(5,Math.floor(heard.length/2))));
    const matches=lcs(heard,window);
    const similarity=matches/heard.length;
    if(matches>=2 && similarity>=0.50) candidates.push({i,matches,similarity});
    if(similarity>=0.98 && i===start)break;
  }
  // Quando a música volta a um refrão anterior, permite procurar em toda a
  // referência, mas exige coincidência forte para não aceitar palavras comuns.
  if(candidates.length===0){
    for(let i=0;i<reference.length;i++){
      const matches=lcs(heard,reference.slice(i,i+heard.length+3));
      if(matches>=3 && matches/heard.length>=0.82)candidates.push({i,matches,similarity:matches/heard.length});
    }
  }
  candidates.sort((a,b)=>b.matches-a.matches || a.i-b.i);
  const winner=candidates[0];
  if(winner){
    attempt.correct+=winner.matches;
    attempt.accepted++;
    attempt.cursor=Math.min(reference.length,winner.i+Math.max(1,winner.matches));
  }
  return calculateLyricsAccuracy(attempt,reference);
}
export function calculateLyricsAccuracy(attempt,reference) {
  if(!attempt||!Array.isArray(reference)||reference.length<16) return null;
  const heard=attempt.recognized;
  if(heard<2)return null;
  const rawAccuracy=Math.round(100*Math.min(1,attempt.correct/Math.max(1,heard)));
  const coverage=Math.round(100*Math.min(1,attempt.correct/reference.length));
  // A pontuação da letra só compõe a nota geral após volume razoável de
  // transcrição. Antes disso, mera amostra exploratória.
  const reliable=heard>=20 && attempt.chunks>=2;
  return {
    points:rawAccuracy, heard, correct:attempt.correct, coverage,
    reliable, excerpt:attempt.excerpt,
  };
}
export function blendVocalAndLyrics(vocal,lyrics) {
  if(!Number.isFinite(vocal)) return null;
  if(!lyrics?.reliable) return Math.round(Math.max(0,Math.min(100,vocal)));
  return Math.round(Math.max(0,Math.min(100,vocal*.7+lyrics.points*.3)));
}
