import { estimateVoice, noteName, newScore, addScoreFrame, calculateFunScore, extractYouTubeId, buildFinalResult } from './audio.js';
import { selectedMicSource } from './mic-source.js';

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
function selectSong(song) {
  if (!song || !extractYouTubeId(song.id)) return;
  current = song;
  setText('currentSong',song.title);
  setText('currentArtist',song.channel || 'Vídeo do YouTube');
  $('favoriteCurrentBtn').textContent = favorites.some(s=>s.id===song.id)?'♥':'♡';
  $('playerPlaceholder').classList.add('hidden');
  resetScore();
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
    },
    onError:(ev)=>{playing=false;notify(`Esse vídeo pode não permitir reprodução incorporada (código ${ev.data}). Tente outro resultado.`);}
  }});
}
window.onYouTubeIframeAPIReady = () => { if(current) createPlayer(current.id); };
function resetScore() {
  score = newScore();
  finished = false;
  setText('scoreNum','--');
  setText('scoreLabel','Pronto para cantar');
  $('scoreMeter').style.width='0%';
  setText('pitchNote','♪ Aguardando voz');
  setText('voiceLevel','♫ Sem sinal');
  $('finalResult').classList.add('hidden');
  $('scoreCheer').classList.add('hidden');
  $('confettiLayer').replaceChildren();
  lastCheerAt=0;
  clearTimeout(cheerTimer);
  clearTimeout(confettiTimer);
}

