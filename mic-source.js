// Arbitragem entre microfones: nunca misturar amostras do Mac e do celular.
// O celular só tem prioridade se estiver conectado E transmitindo medições recentes.
export const REMOTE_STALE_MS = 1600;

export function selectedMicSource({
  remoteConnected = false,
  remoteLastAt = 0,
  localEnabled = false,
  now = Date.now(),
} = {}) {
  const fresh = remoteConnected && remoteLastAt > 0 && Number.isFinite(now)
    && now >= remoteLastAt && now - remoteLastAt <= REMOTE_STALE_MS;
  if (fresh) return 'phone';
  return localEnabled ? 'mac' : 'none';
}
