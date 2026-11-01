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

export function newScore() { return { frames: 0, vocalFrames: 0, claritySum: 0, firstVocalAt: 0 }; }
export function addScoreFrame(score, measurement) {
  score.frames++;
  if (measurement.voice && measurement.rms >= 0.018 && measurement.clarity >= 0.67) {
    score.vocalFrames++;
    score.claritySum += Math.max(0, Math.min(1, measurement.clarity));
  }
  return score;
}
export function calculateFunScore(score) {
  if (!score.vocalFrames || !score.frames) return 0;
  const activeShare = score.vocalFrames / score.frames;
  const avgClarity = score.claritySum / score.vocalFrames;
  // This is deliberately generous and recreational. It does NOT assess correct melody.
  return Math.max(0, Math.min(100, Math.round(40 + 40 * activeShare + 20 * avgClarity)));
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
