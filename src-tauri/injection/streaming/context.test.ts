import { describe, expect, it } from 'vitest'
import { resolveVoiceContext, type DiscordContextStores } from './context'

function stores(
  channelId: string | null,
  userId = '123456789012345678',
): DiscordContextStores {
  return {
    channel: {
      getChannel: id => ({
        guild_id: '234567890123456789',
        id,
        name: 'Geral',
      }),
    },
    selectedChannel: { getVoiceChannelId: () => channelId },
    user: {
      getCurrentUser: () => ({
        globalName: 'Alice',
        id: userId,
        username: 'alice',
      }),
    },
  }
}

describe('resolveVoiceContext', () => {
  it('resolves the current Discord voice channel and user', () => {
    expect(resolveVoiceContext(stores('345678901234567890'))).toEqual({
      channelId: '345678901234567890',
      channelName: 'Geral',
      displayName: 'Alice',
      guildId: '234567890123456789',
      userId: '123456789012345678',
    })
  })

  it('returns null outside a voice channel', () => {
    expect(resolveVoiceContext(stores(null))).toBeNull()
  })
})

