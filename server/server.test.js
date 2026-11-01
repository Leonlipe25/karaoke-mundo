import test from 'node:test';
import assert from 'node:assert/strict';
import { createKaraokeServer } from './index.js';

async function runApi(server, route, origin = 'https://leonlipe25.github.io') {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { Origin: origin } });
    return { status: response.status, body: await response.json(), headers: response.headers };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('a API não revela a chave e permite verificar saúde', async () => {
  const response = await runApi(createKaraokeServer({ apiKey: 'chave-de-teste' }), '/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.configured, true);
  assert.equal(JSON.stringify(response.body).includes('chave-de-teste'), false);
});

test('bloqueia origem não autorizada', async () => {
  const response = await runApi(createKaraokeServer({ apiKey: 'segredo' }), '/api/search?q=adele&region=INT', 'https://exemplo.invalid');
  assert.equal(response.status, 403);
});

test('verifica parâmetros de pesquisa', async () => {
  const response = await runApi(createKaraokeServer({ apiKey: 'segredo' }), '/api/search?q=x&region=BR');
  assert.equal(response.status, 400);
});

test('retorna aviso se segredo não configurado', async () => {
  const response = await runApi(createKaraokeServer({ apiKey: '' }), '/api/search?q=adele&region=INT');
  assert.equal(response.status, 503);
});

test('consulta YouTube e retorna apenas dados públicos necessários', async () => {
  let urlUsed = '';
  const fakeFetch = async url => {
    urlUsed = String(url);
    return { ok:true, json:async () => ({
      items: [
        { id:{videoId:'ABCDEFGHIjk'}, snippet:{title:'Perfect Karaoke',channelTitle:'Canal'} },
        { id:{videoId:'invalido'}, snippet:{title:'Inválido',channelTitle:'Canal'} },
      ],
    }) };
  };
  const r=await runApi(createKaraokeServer({apiKey:'segredo',fetchImpl:fakeFetch}),'/api/search?q=perfect&region=INT');
  assert.equal(r.status,200);
  assert.equal(r.headers.get('access-control-allow-origin'),'https://leonlipe25.github.io');
  assert.equal(r.body.items.length,1);
  assert.equal(r.body.items[0].id,'ABCDEFGHIjk');
  assert.equal(urlUsed.includes('key=segredo'),true);
  assert.equal(JSON.stringify(r.body).includes('segredo'),false);
});
