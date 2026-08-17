# Dorion WebRTC

Cliente leve baseado no [Dorion](https://github.com/SpikeHD/Dorion), com transmissão de tela independente integrada à interface do Discord.

O projeto não usa bot, não envia o token do Discord e não depende do transporte de mídia do Discord. Usuários deste mesmo cliente que estiverem no mesmo canal de voz entram automaticamente em uma sala WebRTC correspondente e podem transmitir ou assistir.

## Funcionalidades

- Captura de tela, monitor ou janela pelo seletor nativo do WebView2.
- Áudio do sistema em estéreo quando a fonte selecionada oferece áudio.
- Vídeo VP8 em até 1080p e 30 fps.
- Simulcast e adaptação de qualidade por espectador.
- Vários espectadores sem multiplicar o upload do transmissor.
- Vários transmissores na mesma sala.
- Reconexão automática ao trocar de rede.
- Descoberta local do canal de voz atual por meio dos stores do Shelter.
- Salas derivadas por HMAC; IDs de guilda e canal não aparecem no LiveKit.
- Serviço próprio de tokens com expiração, CORS, chave compartilhada e limite de requisições.
- Interface incorporada com visualização, áudio, tela cheia e configurações.

## Arquitetura

```text
Dorion A ─┐
          ├── WebRTC ── LiveKit SFU ── WebRTC ── Dorion B
Dorion C ─┘                                  └── Dorion D
     │
     └── HTTPS ── serviço de sessão
                    ├── valida a requisição
                    ├── mapeia guilda/canal por HMAC
                    └── emite token LiveKit de curta duração
```

O Discord é usado apenas para autenticação do próprio aplicativo, interface de chat e identificação local do canal de voz selecionado. A mídia usa a infraestrutura configurada pelo operador deste projeto.

## Uso local

Requisitos:

- Node.js 22 ou superior.
- pnpm 11.17 ou superior.
- Docker com Docker Compose.
- Rust 1.96 ou superior e os [pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/).
- Microsoft Edge WebView2 no Windows.

Prepare a infraestrutura:

```powershell
Copy-Item deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Os valores do arquivo de exemplo servem apenas como modelo. Troque todas as chaves antes de compartilhar o servidor com outras pessoas.

Prepare e execute o cliente:

```powershell
pnpm install
pnpm shupdate
pnpm build:updater
pnpm dev
```

No cliente:

1. Entre em um canal de voz.
2. Abra a engrenagem do controle `Transmitir`.
3. Informe `http://127.0.0.1:8787` e a mesma `STREAM_ACCESS_KEY` do servidor.
4. Clique em `Transmitir`, escolha a fonte e habilite o compartilhamento de áudio no seletor quando essa opção estiver disponível.

Todos os espectadores devem usar este fork, apontar para o mesmo servidor e estar no mesmo canal de voz.

## Implantação pública

Uma implantação pública exige domínio, HTTPS/WSS, IP público anunciado corretamente e portas WebRTC liberadas. Consulte [Implantação em produção](docs/production-deployment.md).

Não exponha a composição local diretamente na internet. Ela foi feita para desenvolvimento e teste em uma máquina ou rede controlada.

## Validação

```powershell
pnpm test
pnpm typecheck:stream-server
pnpm exec tsc --noEmit -p src-tauri/injection/tsconfig.json
pnpm build:js
pnpm test:e2e
```

O teste de ponta a ponta sobe o LiveKit e o serviço de sessão em contêineres, abre um publicador e dois espectadores em Chromium e exige:

- faixa de vídeo `screen_share` ativa nos dois espectadores;
- quadros de vídeo efetivamente renderizados;
- faixa de áudio `screen_share_audio` ativa;
- bytes de áudio efetivamente recebidos pelos dois espectadores.

Defina `PLAYWRIGHT_BROWSER_EXECUTABLE` se Chrome, Chromium ou Edge não estiverem em um caminho padrão.

## Segurança e privacidade

- O serviço de sessão nunca recebe o token ou cookie do Discord.
- A chave LiveKit secreta permanece apenas no servidor.
- A chave de acesso do cliente é armazenada no arquivo de configuração local e deixou de ser impressa no console.
- Sem um bot ou OAuth adicional, o servidor não consegue provar que o participante pertence ao canal alegado. A `STREAM_ACCESS_KEY` limita o acesso à comunidade que a recebeu, mas não substitui autorização individual.
- Use chaves longas e aleatórias, TLS válido, firewall e rotação periódica em produção.

## Limitações de plataforma

O fluxo completo foi validado no Windows com WebView2. A disponibilidade de áudio do sistema depende da fonte escolhida e do suporte de `getDisplayMedia` do WebView. No Linux e no macOS, o suporte de captura do WebView pode variar; contribuições com validação nessas plataformas são bem-vindas.

## Licença e atribuição

Este fork permanece sob a [GPL-3.0](LICENSE). Dorion é de autoria de SpikeHD e seus colaboradores. LiveKit Client usa Apache-2.0.

Discord é uma marca de seus respectivos titulares. Este projeto é independente e não é afiliado, patrocinado ou aprovado pelo Discord.
