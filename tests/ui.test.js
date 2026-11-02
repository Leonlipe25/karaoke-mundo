import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('BoraKê está definido na página e inclui recursos da festa',()=>{
  assert.match(html,/<title>BoraKê/);
  assert.match(html, /id="songQueue"/);
  assert.match(html, /id="playNextFromFinalBtn"/);
  assert.match(html, /id="toggleStageBtn"/);
  assert.match(html, /id="fullscreenBtn"/);
  assert.match(html, /id="confettiLayer"/);
  assert.match(html, /id="heroPhoneBtn"/);
  assert.match(html, /id="phoneMicSelect"/);
  assert.match(html, /id="refreshPhoneMicsBtn"/);
  assert.match(html, /id="forceUsbMic"/);
  assert.match(js, /micPermissionGranted/);
  assert.match(js, /deviceId=\{exact:deviceId\}/);
  assert.match(js, /scheduleAutoAdvance/);
  assert.match(js, /Reconectando sem perder o vínculo/);
  assert.match(css, /\.stage-mode \.side-column/);
  assert.match(css, /\.genre-chip/);
});
test('Todos os IDs usados via função $ existem uma única vez',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'IDs duplicados na página');
  const used=[...js.matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1]);
  const missing=used.filter(id=>!ids.includes(id));
  assert.deepEqual([...new Set(missing)],[]);
});
test('Fila salva somente IDs públicos e não publica segredos',()=>{
  assert.match(js, /borake-song-queue/);
  assert.match(js, /function playQueuedSong/);
  assert.match(js, /function renderQueue/);
  assert.doesNotMatch(js,/AIza[0-9A-Za-z_-]{30,}/);
});
