# BoraKê 🎤 — Seu palco, sua vibe

Karaokê doméstico com identidade neon para navegador no MacBook, com busca de vídeos de karaokê brasileiros e internacionais, reprodução pelo YouTube e pontuação recreativa com o microfone do celular.

## Principais funções
- **Dois modos:** biblioteca de músicas e palco ampliado; o palco também oferece tela cheia do navegador quando disponível.
- **Fila de hits:** botão “+ Fila” em cada resultado, reprodução da próxima música, remoção e limpeza da fila. A lista fica no navegador do dispositivo (não sincronizada entre computadores).
- **Feedback de festa:** mensagens de pontuação durante o canto, resultado final com confetes leves e botões “Cantar de novo” ou “Próxima da fila”.
- **Marca BoraKê:** identidade neon roxa, rosa e turquesa, cartões de gêneros e QR Code maior para o celular.
- Abas **Brasileiras**, **Internacionais** e **Todas**, com pesquisa por gênero, artista e música.
- Busca integrada via **YouTube Data API v3** com chave guardada no servidor Render.
- Enquanto o servidor estiver sem chave, mantém seleção inicial de 10 vídeos e permite reproduzir qualquer link embutível do YouTube.
- Microfone de celular remoto usando **PeerJS/WebRTC** e QR Code. Por padrão, somente indicadores da voz são enviados, sem transmitir gravação. Ao ativar voluntariamente o reconhecimento de fala, também são enviados os textos reconhecidos pelo navegador, nunca gravações pelo BoraKê.
- **Tela acesa durante o canto:** no modo celular, o BoraKê solicita Screen Wake Lock automaticamente ao iniciar o microfone e libera ao pausar. Ao retornar ao Safari/Chrome, tenta reativar. Mostra status e botão de nova tentativa se o navegador negar ou liberar o bloqueio.
- **Compatibilidade:** Chrome Android atualizado; Safari iPhone com suporte completo a partir do iOS 18.4 (iOS 16.4–18.3 tem suporte parcial); Chrome iPhone sujeito às capacidades do WebKit/iOS. Se não houver suporte, o app avisa para manter a tela ligada manualmente.
- **Importante:** bloquear o celular pelo botão lateral ou alternar para outro aplicativo pode suspender a análise e a transmissão. Wake Lock impede apenas o bloqueio automático, quando o navegador e o sistema permitem. O recurso usa mais bateria.
- **Comparação de letra (beta, sem API paga):** no computador, selecione a música e forneça uma letra de referência que você tem autorização para utilizar. No celular, ative o microfone, marque o consentimento explícito e habilite o reconhecimento de palavras do navegador. O texto reconhecido (não a gravação de áudio) viaja pelo PeerJS ao computador. Após pelo menos 20 palavras em duas frases, a nota é composta por **70% avaliação vocal + 30% estimativa de acerto da letra**; sem letra ou quando o navegador não reconhecer com segurança, mantém a nota vocal. A letra fica somente no navegador do computador e não é publicada no site.
- **Limitação de custos e licenças:** a versão de teste não busca automaticamente letras de terceiros no YouTube nem usa o Musixmatch. A YouTube Data API não fornece legendas de qualquer vídeo sem autorização; uma integração automática com catálogo licenciado exige plano e permissões adequados. Não foi contratada API paga.
- **QR persistente:** cada computador/navegador guarda um identificador de sala aleatório de 128 bits em localStorage. Ao voltar ao BoraKê, a sala tenta reabrir automaticamente com o mesmo código; o celular com o link antigo correto pode reconectar sem novo scan. A página do celular também tenta reconectar quando o computador reinicia. O primeiro QR atualizado precisa ser escaneado uma vez, pois IDs das versões anteriores não são compatíveis.
- **Placar ao vivo no celular:** o MacBook calcula a nota e envia atualizações de 0 a 100 ao telefone pela conexão PeerJS já existente. O telefone mostra música atual, estado (cantando/pausado/finalizado), eventual acerto de letra e nota final, sem calcular outra pontuação.
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

### Como testar a letra sem pagar APIs
1. Abra o BoraKê no Mac, selecione uma música e encontre o bloco **Acerto da letra**.
2. Clique em **Adicionar letra de referência** e insira uma letra de sua autoria ou que esteja autorizado a usar. O app salva somente neste navegador. O título e o artista são campos para uma futura busca licenciada; não fazem a busca automaticamente.
3. No celular, conecte-se pelo QR já salvo, ative o microfone e selecione o idioma.
4. Leia a autorização de reconhecimento e marque a caixa apenas se concordar; clique **Ativar comparação de letra**.
5. Ao cantar com o vídeo tocando no computador, acompanhe as palavras reconhecidas e a nota de letra. O resultado é experimental: canto e som ambiente podem prejudicar a precisão.
6. Desative a opção no celular para parar o reconhecimento; a análise de frequência vocal continua. Em alguns navegadores o reconhecimento de voz usa serviços externos; a implementação é do fornecedor do navegador, não do BoraKê.
7. Se não houver suporte nativo ao SpeechRecognition no navegador, a interface avisa e não penaliza a nota.

### Pareamento sem novo QR
O primeiro acesso após esta atualização exige um novo scan, porque o código antigo era temporário. Depois, mantenha o endereço do celular nos favoritos. O computador usa o mesmo código ao reabrir o site, e o celular tenta reconectar. **Trocar QR (desvincula celular)** invalida o link anterior. Desligar/fechar o navegador do celular interrompe o microfone; ao reabrir, pode ser necessário apertar **Ativar microfone** novamente por exigência de privacidade dos sistemas.

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
- A pontuação vocal não comprova acerto da melodia; a comparação de letra avalia palavras estimadas pelo navegador, não afinação. Uma letra incorreta ou fala transcrita com erro distorcerá o resultado. Música alta pode afetar a medida.
- A pesquisa geral depende de configurar YOUTUBE_API_KEY no Render e da cota do YouTube. A seleção não garante reprodução de vídeos que bloqueiem incorporação.
- A fila e os favoritos são armazenados apenas no navegador atual; não há conta nem sincronização entre dispositivos.
- O serviço público PeerJS pode falhar em redes com restrições de WebRTC. Não foi validado em dispositivos reais nesta versão.
- Esta é uma implementação nova e leve, inspirada no conceito do AllKaraoke, **não um fork** do código dele.

## Código
HTML, CSS e JavaScript. Node.js é necessário apenas para testes (`npm run check`). Código MIT; músicas e vídeos pertencem aos respectivos titulares.
