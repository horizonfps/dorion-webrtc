import type { StreamConfig } from './types'

const defaults: StreamConfig = {
  accessKey: '',
  autoConnect: true,
  enabled: true,
  serverUrl: 'http://127.0.0.1:8787',
}

export function readStreamConfig(): StreamConfig {
  const config = window.__DORION_CONFIG__

  return {
    accessKey: typeof config.stream_access_key === 'string'
      ? config.stream_access_key
      : defaults.accessKey,
    autoConnect: typeof config.stream_auto_connect === 'boolean'
      ? config.stream_auto_connect
      : defaults.autoConnect,
    enabled: typeof config.stream_enabled === 'boolean'
      ? config.stream_enabled
      : defaults.enabled,
    serverUrl: typeof config.stream_server_url === 'string'
      ? config.stream_server_url.replace(/\/+$/, '')
      : defaults.serverUrl,
  }
}

export async function writeStreamConfig(config: StreamConfig) {
  const next = {
    ...window.__DORION_CONFIG__,
    stream_access_key: config.accessKey.trim(),
    stream_auto_connect: config.autoConnect,
    stream_enabled: config.enabled,
    stream_server_url: config.serverUrl.trim().replace(/\/+$/, ''),
  }

  await window.__TAURI__.core.invoke('write_config_file', {
    contents: JSON.stringify(next),
  })
  window.__DORION_CONFIG__ = next
}

