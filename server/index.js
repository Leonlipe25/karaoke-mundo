// Karaoke Mundo - backend de pesquisa YouTube.
// A chave YOUTUBE_API_KEY nunca é enviada ao navegador nem incluída no repositório.
// Dependência: Node.js 20+ (fetch nativo).
import { createServer } from 'node:http';

const TRUSTED_ORIGIN = 'https://leonlipe25.github.io';
const CACHE_TTL = 60 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_DAILY_SEARCHES = 80; // YouTube search.list custa normalmente 100 unidades; cota padrão 10.000/dia.
const MAX_CACHE_ENTRIES = 300;

function reply(res, code, body, origin = '', headers = {}) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  };
  if (origin === TRUSTED_ORIGIN) h['Access-Control-Allow-Origin'] = TRUSTED_ORIGIN;
  res.writeHead(code, h);
  res.end(JSON.stringify(body));
}

export function createKaraokeServer({
  apiKey = process.env.YOUTUBE_API_KEY,
  fetchImpl = fetch,
  clock = () => Date.now(),
} = {}) {
  const cache = new Map();
  const rates = new Map();
  let day = '';
  let spentToday = 0;

  return createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const u = new URL(req.url || '/', 'http://localhost');
    if (u.pathname === '/health' && req.method === 'GET') {
      return reply(res, 200, { ok: true, configured: Boolean(apiKey) }, origin);
    }
    if (u.pathname !== '/api/search') return reply(res, 404, { error: 'Rota não encontrada' }, origin);
    if (origin !== TRUSTED_ORIGIN) return reply(res, 403, { error: 'Origem não permitida' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': TRUSTED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin',
      });
      return res.end();
    }
    if (req.method !== 'GET') return reply(res, 405, { error: 'Método não permitido' }, origin);
    if (!apiKey) return reply(res, 503, { error: 'Pesquisa temporariamente não configurada no servidor.' }, origin);

    const q = (u.searchParams.get('q') || '').trim();
    const region = (u.searchParams.get('region') || 'ALL').toUpperCase();
    if (q.length < 2 || q.length > 100 || !['BR', 'INT', 'ALL'].includes(region)) {
      return reply(res, 400, { error: 'Pesquisa inválida. Digite de 2 a 100 caracteres.' }, origin);
    }

    const now = clock();
    // Contagem diária local. Como o plano gratuito pode reiniciar o processo,
    // esta é proteção básica, não substitui os alertas de cota no Google Cloud.
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== day) { day = today; spentToday = 0; }

    // Limite por IP, também para acertos de cache. Não é autenticação.
    const client = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 80);
    for (const [key, record] of rates) if (record.until <= now) rates.delete(key);
    const record = rates.get(client) || { count: 0, until: now + WINDOW_MS };
    if (++record.count > MAX_REQUESTS_PER_WINDOW) {
      return reply(res, 429, { error: 'Muitas pesquisas. Tente novamente em alguns minutos.' }, origin);
    }
    rates.set(client, record);

    const terms = region === 'BR' ? `${q} karaokê playback letra`
      : region === 'INT' ? `${q} karaoke instrumental lyrics`
      : `${q} karaoke playback lyrics`;
    const cacheKey = `${region}|${terms.toLocaleLowerCase('pt-BR')}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > now) {
      return reply(res, 200, { items: cached.items, cached: true }, origin);
    }
    if (spentToday >= MAX_DAILY_SEARCHES) {
      return reply(res, 429, { error: 'Cota de pesquisas do dia atingida. Tente amanhã ou use um link direto do YouTube.' }, origin);
    }

    const params = new URLSearchParams({
      part: 'snippet', type: 'video', videoEmbeddable: 'true',
      maxResults: '16', q: terms, key: apiKey,
    });
    if (region !== 'ALL') params.set('relevanceLanguage', region === 'BR' ? 'pt' : 'en');
    spentToday++; // reserva a cota antes da chamada
    try {
      const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?${params}`, {
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      if (!response.ok) {
        const quota = data?.error?.errors?.some(e => e.reason === 'quotaExceeded');
        return reply(res, response.status === 403 && quota ? 429 : 502, {
          error: quota
            ? 'Cota da API do YouTube esgotada. Tente novamente amanhã.'
            : 'Não foi possível consultar o YouTube. Verifique a chave e as permissões no Render.',
        }, origin);
      }
      const items = (data.items || [])
        .map(e => ({
          id: e?.id?.videoId,
          title: String(e?.snippet?.title || '').slice(0, 200),
          channel: String(e?.snippet?.channelTitle || '').slice(0, 100),
        }))
        .filter(e => /^[A-Za-z0-9_-]{11}$/.test(e.id || ''));
      cache.set(cacheKey, { items, expires: now + CACHE_TTL });
      if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
      return reply(res, 200, { items, cached: false }, origin);
    } catch {
      return reply(res, 502, { error: 'YouTube indisponível no momento. Tente novamente.' }, origin);
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createKaraokeServer().listen(Number(process.env.PORT) || 10000, '0.0.0.0', () => {
    console.log('Karaokê Mundo API pronta para receber pesquisas.');
  });
}