function finishPresentation() {
  if (finished || !current) return;
  playing = false;
  finished = true;
  const result = buildFinalResult(score);
  $('finalResult').classList.remove('hidden');
  setText('scoreLabel', 'Apresentação encerrada');
  renderQueue();
  if (!result.enoughVoice) {
    setText('finalScoreNum','--');
    setText('finalScoreMessage','Não detectamos canto suficiente para gerar uma nota. Tente novamente com o microfone ativado.');
    $('scoreNum').innerHTML='--<small>/100</small>';
    $('scoreMeter').style.width='0%';
    return;
  }
  const points = result.points;
  // A nota é uma fotografia do desempenho durante o vídeo, não pontos ilimitados.
  setText('finalScoreNum', String(points));
  setText('finalScoreMessage', points >= 85 ? 'Mandou muito bem! 🎤' : points >= 70 ? 'Boa apresentação!' : points >= 50 ? 'Valeu o show! Continue praticando.' : 'A próxima música pode render uma nota maior!');
  $('scoreNum').innerHTML=`${points}<small>/100</small>`;
  $('scoreMeter').style.width=points+'%';
  celebrateFinal(points);
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
  // Só exibir nota após amostra mínima para evitar pontuação alta por um grito curto.
  if (score.vocalFrames < 10) {
    setText('scoreLabel', 'Analisando seu canto…');
    return;
  }
  const points=calculateFunScore(score);
  $('scoreNum').innerHTML=`${points}<small>/100</small>`;
  $('scoreMeter').style.width=points+'%';
  setText('scoreLabel',points >= 85?'Arrasou! ✨':points >= 70?'Muito bom!':'Continue cantando!');
  announceCheer(points);
}
async function startMicAnalysis(onMeasurement) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microfone exige HTTPS (ou localhost) e navegador compatível.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true,noiseSuppression:true,autoGainControl:false }, video:false });
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
  return ()=>{stopped=true;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());src.disconnect();ctx.close().catch(()=>{});};
}
function roomUrl(code){const url=new URL(window.location.href);url.search='';url.searchParams.set('remote',code);url.hash='';return url.toString();}
function setConnectionStatus(label,connected=false){setText('connectionStatus',label);$('connectionStatus').classList.toggle('connected',connected);}
function generateRoomCode(){const a=new Uint8Array(4); crypto.getRandomValues(a);return Array.from(a,n=>(n%32).toString(32).toUpperCase()).join('') + Math.floor(Math.random()*90+10);}
function createRoom() {
  if(typeof window.Peer!=='function') {setConnectionStatus('Não foi possível carregar a conexão remota. Verifique internet.');return;}
  if(peer){try{peer.destroy();}catch{}peer=null;}
  remoteConnection=null;
  lastRemotePitchAt=0;
  updateMicSourceLabel();
  room=generateRoomCode();
  peer=new window.Peer('kmundo-'+room,{debug:0});
  setConnectionStatus('Criando sala…');
  $('createRoomBtn').disabled=true;
  peer.on('open',()=>{
    setConnectionStatus('Sala ativa. Aguardando celular…');
    $('roomDetails').classList.remove('hidden');
    setText('roomCode',room);
    $('qrCode').replaceChildren();
    if(window.QRCode) new window.QRCode($('qrCode'),{text:roomUrl(room),width:106,height:106,correctLevel:window.QRCode.CorrectLevel.M});
    else $('qrCode').textContent='QR indisponível';
    $('createRoomBtn').disabled=false;
    $('createRoomBtn').textContent='Gerar outra sala ↻';
  });
  peer.on('connection',conn=>{
    if(remoteConnection?.open) {conn.on('open',()=>conn.close());return;}
    remoteConnection=conn;
    conn.on('open',()=>{lastRemotePitchAt=0;setConnectionStatus('✓ Celular conectado · aguardando voz',true);updateMicSourceLabel();conn.send({type:'welcome'});});
    conn.on('data',m=>{
      if (remoteConnection !== conn) return;
      if (m?.type === 'pitch') {
        consumeMeasurement(m, 'phone');
        if (activeMicSource()==='phone') setConnectionStatus('✓ Celular é o microfone principal',true);
      } else if (m?.type === 'mic-status' && m.active === false) {
        lastRemotePitchAt=0;
        setConnectionStatus('Celular conectado · microfone pausado',true);
        updateMicSourceLabel();
      }
    });
    conn.on('close',()=>{if(remoteConnection===conn) {remoteConnection=null;lastRemotePitchAt=0;setConnectionStatus('Celular desconectado. Reabra o link.');updateMicSourceLabel();}});
    conn.on('error',()=>{if(remoteConnection===conn){lastRemotePitchAt=0;updateMicSourceLabel();}setConnectionStatus('Erro na conexão com o celular.');});
  });
  peer.on('error',(err)=>{setConnectionStatus(`Falha ao criar sala: ${err.message}`);$('createRoomBtn').disabled=false;});
  peer.on('disconnected',()=>{lastRemotePitchAt=0;updateMicSourceLabel();setConnectionStatus('Conexão ao servidor perdida. Tente criar outra sala.');});
}
function initPhoneMode(roomCode) {
  $('desktopApp').classList.add('hidden');$('phoneApp').classList.remove('hidden');
  const status=$('phoneStatus');const startBtn=$('startPhoneMicBtn');
  if(!/^[A-Z0-9]{6,12}$/.test(roomCode)){status.textContent='Código da sala inválido.';return;}
  if(typeof window.Peer!=='function') {status.textContent='Biblioteca de conexão não carregou. Verifique a internet e recarregue.';return;}
  const phonePeer=new window.Peer(undefined,{debug:0});
  let connection=null;let stopFn=null;
  phonePeer.on('open',()=>{
    status.textContent='Conectando ao MacBook…';
    connection=phonePeer.connect('kmundo-'+roomCode,{reliable:false});
    connection.on('open',()=>{status.textContent='✓ Conectado ao MacBook';status.classList.add('good');startBtn.disabled=false;});
    connection.on('close',()=>{status.classList.remove('good');status.textContent='Conexão encerrada. Reabra o link no celular.';startBtn.disabled=true;if(stopFn)stopFn();});
    connection.on('error',(err)=>{status.textContent='Erro de conexão: '+err.message;});
  });
  phonePeer.on('error',err=>{status.textContent=`Não foi possível conectar (${err.type||'erro'}). Confira o código e tente novamente.`;});
  startBtn.addEventListener('click',async()=>{
    if(stopFn){stopFn();stopFn=null;if(connection?.open)connection.send({type:'mic-status',active:false});startBtn.textContent='Ativar microfone';setText('phoneMeterText','Microfone pausado');return;}
    startBtn.disabled=true;
    try {
      stopFn=await startMicAnalysis(m=>{
        if(connection?.open)connection.send({type:'pitch',hz:m.hz,clarity:m.clarity,rms:m.rms,voice:m.voice});
        setText('phoneNote',m.voice?noteName(m.hz):'--');
        setText('phoneMeterText',m.voice?'Sua voz está sendo detectada':'Aproxime o celular da boca');
        $('phoneMeterFill').style.width=Math.min(100,Math.round(m.rms*400))+'%';
        $('phoneVoiceIndicator').style.transform=`scale(${1+Math.min(.23,m.rms*.9)})`;
      });
      if(connection?.open)connection.send({type:'mic-status',active:true});
      startBtn.textContent='Pausar microfone';
    } catch(e){status.classList.remove('good');status.textContent='Não foi possível abrir o microfone: '+e.message;}
    finally {startBtn.disabled=false;}
  });
  window.addEventListener('pagehide',()=>{if(stopFn)stopFn();phonePeer.destroy();});
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
  $('resetScoreBtn').addEventListener('click',resetScore);
  $('localMicBtn').addEventListener('click',async()=>{
    if(localMicStop){localMicStop();localMicStop=null;updateMicSourceLabel();$('localMicBtn').textContent='🎙 Microfone do Mac';return;}
    try{localMicStop=await startMicAnalysis(m=>consumeMeasurement(m,'mac'));updateMicSourceLabel();$('localMicBtn').textContent='◼ Parar microfone do Mac';}
    catch(e){alert('Não foi possível abrir o microfone: '+e.message);}
  });
  $('createRoomBtn').addEventListener('click',createRoom);
  $('copyRoomBtn').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(roomUrl(room));$('copyRoomBtn').textContent='Link copiado ✓';}catch{$('copyRoomBtn').textContent='Não foi possível copiar';}
  });
  $('settingsBtn').addEventListener('click',()=>{ $('settingsDialog').showModal(); });
  $('settingsForm').addEventListener('submit',e=>{e.preventDefault();$('settingsDialog').close();});
  $('clearKeyBtn').addEventListener('click',()=>{localStorage.removeItem('karaoke-youtube-key');$('settingsDialog').close();notify('Chave antiga removida deste navegador. A pesquisa agora usa o servidor.',true);});
  const params=new URLSearchParams(location.search);
  const initialId=extractYouTubeId(params.get('v'));
  if(initialId)selectSong({id:initialId,title:'Música compartilhada',channel:'YouTube'});
  window.addEventListener('pagehide',()=>{clearInterval(sourceIndicatorTimer);if(localMicStop)localMicStop();if(peer)peer.destroy();});
}
const remoteCode=new URLSearchParams(location.search).get('remote');
if(remoteCode) initPhoneMode(remoteCode.toUpperCase()); else initDesktop();
