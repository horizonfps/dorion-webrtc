export interface DiscordVoiceContext {
  channelId: string
  channelName: string
  displayName: string
  guildId?: string
  userId: string
}

export interface StreamConfig {
  accessKey: string
  autoConnect: boolean
  enabled: boolean
  serverUrl: string
}

export interface StreamToken {
  livekitUrl: string
  token: string
}

export type ConnectionStatus =
  | 'disabled'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

