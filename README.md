# Karaokê Mundo 🎤

Um karaokê doméstico para navegador no MacBook, com busca de vídeos de karaokê brasileiros e internacionais, reprodução pelo YouTube e pontuação recreativa com o microfone do celular.

## Principais funções
- Abas **Brasileiras**, **Internacionais** e **Todas**, com pesquisa por gênero, artista e música.
- Busca integrada via **YouTube Data API v3** com chave guardada no servidor Render.
- Enquanto o servidor estiver sem chave, mantém seleção inicial de 10 vídeos e permite reproduzir qualquer link embutível do YouTube.
- Microfone de celular remoto usando **PeerJS/WebRTC** e QR Code. Somente indicadores da voz são enviados, sem transmitir gravação.
- **Fonte única de pontuação:** se celular e Mac estiverem com microfone ativo, o celular tem prioridade. O Mac continua disponível como reserva e só pontua após ~1,6 segundo sem medição do celular, se seu microfone já estiver ativado. Pausar o microfone remoto ou desconectar volta imediatamente ao Mac. Nenhuma duplicação das amostras.
- Alternativa de usar o microfone do próprio Mac.
- Pontuação recreativa V2 de 0 a 100 com critérios mais exigentes: presença de voz, nitidez, continuidade do tom, sustento de notas e variação musical. Evita notas altas por poucos segundos. **Não compara com a melodia original**.
- Ao receber o evento **ENDED** do player do YouTube, congela a pontuação e apresenta o **resultado final**. Pausar não encerra a avaliação; repetir o mesmo vídeo inicia uma nova rodada. Se não houver pelo menos 10 amostras vocais, exibe “Sem avaliação” em vez de inventar uma nota.
- Lista de favoritos no navegador.

## Abrir o site
Após configurar **Settings → Pages → Build and deployment → Source: GitHub Actions**, abra:
https://leonlipe25.github.io/karaoke-mundo/

O workflow de `.github/workflows/pages.yml` roda testes e publica o site quando há alterações na branch `main`. Se o Pages não estiver habilitado, o primeiro deploy poderá falhar até selecionar a fonte **GitHub Actions** em Settings → Pages.

### Pesquisa integrada no servidor
A busca de músicas é encaminhada ao backend Node.js hospedado em https://karaoke-mundo-api.onrender.com. A chave **YOUTUBE_API_KEY** fica nas variáveis de ambiente do serviço Render [karaoke-mundo-api](https://dashboard.render.com/web/srv-dbjo1fh42hec73djsgug/env), não no GitHub nem nos navegadores.

Configuração única: Render → karaoke-mundo-api → Environment → Add Environment Variable → nome `YOUTUBE_API_KEY`, valor da chave criada no Google Cloud → Save, rebuild/deploy. A chave usada pelo servidor deve ter restrição de API à YouTube Data API v3; **não pode manter restrição de aplicativo por HTTP referrer**, porque agora quem chama o YouTube é o servidor. Para proteger a cota, o backend tem cache e limites básicos. A API não possui autenticação de usuários: o CORS limita navegadores, mas não impede automações externas; monitore cotas e configure limites no Google Cloud.

### Usar o celular
1. Abra o site no MacBook.
2. Clique em **Conectar celular** e leia o QR Code.
3. No celular, autorize o microfone e clique em **Ativar microfone**.
4. Reproduza um vídeo de karaokê pelo MacBook, mantendo o som na caixa Bluetooth.
5. Cante normalmente pelo microfone da caixa; o celular deve ficar perto da boca para reduzir interferência do som ambiente.

## Executar localmente
```sh
python3 -m http.server 8000
```
Acesse http://localhost:8000. O microfone remoto do celular exige HTTPS ou ambiente seguro. Para testes, use o endereço do GitHub Pages.

## Limitações
- O projeto **não hospeda músicas**; utiliza vídeos incorporados do YouTube, sujeitos a disponibilidade, região e permissão de incorporação.
- A pontuação avalia presença e clareza da voz; **não diz se as notas da música foram acertadas**. Música alta pode afetar a medida.
- A pesquisa geral depende de configurar YOUTUBE_API_KEY no Render e da cota do YouTube. A seleção não garante reprodução de vídeos que bloqueiem incorporação.
- O serviço público PeerJS pode falhar em redes com restrições de WebRTC. Não foi validado em dispositivos reais nesta versão.
- Esta é uma implementação nova e leve, inspirada no conceito do AllKaraoke, **não um fork** do código dele.

## Código
HTML, CSS e JavaScript. Node.js é necessário apenas para testes (`npm run check`). Código MIT; músicas e vídeos pertencem aos respectivos titulares.
