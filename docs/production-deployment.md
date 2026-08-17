# Implantação em produção

Este guia cobre uma VM Linux pública. A topologia recomendada separa o endpoint de sinalização do LiveKit e o serviço de sessão:

- `wss://livekit.exemplo.com`: WebSocket e API do LiveKit.
- `https://stream.exemplo.com`: emissão de tokens para o Dorion WebRTC.
- `turn.exemplo.com`: TURN/TLS para redes restritivas.

## 1. Gere a infraestrutura LiveKit

Use o [gerador oficial para VM](https://docs.livekit.io/transport/self-hosting/vm/):

```bash
mkdir livekit-deploy
cd livekit-deploy
docker run --rm -it -v "$PWD:/output" livekit/generate
```

Informe o domínio principal e um domínio TURN quando o gerador solicitar. A saída inclui LiveKit, Redis, Caddy, certificados automáticos e configuração de TURN.

O endpoint entregue aos clientes deve ser `wss://livekit.exemplo.com`. Certificados autoassinados não são aceitos pelos navegadores.

## 2. Libere a rede

Para a configuração gerada oficialmente, libere na VM e no firewall do provedor:

| Protocolo | Porta | Uso |
| --- | ---: | --- |
| TCP | 80 | Emissão e renovação de TLS |
| TCP | 443 | HTTPS, WSS e TURN/TLS |
| TCP | 7881 | ICE sobre TCP |
| UDP | 3478 | TURN sobre UDP |
| UDP | 50000-60000 | Mídia WebRTC |

Essas portas seguem a [documentação oficial de firewall do LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/). Se você trocar a configuração de RTC para UDP mux, exponha a porta definida em `rtc.udp_port` no lugar do intervalo.

## 3. Execute o serviço de sessão

Clone este repositório na VM e crie um arquivo de ambiente fora do Git:

```bash
git clone https://github.com/horizonfps/dorion-webrtc.git /opt/dorion-webrtc
cd /opt/dorion-webrtc
cp deploy/.env.example deploy/.env.production
```

Use valores aleatórios distintos e longos:

```dotenv
NODE_ENV=production
LIVEKIT_API_KEY=<mesma-chave-do-livekit>
LIVEKIT_API_SECRET=<mesmo-segredo-do-livekit>
LIVEKIT_PUBLIC_URL=wss://livekit.exemplo.com
STREAM_ACCESS_KEY=<chave-compartilhada-com-os-clientes>
STREAM_ROOM_SALT=<segredo-exclusivo-para-derivar-as-salas>
STREAM_ALLOWED_ORIGINS=https://discord.com
```

Construa e execute somente o emissor de tokens na interface local:

```bash
docker build -f services/stream-server/Dockerfile -t dorion-stream-server .
docker run -d \
  --name dorion-stream-server \
  --restart unless-stopped \
  --env-file deploy/.env.production \
  -p 127.0.0.1:8787:8787 \
  dorion-stream-server
```

## 4. Publique o endpoint HTTPS

No proxy reverso que já atende o LiveKit, crie o host `stream.exemplo.com` apontando para `127.0.0.1:8787`. Com Caddyfile, a regra equivalente é:

```caddyfile
stream.exemplo.com {
  reverse_proxy 127.0.0.1:8787
}
```

Verifique:

```bash
curl https://stream.exemplo.com/health
```

A resposta esperada é `{"status":"ok"}`.

## 5. Configure os clientes

Em cada Dorion WebRTC:

1. Abra a engrenagem do controle de transmissão.
2. Defina o servidor como `https://stream.exemplo.com`.
3. Informe a mesma `STREAM_ACCESS_KEY`.
4. Mantenha a conexão automática habilitada.

Nunca distribua `LIVEKIT_API_SECRET` ou `STREAM_ROOM_SALT` aos clientes.

## 6. Operação

- Monitore banda de saída, CPU, perda de pacotes e uso das portas UDP.
- Faça backup apenas das configurações sem segredos ou use um cofre de segredos.
- Atualize imagens por versão fixa e teste antes de publicar.
- Rotacione `STREAM_ACCESS_KEY` quando ela sair do grupo autorizado.
- Para alta disponibilidade, siga a implantação distribuída oficial com Redis; o serviço de sessão é stateless e pode ter várias réplicas atrás do proxy.
