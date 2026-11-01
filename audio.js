/** Lightweight browser-side pitch measurement, not a melody accuracy detector. */
export function estimateVoice(floatData, sampleRate) {
  let energy = 0;
  for (let i = 0; i < floatData.length; i++) energy += floatData[i] * floatData[i];
  const rms = Math.sqrt(energy / floatData.length);
  if (rms < 0.015) return { hz: 0, clarity: 0, rms, voice: false };

  // YIN-style cumulative mean normalized difference function.
  const minTau = Math.max(2, Math.floor(sampleRate / 950));
  const maxTau = Math.min(Math.floor(sampleRate / 75), Math.floor(floatData.length / 2) - 1);
  const difference = new Float32Array(maxTau + 1);
  const windowSize = floatData.length - maxTau;
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const delta = floatData[j] - floatData[j + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }
  let running = 0;
  for (let tau = minTau; tau <= maxTau; tau++) {
    running += difference[tau];
    difference[tau] = running > 0 ? (difference[tau] * (tau - minTau + 1)) / running : 1;
  }
  let bestTau = -1;
  let bestValue = 1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (difference[tau] < bestValue) { bestValue = difference[tau]; bestTau = tau; }
    if (difference[tau] < 0.17) {
      while (tau + 1 <= maxTau && difference[tau + 1] < difference[tau]) tau++;
      bestTau = tau;
      bestValue = difference[tau];
      break;
    }
  }
  const clarity = Math.max(0, Math.min(1, 1 - bestValue));
  const voice = bestTau > 0 && clarity > 0.67 && rms >= 0.018;
  return { hz: voice ? sampleRate / bestTau : 0, clarity, rms, voice };
}

export function noteName(frequency) {
  if (!frequency || !Number.isFinite(frequency) || frequency < 60 || frequency > 1300) return '--';
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const names = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
  return names[((midi % 12) + 12) % 12] + Math.floor(midi / 12 - 1);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Pontuação recreativa V2: avalia presença vocal, nitidez de tom, continuidade e
 * movimentação melódica. Não compara notas com a melodia correta da música.
 * Uma pessoa que canta outra melodia de maneira consistente ainda pode pontuar bem.
 * Frames chegam aproximadamente a cada 180 ms do microfone remoto ou local.
 */
export function newScore() {
  return {
    frames: 0,
    vocalFrames: 0,
    claritySum: 0,
    firstVocalAt: 0,
    lastMidi: null,
    pitchTransitions: 0,
    transitionQualitySum: 0,
    pitchRun: 0,
    sustainedFrames: 0,
    pitchBins: Object.create(null),
  };
}

export function addScoreFrame(score, measurement) {
  score.frames++;
  const voiced = measurement?.voice === true
    && Number.isFinite(measurement.rms) && measurement.rms >= 0.018
    && Number.isFinite(measurement.clarity) && measurement.clarity >= 0.67;

  if (!voiced) {
    score.lastMidi = null;
    score.pitchRun = 0;
    return score;
  }
  if (!score.firstVocalAt) score.firstVocalAt = score.frames;
  score.vocalFrames++;
  score.claritySum += clamp01(measurement.clarity);

  const hz = measurement.hz;
  if (!Number.isFinite(hz) || hz < 75 || hz > 950) {
    score.lastMidi = null;
    score.pitchRun = 0;
    return score;
  }
  const midi = 69 + 12 * Math.log2(hz / 440);
  const bin = Math.round(midi);
  score.pitchBins[bin] = (score.pitchBins[bin] || 0) + 1;

  if (score.lastMidi === null) {
    score.pitchRun = 1;
  } else {
    const step = Math.abs(midi - score.lastMidi);
    score.pitchTransitions++;
    // Pequenas variações (inclusive vibrato) são bem-vindas; saltos grandes
    // consecutivos indicam mais instabilidade ou erro de detecção que musicalidade.
    score.transitionQualitySum += step <= 1.5 ? 1 : step <= 3 ? 0.9 : step <= 5 ? 0.6 : step <= 8 ? 0.25 : 0;
    score.pitchRun = step <= 1.5 ? score.pitchRun + 1 : 1;
    if (score.pitchRun === 3) score.sustainedFrames += 3;
    else if (score.pitchRun > 3) score.sustainedFrames++;
  }
  score.lastMidi = midi;
  return score;
}

function robustPitchRange(pitchBins) {
  // Desconsidera breves picos isolados ao estimar a variedade de notas.
  const entries = Object.entries(pitchBins)
    .map(([midi, count]) => [Number(midi), count])
    .filter(([, count]) => count >= 2)
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total < 12) return 0;
  let sum = 0;
  let low = entries[0][0];
  let high = entries.at(-1)[0];
  for (const [midi, count] of entries) {
    sum += count;
    if (sum >= total * 0.10) { low = midi; break; }
  }
  sum = 0;
  for (const [midi, count] of entries) {
    sum += count;
    if (sum >= total * 0.90) { high = midi; break; }
  }
  return Math.max(0, high - low);
}

export function calculateFunScore(score) {
  if (!score?.vocalFrames || !score.firstVocalAt) return 0;
  const listeningFrames = score.frames - score.firstVocalAt + 1;
  const activeShare = score.vocalFrames / Math.max(1, listeningFrames);
  const avgClarity = score.claritySum / score.vocalFrames;
  const smoothness = score.pitchTransitions
    ? score.transitionQualitySum / score.pitchTransitions : 0;
  const sustainRatio = score.sustainedFrames / Math.max(1, score.vocalFrames);
  const variationSemitones = robustPitchRange(score.pitchBins);

  const points =
    23 * clamp01(activeShare / 0.82) +
    22 * clamp01((avgClarity - 0.67) / 0.30) +
    26 * clamp01(smoothness) +
    12 * clamp01(sustainRatio / 0.65) +
    17 * clamp01((variationSemitones - 1.5) / 7);

  // Um único grito ou poucos segundos de voz não podem render 90 pontos.
  const sampleCap = score.vocalFrames < 10 ? 55
    : score.vocalFrames < 25 ? 72
    : score.vocalFrames < 45 ? 84
    : 100;
  return Math.round(Math.min(sampleCap, 100, Math.max(0, points)));
}

export function extractYouTubeId(input) {
  const raw = String(input || '').trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  let url;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!['youtube.com', 'youtube-nocookie.com', 'music.youtube.com'].includes(host)) return null;
  const seg = url.pathname.split('/').filter(Boolean);
  const id = seg[0] === 'watch' ? url.searchParams.get('v') :
    (['shorts', 'embed', 'live', 'v'].includes(seg[0]) ? seg[1] : null);
  return /^[\w-]{11}$/.test(id || '') ? id : null;
}
