# Karaokê Mundo 🎤

Um karaokê doméstico para navegador no MacBook, com busca de vídeos de karaokê brasileiros e internacionais, reprodução pelo YouTube e pontuação recreativa com o microfone do celular.

## Principais funções
- Abas **Brasileiras**, **Internacionais** e **Todas**, com pesquisa por gênero, artista e música.
- Busca integrada via **YouTube Data API v3** (exige configurar uma chave própria, com restrição de referrer).
- Sem chave, é possível colar o link de um vídeo do YouTube e reproduzi-lo pelo player oficial incorporado.
- Microfone de celular remoto usando **PeerJS/WebRTC** e QR Code. Somente indicadores da voz são enviados, sem transmitir gravação.
- Alternativa de usar o microfone do próprio Mac.
- Pontuação recreativa de 0 a 100 **sem comparação com a melodia original**.
- Lista de favoritos no navegador.

## Abrir o site
Após configurar **Settings → Pages → Build and deployment → Source: GitHub Actions**, abra:
https://leonlipe25.github.io/karaoke-mundo/

O workflow de `.github/workflows/pages.yml` roda testes e publica o site quando há alterações na branch `main`. Se o Pages não estiver habilitado, o primeiro deploy poderá falhar até selecionar a fonte **GitHub Actions** em Settings → Pages.

### Pesquisa integrada
Na página clique no ícone de engrenagem e informe sua chave da **YouTube Data API v3**. Ative a API no Google Cloud, restrinja a chave à **YouTube Data API v3** e aos referrers `https://leonlipe25.github.io/*`. A chave é armazenada somente no `localStorage` do navegador. Sem chave, utilize a pesquisa externa no YouTube e cole links.

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
- Pesquisa integrada depende de uma chave de API e de sua cota.
- O serviço público PeerJS pode falhar em redes com restrições de WebRTC. Não foi validado em dispositivos reais nesta versão.
- Esta é uma implementação nova e leve, inspirada no conceito do AllKaraoke, **não um fork** do código dele.

## Código
HTML, CSS e JavaScript. Node.js é necessário apenas para testes (`npm run check`). Código MIT; músicas e vídeos pertencem aos respectivos titulares.
