import { estimateVoice, noteName, newScore, addScoreFrame, calculateFunScore, extractYouTubeId, buildFinalResult } from './audio.js';
import { selectedMicSource } from './mic-source.js';
import { createScreenAwake } from './wake-lock.js';
import { makeScoreSnapshot, validateScoreSnapshot } from './score-sync.js';
import { makeLyricsReference,newLyricsAttempt,addLyricsPhrase,calculateLyricsAccuracy,blendVocalAndLyrics } from './lyrics.js';
import { persistentRoomCode, isValidRoomCode } from './room-code.js';

const $ = (id) => document.getElementById(id);
const safeJsonParse = (v, fallback) => { try { return JSON.parse(v) ?? fallback; } catch { return fallback; } };
const loadFavorites = () => safeJsonParse(localStorage.getItem('karaoke-favorites'), []).filter(s => extractYouTubeId(s?.id));
let favorites = loadFavorites();
const SEARCH_API = 'https://karaoke-mundo-api.onrender.com/api/search';
let region = 'BR';
let current = null;
let player = null;
let playerReady = false;
let playing = false;
let finished = false;
let score = newScore();
let peer = null;
let room = '';
let remoteConnection = null;
let localMicStop = null;
let lastPitch = null;
let lastRemotePitchAt = 0;
let searchAbort = null;
let lastScoreSyncAt = 0;
let lastScoreSyncPayload = '';
let autoAdvanceTimer = null;
let lyricsReference=null;
let lyricsAttempt=newLyricsAttempt();
let lyricsSongId=null;
let lastLyricsDisplayAt=0;
const lyricsKey=id=>'borake-lyrics-reference-v1-'+id;
function lyricsMetrics(){return lyricsReference ? calculateLyricsAccuracy(lyricsAttempt,lyricsReference) : null;}
function totalScore(){
  if(score.vocalFrames<10)return null;
  return blendVocalAndLyrics(calculateFunScore(score),lyricsMetrics());
}
function updateLyricsStatus(){
  setText('lyricsScoreNum','--/100');
  setText('lyricsRecognizedCount','0 palavras reconhecidas');
  setText('lyricsCoverage',lyricsReference?'Referência pronta':'Sem letra de referência');
  setText('lyricsStatus',lyricsReference
    ? '✅ Letra de referência salva neste navegador. Ative o reconhecimento de palavras no celular para comparar o canto.'
    : 'Sem letra de referência. A nota vocal continua funcionando normalmente.');
  $('clearLyricsBtn').disabled=!lyricsReference;
  $('lyricsManualText').value='';
  $('lyricsManualBox').classList.add('hidden');
}
function loadLyricsForSong(){
  lyricsReference=null;lyricsAttempt=newLyricsAttempt();
  if(!current)return;
  try {
    const saved=localStorage.getItem(lyricsKey(current.id));
    if(saved)lyricsReference=makeLyricsReference(saved);
  }catch{}
  lyricsSongId=current.id;
  updateLyricsStatus();
}
function receiveLyricsPhrase(message){
  if(!current||!playing||finished||!lyricsReference||
     message?.type!=='lyrics-phrase'||!remoteConnection?.open||
     typeof message.phrase!=='string'||message.phrase.length>500)return;
  const result=addLyricsPhrase(lyricsAttempt,lyricsReference,message.phrase);
  if(!result)return;
  if(Date.now()-lastLyricsDisplayAt>250){
    lastLyricsDisplayAt=Date.now();
    setText('lyricsRecognizedCount',result.heard+' palavras reconhecidas');
    setText('lyricsCoverage',result.reliable?'Comparação ativada':'Aguardando mais frases');
    setText('lyricsScoreNum',result.points+'/100');
    setText('lyricsStatus',result.reliable
      ? '📝 Acerto de letra: '+result.points+'/100 (estimativa).'
      : 'Reconhecimento em teste. A nota ainda não será afetada.');
    if(score.vocalFrames>=10)updateLiveScore();
  }
  sendScoreToPhone(false);
}
function updateLiveScore(){
  const points=totalScore();
  if(points===null)return;
  $('scoreNum').innerHTML=`${points}<small>/100</small>`;
  $('scoreMeter').style.width=points+'%';
  setText('scoreLabel',points>=85?'Arrasou! ✨':points>=70?'Muito bom!':'Continue cantando!');
  announceCheer(points);
}
const loadQueue = () => {
  const saved = safeJsonParse(localStorage.getItem('borake-song-queue'), []);
  return (Array.isArray(saved) ? saved : [])
    .filter(song => extractYouTubeId(song?.id) && typeof song.title === 'string').slice(0,30);
};
let songQueue = loadQueue();
let stageMode = false;
let lastCheerAt = 0;
let cheerTimer = null;
let confettiTimer = null;
const motionReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Catálogo inicial de vídeos identificados no YouTube: não requer chave de API.
const starterSongs = [
  { id:'tfhwXKd1W_o', title:'Evidências — Chitãozinho & Xororó', channel:'Singer! Karaokê', region:'BR', tags:'sertanejo romântico' },
  { id:'qbCUViw6-5I', title:'Cheia de Manias — Raça Negra', channel:'Singer! Karaokê', region:'BR', tags:'pagode samba' },
  { id:'oPEsF8Rj0w8', title:'Tempo Perdido — Legião Urbana', channel:'Singer! Karaokê', region:'BR', tags:'rock nacional anos 80 mpb' },
  { id:'0lnjAxPq_u8', title:'Anna Júlia — Los Hermanos', channel:'JJ Karaokê', region:'BR', tags:'rock nacional' },
  { id:'Fjm5JwF-YcM', title:'Trem-Bala — Ana Vilela', channel:'Muramatsu Karaoke', region:'BR', tags:'mpb pop acústico' },
  { id:'sPMA1tqWuf4', title:'Perfect — Ed Sheeran', channel:'Sing King', region:'INT', tags:'pop internacional baladas românticas' },
  { id:'_uORhCSX2f8', title:'Someone Like You — Adele', channel:'Sing King', region:'INT', tags:'pop internacional baladas' },
  { id:'WHayJZ3eMcE', title:'Dancing Queen — ABBA', channel:'Sing King', region:'INT', tags:'pop internacional anos 70 disco' },
  { id:'aFpj_kRkdHg', title:'Bohemian Rhapsody — Queen', channel:'karaoke SESH', region:'INT', tags:'rock clássico internacional' },
  { id:'WQaUGRL3yS4', title:'Shallow — Lady Gaga e Bradley Cooper', channel:'karaoke SESH', region:'INT', tags:'pop internacional baladas dueto' },
];
const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const chipsByRegion = {
  BR: ['Sertanejo', 'Pagode', 'MPB', 'Forró', 'Samba', 'Rock nacional'],
  INT: ['Pop internacional', 'Rock clássico', 'Anos 80', 'Baladas', 'Reggaeton', 'K-pop'],
  ALL: ['Sertanejo', 'Pop internacional', 'Pagode', 'Rock', 'Reggaeton', 'MPB'],
};
const setText = (id, v) => { $(id).textContent = v; };
function notify(message, success = false) {
  const box = $('searchNotice');
  box.textContent = message;
  box.classList.toggle('success', success);
}
function searchTerms(query) {
  if (region === 'BR') return `${query} karaokê playback letra`;
  if (region === 'INT') return `${query} karaoke instrumental lyrics`;
  return `${query} karaoke playback lyrics`;
}
function renderChips() {
  const genres = {
    'Sertanejo':'🎸','Pagode':'🥁','MPB':'🎼','Forró':'🪗','Samba':'🎶',
    'Rock nacional':'⚡','Pop internacional':'🎤','Rock clássico':'🤘',
    'Anos 80':'🪩','Baladas':'💖','Reggaeton':'🔥','K-pop':'✨',
    'Rock':'⚡',
  };
  $('chips').replaceChildren(...chipsByRegion[region].map((word, index) => {
    const b = document.createElement('button');
    b.className = 'chip genre-chip'; b.type = 'button';
    const icon = document.createElement('span'); icon.className='genre-icon';icon.textContent=genres[word]||'♫';
    const label = document.createElement('span');label.className='genre-name';label.textContent=word;
    b.append(icon,label);
    b.style.setProperty('--genre-index', String(index));
    b.addEventListener('click', () => { $('searchInput').value = word; runSearch(word); });
    return b;
  }));
}
function makeSongCard(song) {
  const card = document.createElement('div'); card.className = 'song-card';
  const open = document.createElement('button'); open.type = 'button'; open.className = 'song-open';
  open.setAttribute('aria-label', 'Cantar ' + song.title);
  const image = document.createElement('img');
  image.src = `https://i.ytimg.com/vi/${song.id}/mqdefault.jpg`;
  image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
  const box = document.createElement('span'); box.className='song-description';
  const title = document.createElement('strong'); title.textContent = song.title;
  const channel = document.createElement('small'); channel.textContent = song.channel || 'YouTube';
  box.append(title,channel);open.append(image,box);
  open.addEventListener('click',() => selectSong(song));
  const add = document.createElement('button');
  add.className = 'queue-add'; add.type = 'button'; add.textContent = '+ Fila';
  add.title = 'Adicionar esta música à fila';
  add.setAttribute('aria-label','Adicionar à fila: '+song.title);
  add.addEventListener('click',()=>{ if(addToQueue(song)) {add.textContent='✓ Na fila'; setTimeout(()=>{if(add.isConnected)add.textContent='+ Fila';},1500);} });
  card.append(open,add);
  return card;
}
function saveQueue() {
  localStorage.setItem('borake-song-queue', JSON.stringify(songQueue));
}
function addToQueue(song) {
  if (!song || !extractYouTubeId(song.id)) return false;
  if (songQueue.length >= 30) {notify('Fila cheia (30 músicas). Remova uma para adicionar outra.'); return false;}
  songQueue.push({id:song.id,title:String(song.title).slice(0,180),channel:String(song.channel||'YouTube').slice(0,100)});
  saveQueue(); renderQueue(); return true;
}
function renderQueue() {
  const root = $('songQueue'); if(!root) return;
  root.replaceChildren();
  setText('queueCount', songQueue.length + (songQueue.length === 1 ? ' na fila' : ' na fila'));
  $('playQueueBtn').disabled = songQueue.length === 0;
  $('clearQueueBtn').disabled = songQueue.length === 0;
  $('playNextFromFinalBtn').disabled = songQueue.length === 0;
  $('playNextFromFinalBtn').classList.toggle('hidden',songQueue.length===0);
  if(!songQueue.length) {
    const p = document.createElement('p');p.className='queue-empty';p.textContent='Sua próxima música começa aqui. Toque em “+ Fila” nos resultados.';
    root.append(p);return;
  }
  songQueue.forEach((song,index)=>{
    const item=document.createElement('div');item.className='queue-item';
    const pos=document.createElement('span');pos.className='queue-pos';pos.textContent=String(index+1).padStart(2,'0');
    const info=document.createElement('div');info.className='queue-song';
    const title=document.createElement('strong');title.textContent=song.title;
    const channel=document.createElement('small');channel.textContent=song.channel||'YouTube';
    info.append(title,channel);
    const actions=document.createElement('div');actions.className='queue-item-actions';
    const play=document.createElement('button');play.type='button';play.title='Cantar agora';play.setAttribute('aria-label','Cantar agora '+song.title);play.textContent='▶';
    play.addEventListener('click',()=>playQueuedSong(index));
    const remove=document.createElement('button');remove.type='button';remove.title='Remover da fila';remove.setAttribute('aria-label','Remover '+song.title+' da fila');remove.textContent='×';
    remove.addEventListener('click',()=>{songQueue.splice(index,1);saveQueue();renderQueue();});
    actions.append(play,remove);item.append(pos,info,actions);root.append(item);
  });
}
function playQueuedSong(index=0) {
  if(!songQueue.length||index<0||index>=songQueue.length)return;
  const [song]=songQueue.splice(index,1);saveQueue();renderQueue();
  selectSong(song);
}
function cancelAutoAdvance() {
  if(autoAdvanceTimer){clearInterval(autoAdvanceTimer);autoAdvanceTimer=null;}
  if($('playNextFromFinalBtn'))$('playNextFromFinalBtn').textContent='▶ Próxima da fila';
}
function scheduleAutoAdvance(seconds=8) {
  cancelAutoAdvance();
  if(!songQueue.length)return;
  let remaining=seconds;
  const button=$('playNextFromFinalBtn');
  const paint=()=>{button.textContent='▶ Próxima da fila ('+remaining+'s)';};
  paint();
  autoAdvanceTimer=setInterval(()=>{
    remaining-=1;
    if(remaining<=0){
      cancelAutoAdvance();
      if(songQueue.length)playQueuedSong(0);
      return;
    }
    paint();
  },1000);
}
function setStageMode(enabled) {
  stageMode = Boolean(enabled);
  document.body.classList.toggle('stage-mode',stageMode);
  $('toggleStageBtn').textContent=stageMode?'↙ Voltar à biblioteca':'⛶ Ampliar palco';
  $('headerStageBtn').textContent=stageMode?'▦ Biblioteca':'◩ Modo palco';
  $('fullscreenBtn').classList.toggle('hidden',!stageMode || !document.documentElement.requestFullscreen);
  if(stageMode) window.scrollTo({top:0,behavior:motionReduced()?'auto':'smooth'});
}
function focusPhonePanel() {
  if(stageMode)setStageMode(false);
  const panel=$('phonePanel');panel.scrollIntoView({behavior:motionReduced()?'auto':'smooth',block:'center'});
  if(!room && !peer) createRoom();
}
function announceCheer(points) {
  if(finished || points<72 || score.vocalFrames<18 || Date.now()-lastCheerAt<14000)return;
  lastCheerAt=Date.now();
  const el=$('scoreCheer');
  el.textContent=points>=90?'VOCÊ ARRASOU! 🌟':points>=82?'MANDOU BEM! ✨':'BOA! 🎶';
  el.classList.remove('hidden');
  el.classList.remove('cheer-pop');
  void el.offsetWidth;
  el.classList.add('cheer-pop');
  clearTimeout(cheerTimer);
  cheerTimer=setTimeout(()=>el.classList.add('hidden'),1600);
}
function celebrateFinal(points) {
  const layer=$('confettiLayer');
  layer.replaceChildren();
  if(points<60 || motionReduced()) return;
  const colors=['#ff65b6','#7deadd','#af83ff','#ffdb75','#ffffff'];
  const frag=document.createDocumentFragment();
  for(let i=0;i<28;i++){
    const conf=document.createElement('span');
    conf.className='confetti-piece';
    conf.style.left=(3+(i*31)%94)+'%';
    conf.style.backgroundColor=colors[i%colors.length];
    conf.style.animationDelay=(i%7)*.065+'s';
    conf.style.animationDuration=(1.6+(i%4)*.24)+'s';
    conf.style.setProperty('--drift',((i%2?1:-1)*(20+i%6*13))+'px');
    frag.append(conf);
  }
  layer.append(frag);
  clearTimeout(confettiTimer);
  confettiTimer=setTimeout(()=>layer.replaceChildren(),3500);
}
function renderResults(songs, title) {
  const container = $('results'); container.replaceChildren();
  setText('resultsTitle', title); setText('resultsCount', `${songs.length} resultado(s)`);
  if (!songs.length) {
    container.innerHTML = '<div class="empty-results"><div class="empty-icon">⌕</div><strong>Nenhum resultado</strong><p>Tente outro artista ou estilo.</p></div>';
    return;
  }
  container.append(...songs.map(makeSongCard));
}
function renderFavorites() {
  const root = $('favorites'); root.replaceChildren();
  if (!favorites.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Suas músicas favoritas aparecem aqui.'; root.append(p); return; }
  root.append(...favorites.map(s => {
    const wrapper=document.createElement('div');wrapper.className='favorite-wrap';
    const b = document.createElement('button'); b.className = 'favorite-item'; b.textContent = `♥ ${s.title}`;
    b.addEventListener('click', () => selectSong(s));
    const add=document.createElement('button');add.className='favorite-queue';add.type='button';add.textContent='+ Fila';
    add.title='Adicionar à fila';add.addEventListener('click',()=>addToQueue(s));
    wrapper.append(b,add);return wrapper;
  }));
}
function renderStarterCatalog(query = '') {
  const phrase=normalizeSearch(query);
  const candidates=starterSongs.filter(song=>region==='ALL'||song.region===region);
  const songs=phrase ? candidates.filter(song=>normalizeSearch(song.title+' '+song.channel+' '+song.tags).includes(phrase)) : candidates;
  renderResults(songs, phrase?'Resultados do catálogo inicial':'Comece por estas músicas');
  const results=$('results');
  const box=document.createElement('div');
  box.className='catalog-help';
  const message=document.createElement('span');
  message.textContent=phrase
    ? (songs.length ? 'Quer ver mais opções ou outra versão? ' : 'Ainda não temos essa música na seleção inicial. ')
    : 'Estas músicas já podem ser escolhidas sem configurar nada. ';
  const link=document.createElement('a');
  link.href='https://www.youtube.com/results?search_query='+encodeURIComponent(searchTerms(query || (region==='BR'?'karaokê brasileiro':region==='INT'?'international karaoke':'karaokê karaoke')));
  link.target='_blank';link.rel='noopener noreferrer';
  link.textContent=phrase?'Pesquisar mais no YouTube ↗':'Explorar outras músicas no YouTube ↗';
  const tip=document.createElement('small');
  tip.textContent='Achou o vídeo? Copie o endereço e cole em “JÁ TEM O LINK?” para tocar aqui.';
  box.append(message,link,tip);
  results.prepend(box);
  setText('resultsCount',songs.length+' pré-selecionadas');
  notify('Catálogo inicial disponível. A busca geral usa o servidor do BoraKê.',true);
}

async function runSearch(query) {
  const text = query?.trim(); if (!text) return;
  $('searchBtn').disabled = true; $('searchBtn').textContent = 'Buscando…';
  notify('Buscando vídeos de karaokê no YouTube…');
  if (searchAbort) searchAbort.abort(); searchAbort = new AbortController();
  const params = new URLSearchParams({q:text,region});
  try {
    const response = await fetch(`${SEARCH_API}?${params}`,{signal:searchAbort.signal});
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || 'Erro ao pesquisar no YouTube');
    const songs = (json.items || []).map(item => ({id:item.id,title:decodeHtml(item.title || ''),channel:decodeHtml(item.channel || '')})).filter(s => extractYouTubeId(s.id));
    renderResults(songs,region === 'BR' ? 'Karaokê brasileiro' : region === 'INT' ? 'Karaokê internacional' : 'Todos os estilos');
    notify(`${songs.length} vídeos encontrados. A disponibilidade depende do proprietário de cada vídeo.`,true);
  } catch (e) {
    if (e.name !== 'AbortError') { renderStarterCatalog(text); notify(`Busca online indisponível: ${e.message}. Exibindo o catálogo inicial.`,false); }
  } finally { $('searchBtn').disabled = false; $('searchBtn').textContent = 'Pesquisar →'; }
}
function decodeHtml(value) { const t = document.createElement('textarea'); t.innerHTML = value; return t.value; }
// O computador é a fonte oficial do placar: o celular só exibe a nota recebida.
function sendScoreToPhone(force = false) {
  if (!remoteConnection?.open) return;
  const lyrics=lyricsMetrics();
  const snapshot=makeScoreSnapshot({score,current,playing,finished,
    overridePoints:totalScore(),lyricsPoints:lyrics?.reliable?lyrics.points:null});
  const signature=JSON.stringify(snapshot);
  const now=Date.now();
  if(!force && (signature===lastScoreSyncPayload||now-lastScoreSyncAt<450))return;
  try {
    remoteConnection.send(snapshot);
    lastScoreSyncAt=now;
    lastScoreSyncPayload=signature;
  }catch{}
}
function selectSong(song) {
  if (!song || !extractYouTubeId(song.id)) return;
  cancelAutoAdvance();
  current = song;
  playing = false; // não somar medições antes de a nova música realmente tocar
  setText('currentSong',song.title);
  setText('currentArtist',song.channel || 'Vídeo do YouTube');
  $('favoriteCurrentBtn').textContent = favorites.some(s=>s.id===song.id)?'♥':'♡';
  $('playerPlaceholder').classList.add('hidden');
  resetScore();
  loadLyricsForSong();
  setStageMode(true);
  const url = new URL(window.location.href); url.searchParams.set('v',song.id);
  window.history.replaceState(null,'',url.toString());
  if (playerReady && player) { player.loadVideoById(song.id); }
  else if (window.YT?.Player) createPlayer(song.id);
  else notify('Carregando player oficial do YouTube…',true);
}
function createPlayer(videoId) {
  if (player) { if (playerReady) player.loadVideoById(videoId); return; }
  player = new window.YT.Player('yt-player',{width:'100%',height:'100%',videoId,playerVars:{playsinline:1,rel:0,origin:location.origin},events:{
    onReady:()=>{playerReady=true;if(current?.id && current.id!==videoId)player.loadVideoById(current.id);},
    onStateChange:(ev)=>{
      if (ev.data === window.YT.PlayerState.ENDED) {
        finishPresentation();
      } else if (ev.data === window.YT.PlayerState.PLAYING) {
        // Replay do mesmo vídeo é uma nova apresentação.
        if (finished) resetScore();
        playing = true;
      } else {
        // Pause e buffering suspendem a análise, mas preservam a avaliação.
        playing = false;
      }
      sendScoreToPhone(true);
    },
    onError:(ev)=>{playing=false;notify(`Esse vídeo pode não permitir reprodução incorporada (código ${ev.data}). Tente outro resultado.`);}
  }});
}
window.onYouTubeIframeAPIReady = () => { if(current) createPlayer(current.id); };
function resetScore() {
  score=newScore();
  lyricsAttempt=newLyricsAttempt();
  finished=false;
  setText('scoreNum','--');
  setText('scoreLabel','Pronto para cantar');
  $('scoreMeter').style.width='0%';
  setText('pitchNote','♪ Aguardando voz');
  setText('voiceLevel','♫ Sem sinal');
  setText('lyricsScoreNum','--/100');
  setText('lyricsRecognizedCount','0 palavras reconhecidas');
  setText('lyricsCoverage',lyricsReference?'Aguardando reconhecimento':'Sem letra de referência');
  $('finalResult').classList.add('hidden');
  $('scoreCheer').classList.add('hidden');
  $('confettiLayer').replaceChildren();
  lastCheerAt=0;
  clearTimeout(cheerTimer);clearTimeout(confettiTimer);
  sendScoreToPhone(true);
}
function finishPresentation() {
  if(finished||!current)return;
  playing=false;finished=true;
  const result=buildFinalResult(score);
  $('finalResult').classList.remove('hidden');
  setText('scoreLabel','Apresentação encerrada');
  renderQueue();
  if(!result.enoughVoice) {
    setText('finalScoreNum','--');
    setText('finalScoreMessage','Não detectamos canto suficiente para avaliar. Verifique o microfone.');
    $('scoreNum').innerHTML='--<small>/100</small>';
    $('scoreMeter').style.width='0%';
    sendScoreToPhone(true);scheduleAutoAdvance();return;
  }
  const points=totalScore();
  const lyrics=lyricsMetrics();
  if(lyrics?.reliable) {
    setText('lyricsScoreNum',lyrics.points+'/100');
    setText('lyricsStatus','Letra: '+lyrics.points+'/100. Avaliação estimada a partir do reconhecimento da voz.');
  }
  setText('finalScoreNum',String(points));
  setText('finalScoreMessage',lyrics?.reliable
    ? 'Voz: '+result.points+'/100 · Letra: '+lyrics.points+'/100 · Nota geral: '+points+'/100'
    : points>=85?'Mandou muito bem! 🎤':points>=70?'Boa apresentação!':points>=50?'Valeu o show! Continue praticando.':'A próxima música pode render uma nota maior!');
  $('scoreNum').innerHTML=`${points}<small>/100</small>`;
  $('scoreMeter').style.width=points+'%';
  celebrateFinal(points);
  sendScoreToPhone(true);
  scheduleAutoAdvance();
}
function activeMicSource(now = Date.now()) {
  return selectedMicSource({
    remoteConnected: Boolean(remoteConnection?.open),
    remoteLastAt: lastRemotePitchAt,
    localEnabled: Boolean(localMicStop),
    now,
  });
}
function updateMicSourceLabel() {
  const source = activeMicSource();
  setText('micSourceStatus',
    source === 'phone' ? '🎤 Pontuando pelo celular · Mac em espera'
    : source === 'mac' ? '🎙 Pontuando pelo Mac · reserva automática'
    : remoteConnection?.open ? '📱 Celular conectado · aguardando microfone'
    : '🎤 Nenhum microfone ativo');
}
function consumeMeasurement(m, origin = 'mac') {
  if (!m || typeof m !== 'object' || !Number.isFinite(m.rms) || !Number.isFinite(m.clarity)) return;
  const now = Date.now();
  // Medições do celular, mesmo no silêncio, confirmam que o microfone está ativo.
  if (origin === 'phone') {
    if (!remoteConnection?.open) return;
    lastRemotePitchAt = now;
  }
  updateMicSourceLabel();
  if (origin !== activeMicSource(now)) return;
  lastPitch=m;
  setText('pitchNote',m.voice ? `♪ ${noteName(m.hz)}` : '♪ Aguardando voz');
  setText('voiceLevel',m.voice ? '♫ Voz detectada' : '♫ Sem voz clara');
  if (!playing || !current || finished) return;
  addScoreFrame(score,m);
  sendScoreToPhone(false);
  if(score.vocalFrames<10){
    setText('scoreLabel','Analisando seu canto…');
    return;
  }
  updateLiveScore();
  sendScoreToPhone(false);
}
async function startMicAnalysis(onMeasurement, deviceId = '') {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone exige HTTPS (ou localhost) e navegador compatível.');
  const audioConstraints={echoCancellation:true,noiseSuppression:true,autoGainControl:false};
  if(deviceId)audioConstraints.deviceId={exact:deviceId};
  const stream = await navigator.mediaDevices.getUserMedia({ audio:audioConstraints, video:false });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {await ctx.resume();} catch {}
  const src=ctx.createMediaStreamSource(stream); const analyser=ctx.createAnalyser(); analyser.fftSize=4096; analyser.smoothingTimeConstant=.2;src.connect(analyser);
  const buffer=new Float32Array(2048);
  let stopped=false;
  const timer=setInterval(()=>{
    if(stopped||ctx.state==='closed') return;
    analyser.getFloatTimeDomainData(buffer);
    const m=estimateVoice(buffer,ctx.sampleRate);
    onMeasurement(m);
  },180);
  const stop=()=>{stopped=true;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());src.disconnect();ctx.close().catch(()=>{});};
  stop.deviceLabel=stream.getAudioTracks()[0]?.label||'Microfone ativo';
  return stop;
}
function roomUrl(code){const url=new URL(window.location.href);url.search='';url.searchParams.set('remote',code);url.hash='';return url.toString();}
function setConnectionStatus(label,connected=false){setText('connectionStatus',label);$('connectionStatus').classList.toggle('connected',connected);}
function generateRoomCode(rotate=false){return persistentRoomCode({storage:localStorage,randomBytes:n=>crypto.getRandomValues(new Uint8Array(n)),rotate});}
function createRoom(rotate=false) {
  if(typeof window.Peer!=='function') {setConnectionStatus('Não foi possível carregar a conexão remota. Verifique internet.');return;}
  if(peer){try{peer.destroy();}catch{}peer=null;}
  remoteConnection=null;
  lastRemotePitchAt=0;
  lastScoreSyncPayload='';
  lastScoreSyncAt=0;
  updateMicSourceLabel();
  room=generateRoomCode(rotate);
  peer=new window.Peer('kmundo-'+room,{debug:0});
  setConnectionStatus('Criando sala…');
  $('createRoomBtn').disabled=true;
  peer.on('open',()=>{
    setConnectionStatus('Sala ativa. Aguardando celular…');
    $('roomDetails').classList.remove('hidden');
    setText('roomCode',room.slice(0,8)+'…'+room.slice(-6));
    $('qrCode').replaceChildren();
    if(window.QRCode) new window.QRCode($('qrCode'),{text:roomUrl(room),width:106,height:106,correctLevel:window.QRCode.CorrectLevel.M});
    else $('qrCode').textContent='QR indisponível';
    $('createRoomBtn').disabled=false;
    $('createRoomBtn').textContent='Trocar QR (desvincula celular) ↻';
  });
  peer.on('connection',conn=>{
    if(remoteConnection && remoteConnection!==conn){try{remoteConnection.close();}catch{}}
    remoteConnection=conn;
    conn.on('open',()=>{lastRemotePitchAt=0;lastScoreSyncPayload='';lastScoreSyncAt=0;setConnectionStatus('✓ Celular conectado · aguardando voz',true);updateMicSourceLabel();conn.send({type:'welcome'});sendScoreToPhone(true);});
    conn.on('data',m=>{
      if (remoteConnection !== conn) return;
      if (m?.type === 'pitch') {
        consumeMeasurement(m, 'phone');
        if (activeMicSource()==='phone') setConnectionStatus('✓ Celular é o microfone principal',true);
      } else if(m?.type === 'lyrics-phrase') {
        receiveLyricsPhrase(m);
      } else if (m?.type === 'mic-status' && m.active === false) {
        lastRemotePitchAt=0;
        setConnectionStatus('Celular conectado · microfone pausado',true);
        updateMicSourceLabel();
      }
    });
    conn.on('close',()=>{if(remoteConnection===conn) {remoteConnection=null;lastRemotePitchAt=0;setConnectionStatus('Celular desconectado. Reabra o link.');updateMicSourceLabel();}});
    conn.on('error',()=>{if(remoteConnection===conn){lastRemotePitchAt=0;updateMicSourceLabel();}setConnectionStatus('Erro na conexão com o celular.');});
  });
  peer.on('error',(err)=>{setConnectionStatus(`Falha na sala: ${err.message}. Tentando recuperar…`);$('createRoomBtn').disabled=false;});
  peer.on('disconnected',()=>{
    lastRemotePitchAt=0;updateMicSourceLabel();setConnectionStatus('Reconectando a sala automaticamente…');
    const activePeer=peer;
    setTimeout(()=>{if(peer===activePeer&&activePeer?.disconnected&&!activePeer.destroyed){try{activePeer.reconnect();}catch{}}},1800);
  });
}
function initPhoneMode(roomCode) {
  $('desktopApp').classList.add('hidden');$('phoneApp').classList.remove('hidden');
  const status=$('phoneStatus');const startBtn=$('startPhoneMicBtn');
  const micSelect=$('phoneMicSelect');const refreshMicsBtn=$('refreshPhoneMicsBtn');const micHint=$('phoneMicHint');
  const keepAwake=createScreenAwake({
    onStatus:(state)=>{
      const labels={
        idle:'🌙 Microfone pausado: bloqueio normal da tela.',
        requesting:'🔆 Ativando tela sempre ligada…',
        active:'✅ Tela mantida acesa durante o canto.',
        hidden:'⚠️ BoraKê em segundo plano. Volte para a página para manter o microfone ativo.',
        unsupported:'⚠️ Seu navegador não oferece bloqueio automático da tela. Mantenha-a ligada manualmente.',
        unavailable:'⚠️ O sistema não autorizou manter a tela acesa. Verifique o modo de economia de bateria.',
        released:'⚠️ O celular liberou a tela. Toque em “Manter tela acesa” para tentar novamente.',
      };
      setText('phoneWakeStatus',labels[state]||labels.idle);
      $('phoneWakeRetryBtn').classList.toggle('hidden',!['released','unavailable'].includes(state));
    },
  });
  $('phoneWakeRetryBtn').addEventListener('click',()=>{if(stopFn)void keepAwake.start();});
  const handleVisibility=()=>{keepAwake.visibilityChange();};
  document.addEventListener('visibilitychange',handleVisibility);

  if(!isValidRoomCode(roomCode)){status.textContent='Código antigo ou inválido. Escaneie o QR novo uma única vez para vincular este navegador.';return;}
  if(typeof window.Peer!=='function') {status.textContent='Biblioteca de conexão não carregou. Verifique a internet e recarregue.';return;}
  const phonePeer=new window.Peer(undefined,{debug:0});
  let connection=null;let stopFn=null;let micDevicesReady=false;
  const MIC_DEVICE_KEY='borake-phone-mic-device';
  const externalMicPattern=/usb|wireless|lapel|lavalier|headset|receiver|receptor|externo|external/i;
  async function refreshPhoneMics(requestPermission=false) {
    let probe=null;
    try {
      if(requestPermission)probe=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
      const saved=localStorage.getItem(MIC_DEVICE_KEY)||'';
      const previous=micSelect.value||saved;
      micSelect.replaceChildren();
      if(!devices.length){
        const option=document.createElement('option');option.value='';option.textContent='Microfone padrão do celular';micSelect.append(option);
        micHint.textContent='O Chrome não mostrou entradas separadas. Reconecte o receptor USB-C e toque em Detectar.';
        micDevicesReady=true;return '';
      }
      devices.forEach((device,index)=>{
        const option=document.createElement('option');
        option.value=device.deviceId;
        option.textContent=device.label||('Microfone '+(index+1));
        micSelect.append(option);
      });
      const preferred=devices.find(d=>d.deviceId===previous)
        || devices.find(d=>externalMicPattern.test(d.label))
        || devices.find(d=>d.deviceId==='default')
        || devices[0];
      micSelect.value=preferred.deviceId;
      localStorage.setItem(MIC_DEVICE_KEY,preferred.deviceId);
      micHint.textContent=devices.length>1
        ? 'Selecione a lapela/receptor USB-C antes de ativar.'
        : 'Entrada encontrada: '+(preferred.label||'microfone disponível');
      micDevicesReady=true;
      return preferred.deviceId;
    } finally {
      probe?.getTracks().forEach(track=>track.stop());
    }
  }
  refreshMicsBtn.addEventListener('click',async()=>{
    refreshMicsBtn.disabled=true;micHint.textContent='Procurando entradas de áudio…';
    try{await refreshPhoneMics(true);}catch(e){micHint.textContent='Não foi possível listar os microfones: '+e.message;}
    finally{refreshMicsBtn.disabled=false;}
  });
  micSelect.addEventListener('change',()=>{
    localStorage.setItem(MIC_DEVICE_KEY,micSelect.value);
    micHint.textContent='Selecionado: '+(micSelect.selectedOptions[0]?.textContent||'microfone');
  });
  if(navigator.mediaDevices?.addEventListener)navigator.mediaDevices.addEventListener('devicechange',()=>{if(!stopFn)void refreshPhoneMics(false);});
  void refreshPhoneMics(false).catch(()=>{});
  const speechCtor=window.SpeechRecognition || window.webkitSpeechRecognition;
  const lyricsConsent=$('lyricsConsent');
  const speechButton=$('startLyricsRecognitionBtn');
  const speechLang=$('lyricsLanguage');
  let recognition=null, speechRequested=false, speechRestart=null, lastSpeechSent='';
  function speechStatus(message){setText('phoneLyricsStatus',message);}
  function refreshSpeechButton() {
    speechButton.disabled=!stopFn || !lyricsConsent.checked || !speechCtor;
    speechButton.textContent=speechRequested?'■ Parar reconhecimento':'🗣 Ativar comparação de letra';
    if(!speechCtor)speechStatus('Reconhecimento de fala indisponível neste navegador. A nota vocal continua normalmente.');
  }
  function stopSpeech() {
    speechRequested=false;clearTimeout(speechRestart);speechRestart=null;
    if(recognition){const old=recognition;recognition=null;try{old.abort();}catch{}}
    speechStatus('Reconhecimento pausado. A nota vocal continua ativa.');
    refreshSpeechButton();
  }
  function startSpeech() {
    if(!speechCtor||!stopFn||!lyricsConsent.checked) {
      speechStatus('Ative primeiro o microfone e autorize o reconhecimento.');
      return;
    }
    if(!speechRequested)lastSpeechSent='';
    speechRequested=true;
    refreshSpeechButton();
    try {
      if(recognition){try{recognition.abort();}catch{}}
      const instance=new speechCtor();recognition=instance;
      instance.lang=speechLang.value;
      instance.continuous=true;instance.interimResults=false;instance.maxAlternatives=1;
      instance.onresult=event=>{
        if(!speechRequested||recognition!==instance||!lyricsConsent.checked)return;
        for(let i=event.resultIndex;i<event.results.length;i++){
          const res=event.results[i];if(!res?.isFinal)continue;
          const phrase=String(res[0]?.transcript||'').trim().slice(0,450);
          if(!phrase||phrase===lastSpeechSent)continue;
          lastSpeechSent=phrase;
          if(connection?.open){try{connection.send({type:'lyrics-phrase',phrase});}catch{}}
          speechStatus('📝 Reconhecido: '+phrase.slice(0,90));
        }
      };
      instance.onerror=event=>{
        const code=event?.error||'indisponível';
        if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(code)){
          stopSpeech();
          speechStatus('Permissão ou recurso indisponível ('+code+'). A nota vocal continua ativa.');
        }else speechStatus('Reconhecimento temporariamente indisponível: '+code);
      };
      instance.onend=()=>{
        if(recognition!==instance)return;
        recognition=null;
        if(speechRequested&&stopFn&&lyricsConsent.checked&&document.visibilityState==='visible')
          speechRestart=setTimeout(()=>{if(speechRequested)startSpeech();},1200);
      };
      instance.start();
      speechStatus('🎙 Reconhecendo palavras. O navegador pode processar o áudio em serviço externo.');
    }catch(e){
      speechRequested=false;
      speechStatus('Não foi possível reconhecer o canto: '+(e?.message||'recurso indisponível'));
      refreshSpeechButton();
    }
  }
  lyricsConsent.addEventListener('change',()=>{if(!lyricsConsent.checked)stopSpeech();refreshSpeechButton();});
  speechButton.addEventListener('click',()=>speechRequested?stopSpeech():startSpeech());
  speechLang.addEventListener('change',()=>{if(speechRequested){stopSpeech();startSpeech();}});
  refreshSpeechButton();
  function showPhoneScore(raw) {
    const data = validateScoreSnapshot(raw);
    if (!data) return;
    const states = {
      waiting:'Aguardando música', ready:'Pronto para cantar',
      playing:'AO VIVO', paused:'Música pausada', finished:'RESULTADO FINAL',
    };
    setText('phoneScoreState',states[data.phase]);
    setText('phoneScoreSong', data.title || 'Escolha uma música no computador.');
    setText('phoneScoreNum',data.points === null ? '--' : String(data.points));
    $('phoneScoreFill').style.width=(data.points ?? 0)+'%';
    $('phoneScorePanel').classList.toggle('phone-score-finished',data.phase==='finished');
    const melodyExtra=Number.isInteger(data.lyricsPoints) ? ' · Letra '+data.lyricsPoints+'/100' : '';
    setText('phoneScoreInfo',
      data.phase==='finished'
        ? (data.points === null ? 'Sem avaliação: não foi detectado canto suficiente.' : 'Nota final do palco'+melodyExtra)
        : data.points !== null ? 'Sincronizado com o palco'+melodyExtra : 'Sua nota aparecerá após alguns segundos de canto.');
  }
  function clearPhoneScore(message='Conecte ao computador para ver a nota.') {
    setText('phoneScoreNum','--');
    setText('phoneScoreState','Desconectado');
    setText('phoneScoreInfo',message);
    $('phoneScoreFill').style.width='0%';
    $('phoneScorePanel').classList.remove('phone-score-finished');
  }
  let reconnectTimer=null;
  let pageClosed=false;
  function scheduleReconnect() {
    if(pageClosed||connection?.open||reconnectTimer)return;
    status.classList.remove('good');
    status.textContent='Reconectando ao palco automaticamente…';
    setText('phoneScoreInfo','Reconectando sem perder o vínculo. Não escaneie outro QR.');
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;connectToDesktop();},2000);
  }
  function connectToDesktop() {
    if(pageClosed||!phonePeer.open||connection?.open)return;
    if(connection){try{connection.close();}catch{}connection=null;}
    const candidate=phonePeer.connect('kmundo-'+roomCode,{reliable:true,serialization:'json'});
    connection=candidate;
    candidate.on('open',()=>{
      if(connection!==candidate)return;
      clearTimeout(reconnectTimer);reconnectTimer=null;
      status.textContent='✓ Conectado ao palco BoraKê';
      status.classList.add('good');startBtn.disabled=false;
      setText('phoneScoreState','Sincronizando…');
      if(stopFn)candidate.send({type:'mic-status',active:true});
    });
    candidate.on('data',data=>{if(connection===candidate)showPhoneScore(data);});
    candidate.on('close',()=>{if(connection===candidate){connection=null;scheduleReconnect();}});
    candidate.on('error',()=>{if(connection===candidate){connection=null;scheduleReconnect();}});
  }
  phonePeer.on('open',()=>{status.textContent='Conectando ao palco…';connectToDesktop();});
  phonePeer.on('disconnected',()=>{
    if(pageClosed)return;
    status.textContent='Recuperando conexão com o servidor…';
    setTimeout(()=>{if(phonePeer.disconnected&&!phonePeer.destroyed){try{phonePeer.reconnect();}catch{}scheduleReconnect();}},1500);
  });
  phonePeer.on('error',err=>{
    if(pageClosed)return;
    if(err.type==='peer-unavailable'||err.type==='network'||err.type==='socket-error'){
      scheduleReconnect();
    } else {
      status.textContent='Conexão indisponível. Confira sua internet ('+(err.type||'erro')+').';
      clearPhoneScore();
    }
  });
  startBtn.addEventListener('click',async()=>{
    if(stopFn){stopSpeech();stopFn();stopFn=null;void keepAwake.stop();if(connection?.open)connection.send({type:'mic-status',active:false});startBtn.textContent='Ativar microfone';setText('phoneMeterText','Microfone pausado');micSelect.disabled=false;refreshMicsBtn.disabled=false;return;}
    startBtn.disabled=true;
    // Inicie a requisição dentro do clique, antes do prompt assíncrono do microfone.
    // Assim Safari e Chrome podem conceder o bloqueio na mesma interação.
    void keepAwake.start();
    try {
      if(!micDevicesReady)await refreshPhoneMics(true);
      const selectedDevice=micSelect.value;
      stopFn=await startMicAnalysis(m=>{
        if(connection?.open)connection.send({type:'pitch',hz:m.hz,clarity:m.clarity,rms:m.rms,voice:m.voice});
        setText('phoneNote',m.voice?noteName(m.hz):'--');
        setText('phoneMeterText',m.voice?'Sua voz está sendo detectada':'Aproxime o celular da boca');
        $('phoneMeterFill').style.width=Math.min(100,Math.round(m.rms*400))+'%';
        $('phoneVoiceIndicator').style.transform=`scale(${1+Math.min(.23,m.rms*.9)})`;
      },selectedDevice);
      if(selectedDevice)localStorage.setItem(MIC_DEVICE_KEY,selectedDevice);
      micHint.textContent='Ativo: '+(stopFn.deviceLabel||micSelect.selectedOptions[0]?.textContent||'microfone');
      micSelect.disabled=true;refreshMicsBtn.disabled=true;
      if(connection?.open)connection.send({type:'mic-status',active:true});
      startBtn.textContent='Pausar microfone';
      refreshSpeechButton();
    } catch(e){void keepAwake.stop();status.classList.remove('good');status.textContent='Não foi possível abrir o microfone: '+e.message;}
    finally {startBtn.disabled=false;refreshSpeechButton();}
  });
  window.addEventListener('pagehide',()=>{pageClosed=true;stopSpeech();clearTimeout(reconnectTimer);if(stopFn)stopFn();stopFn=null;void keepAwake.stop();document.removeEventListener('visibilitychange',handleVisibility);phonePeer.destroy();});
}
function initDesktop() {
  // Chaves legadas do YouTube não precisam ficar salvas no navegador.
  localStorage.removeItem('karaoke-youtube-key');
  renderChips();renderFavorites();renderQueue();renderStarterCatalog();
  updateMicSourceLabel();
  // Atualiza aviso inclusive quando o celular simplesmente para de transmitir.
  const sourceIndicatorTimer=setInterval(updateMicSourceLabel,750);
  document.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>{
    region=b.dataset.region;document.querySelectorAll('[data-region]').forEach(t=>t.classList.toggle('active',t===b));renderChips();renderStarterCatalog($('searchInput').value);
  }));
  $('searchForm').addEventListener('submit',e=>{e.preventDefault();runSearch($('searchInput').value);});
  $('heroSearchBtn').addEventListener('click',()=>{$('songLibrary').scrollIntoView({behavior:motionReduced()?'auto':'smooth',block:'start'});$('searchInput').focus({preventScroll:true});});
  $('heroPhoneBtn').addEventListener('click',focusPhonePanel);
  $('headerConnectBtn').addEventListener('click',focusPhonePanel);
  $('headerStageBtn').addEventListener('click',()=>setStageMode(!stageMode));
  $('toggleStageBtn').addEventListener('click',()=>setStageMode(!stageMode));
  $('fullscreenBtn').addEventListener('click',async()=>{
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch {notify('O navegador não permitiu abrir a tela cheia. O modo palco continua disponível.');}
  });
  $('playQueueBtn').addEventListener('click',()=>playQueuedSong());
  $('playNextFromFinalBtn').addEventListener('click',()=>playQueuedSong());
  $('clearQueueBtn').addEventListener('click',()=>{songQueue=[];saveQueue();renderQueue();});
  $('replayCurrentBtn').addEventListener('click',()=>{
    if(!current || !playerReady || !player)return;
    resetScore();player.seekTo(0,true);player.playVideo();
  });
  document.addEventListener('fullscreenchange',()=>{$('fullscreenBtn').textContent=document.fullscreenElement?'↙ Sair da tela cheia':'⛶ Tela cheia';});

  $('directBtn').addEventListener('click',()=>{
    const id=extractYouTubeId($('directInput').value);
    if(!id){notify('Link inválido. Use uma URL de vídeo do YouTube ou um ID de 11 caracteres.');return;}
    selectSong({id,title:'Vídeo selecionado do YouTube',channel:'Karaokê online'});
    notify('Vídeo carregado. Se não reproduzir, o proprietário pode ter bloqueado a incorporação.',true);
  });
  $('favoriteCurrentBtn').addEventListener('click',()=>{
    if(!current)return;
    if(favorites.some(s=>s.id===current.id))favorites=favorites.filter(s=>s.id!==current.id);
    else favorites.unshift(current);
    localStorage.setItem('karaoke-favorites',JSON.stringify(favorites.slice(0,75)));
    $('favoriteCurrentBtn').textContent=favorites.some(s=>s.id===current.id)?'♥':'♡';renderFavorites();
  });
  $('manualLyricsBtn').addEventListener('click',()=>{$('lyricsManualBox').classList.toggle('hidden');});
  $('saveManualLyricsBtn').addEventListener('click',()=>{
    if(!current){notify('Selecione uma música antes de configurar a letra.');return;}
    const supplied=$('lyricsManualText').value.trim();
    const reference=makeLyricsReference(supplied);
    if(!reference){notify('Informe pelo menos 16 palavras de uma letra que você tem autorização para utilizar.');return;}
    try { localStorage.setItem(lyricsKey(current.id),supplied); }
    catch {notify('Não foi possível salvar a letra neste navegador.');return;}
    lyricsReference=reference;
    lyricsAttempt=newLyricsAttempt();
    updateLyricsStatus();
    notify('Letra de referência pronta. Ative o reconhecimento no celular para comparar.',true);
    sendScoreToPhone(true);
  });
  $('clearLyricsBtn').addEventListener('click',()=>{
    if(!current)return;
    try{localStorage.removeItem(lyricsKey(current.id));}catch{}
    lyricsReference=null;lyricsAttempt=newLyricsAttempt();
    updateLyricsStatus();sendScoreToPhone(true);
  });
  $('resetScoreBtn').addEventListener('click',resetScore);
  $('localMicBtn').addEventListener('click',async()=>{
    if(localMicStop){localMicStop();localMicStop=null;updateMicSourceLabel();$('localMicBtn').textContent='🎙 Microfone do Mac';return;}
    try{localMicStop=await startMicAnalysis(m=>consumeMeasurement(m,'mac'));updateMicSourceLabel();$('localMicBtn').textContent='◼ Parar microfone do Mac';}
    catch(e){alert('Não foi possível abrir o microfone: '+e.message);}
  });
  $('createRoomBtn').addEventListener('click',()=>createRoom(true));
  $('copyRoomBtn').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(roomUrl(room));$('copyRoomBtn').textContent='Link copiado ✓';}catch{$('copyRoomBtn').textContent='Não foi possível copiar';}
  });
  $('settingsBtn').addEventListener('click',()=>{ $('settingsDialog').showModal(); });
  $('settingsForm').addEventListener('submit',e=>{e.preventDefault();$('settingsDialog').close();});
  $('clearKeyBtn').addEventListener('click',()=>{localStorage.removeItem('karaoke-youtube-key');$('settingsDialog').close();notify('Chave antiga removida deste navegador. A pesquisa agora usa o servidor.',true);});
  const params=new URLSearchParams(location.search);
  const initialId=extractYouTubeId(params.get('v'));
  // O QR pertence a este navegador, não à sessão atual. Ao reabrir, restaura
  // automaticamente a mesma sala para o celular usar o link salvo.
  if(typeof window.Peer==='function')createRoom(false);
  if(initialId)selectSong({id:initialId,title:'Música compartilhada',channel:'YouTube'});
  window.addEventListener('pagehide',()=>{clearInterval(sourceIndicatorTimer);if(localMicStop)localMicStop();if(peer)peer.destroy();});
}
const remoteCode=new URLSearchParams(location.search).get('remote');
if(remoteCode) initPhoneMode(remoteCode.toUpperCase()); else initDesktop();
