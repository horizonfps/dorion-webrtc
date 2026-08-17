import type { DiscordVoiceContext } from './types'

interface DiscordChannel {
  guild_id?: string
  id?: string
  name?: string
}

interface DiscordUser {
  displayName?: string
  globalName?: string
  id?: string
  username?: string
}

interface ChannelStore {
  getChannel: (id: string) => DiscordChannel | undefined
}

interface SelectedChannelStore {
  getVoiceChannelId: () => string | null
}

interface UserStore {
  getCurrentUser: () => DiscordUser | undefined
}

export interface DiscordContextStores {
  channel: ChannelStore
  selectedChannel: SelectedChannelStore
  user: UserStore
}

const storeTimeout = 20_000

function validStore<T>(value: unknown): value is T {
  return typeof value === 'object' && value !== null
}

export async function waitForContextStores(): Promise<DiscordContextStores> {
  const startedAt = Date.now()

  while (!window.shelter?.flux?.awaitStore) {
    if (Date.now() - startedAt > storeTimeout) {
      throw new Error('Shelter is required for Discord voice context discovery')
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  const stores = Promise.all([
    window.shelter.flux.awaitStore('ChannelStore'),
    window.shelter.flux.awaitStore('SelectedChannelStore'),
    window.shelter.flux.awaitStore('UserStore'),
  ])
  const timeout = new Promise<never>((_resolve, reject) => {
    window.setTimeout(
      () => reject(new Error('Discord voice context stores timed out')),
      storeTimeout,
    )
  })
  const [channel, selectedChannel, user] = await Promise.race([stores, timeout])

  if (
    !validStore<ChannelStore>(channel) ||
    !validStore<SelectedChannelStore>(selectedChannel) ||
    !validStore<UserStore>(user) ||
    typeof channel.getChannel !== 'function' ||
    typeof selectedChannel.getVoiceChannelId !== 'function' ||
    typeof user.getCurrentUser !== 'function'
  ) {
    throw new Error('Discord voice context stores are unavailable')
  }

  return { channel, selectedChannel, user }
}

export function resolveVoiceContext(
  stores: DiscordContextStores,
): DiscordVoiceContext | null {
  const channelId = stores.selectedChannel.getVoiceChannelId()
  const user = stores.user.getCurrentUser()

  if (!channelId || !user?.id) return null

  const channel = stores.channel.getChannel(channelId)

  if (!channel?.id) return null

  return {
    channelId,
    channelName: channel.name?.trim() || 'Chamada privada',
    displayName:
      user.globalName?.trim() ||
      user.displayName?.trim() ||
      user.username?.trim() ||
      'Usuário do Discord',
    ...(channel.guild_id ? { guildId: channel.guild_id } : {}),
    userId: user.id,
  }
}
