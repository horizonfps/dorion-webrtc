import type { DiscordVoiceContext, StreamConfig, StreamToken } from './types'

const sessionStorageKey = 'dorion-webrtc-session'

function sessionId() {
  const existing = sessionStorage.getItem(sessionStorageKey)

  if (existing) return existing

  const created = crypto.randomUUID().replaceAll('-', '')
  sessionStorage.setItem(sessionStorageKey, created)
  return created
}

function isStreamToken(value: unknown): value is StreamToken {
  if (typeof value !== 'object' || value === null) return false

  const token = value as Partial<StreamToken>
  return typeof token.livekitUrl === 'string' && typeof token.token === 'string'
}

export async function requestStreamToken(
  config: StreamConfig,
  context: DiscordVoiceContext,
): Promise<StreamToken> {
  const response = await window.nativeFetch(`${config.serverUrl}/v1/token`, {
    body: JSON.stringify({
      context: {
        channelId: context.channelId,
        ...(context.guildId ? { guildId: context.guildId } : {}),
      },
      participant: {
        displayName: context.displayName,
        sessionId: sessionId(),
        userId: context.userId,
      },
    }),
    headers: {
      ...(config.accessKey
        ? { authorization: `Bearer ${config.accessKey}` }
        : {}),
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Session service returned ${response.status}: ${body}`)
  }

  const body: unknown = await response.json()

  if (!isStreamToken(body)) {
    throw new Error('Session service returned an invalid response')
  }

  return body
}

