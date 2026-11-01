import { calculateFunScore, buildFinalResult } from './audio.js';

// Apenas dados recreativos da pontuação são compartilhados via PeerJS.
// Nenhuma gravação, letra ou chave de API transita nessa mensagem.
export function makeScoreSnapshot({ score, current, playing = false, finished = false }) {
  const title = typeof current?.title === 'string' ? current.title.slice(0, 160) : '';
  const phase = !current ? 'waiting' : finished ? 'finished' : playing ? 'playing' : score?.frames ? 'paused' : 'ready';
  const enoughVoice = (score?.vocalFrames || 0) >= 10;
  const result = finished ? buildFinalResult(score) : null;
  const points = finished
    ? (result.enoughVoice ? result.points : null)
    : enoughVoice ? calculateFunScore(score) : null;
  return { type: 'score-update', title, phase, points };
}

// Não confie cegamente nos dados recebidos: mantenha a UI limitada a 0..100.
export function validateScoreSnapshot(data) {
  if (!data || data.type !== 'score-update' || typeof data.title !== 'string' ||
      !['waiting','ready','playing','paused','finished'].includes(data.phase)) return null;
  if (data.points !== null && (!Number.isInteger(data.points) || data.points < 0 || data.points > 100)) return null;
  return { title: data.title.slice(0,160), phase: data.phase, points: data.points };
}
