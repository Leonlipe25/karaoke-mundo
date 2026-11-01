/**
 * Mantém a tela do celular ligada enquanto o microfone do BoraKê está ativo.
 * Usa apenas a Screen Wake Lock API; não promete gravação em tela bloqueada.
 *
 * Os parâmetros injetados permitem testar o ciclo de vida sem navegador real.
 */
export function createScreenAwake({
  wakeLock = typeof navigator === 'undefined' ? undefined : navigator.wakeLock,
  isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible',
  onStatus = () => {},
} = {}) {
  let wanted = false;
  let sentinel = null;
  let pending = null;
  let revision = 0;

  const status = (value) => onStatus(value);
  const supported = () => typeof wakeLock?.request === 'function';

  async function ensure() {
    if (!wanted) { status('idle'); return false; }
    if (!isVisible()) { status('hidden'); return false; }
    if (!supported()) { status('unsupported'); return false; }
    if (sentinel && !sentinel.released) { status('active'); return true; }
    if (pending) return pending;

    const requestedAt = revision;
    status('requesting');
    const task = (async () => {
      try {
        const newLock = await wakeLock.request('screen');
        if (!wanted || !isVisible() || revision !== requestedAt) {
          try { await newLock.release(); } catch {}
          return false;
        }
        sentinel = newLock;
        newLock.addEventListener?.('release', () => {
          if (sentinel === newLock) {
            sentinel = null;
            status(wanted ? 'released' : 'idle');
          }
        });
        status('active');
        return true;
      } catch {
        status(wanted ? 'unavailable' : 'idle');
        return false;
      }
    })();

    pending = task;
    try {
      return await task;
    } finally {
      if (pending === task) pending = null;
      // Reativação muito rápida após uma pausa: descarta bloqueio antigo
      // e obtém outro, sem deixar o microfone ativo com uma requisição obsoleta.
      if (wanted && revision !== requestedAt && !sentinel && isVisible()) {
        void ensure();
      }
    }
  }

  function start() {
    wanted = true;
    return ensure();
  }

  async function stop() {
    wanted = false;
    revision++;
    const current = sentinel;
    sentinel = null;
    status('idle');
    if (current) {
      try { await current.release(); } catch {}
    }
  }

  function visibilityChange() {
    if (!isVisible()) {
      // Alguns WebKit/Safari liberam o bloqueio assincronamente; soltamos
      // explicitamente e invalidamos requisições em andamento para evitar
      // que um lock antigo seja considerado ativo ao voltar à aba.
      revision++;
      const previous = sentinel;
      sentinel = null;
      if (previous) void previous.release().catch(() => {});
      if (wanted) status('hidden');
      return;
    }
    if (wanted) void ensure();
  }

  return { start, stop, visibilityChange, supported };
}
