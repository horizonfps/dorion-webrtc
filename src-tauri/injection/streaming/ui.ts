import type {
  ConnectionStatus,
  DiscordVoiceContext,
  StreamConfig,
} from './types'
import { streamingStyles } from './styles'

interface StreamUiCallbacks {
  onEnableAudio: () => Promise<void>
  onSaveConfig: (config: StreamConfig) => Promise<void>
  onToggleShare: () => Promise<void>
}

interface ParticipantTile {
  element: HTMLDivElement
  media: Map<string, HTMLMediaElement>
  videos: number
}

function requiredElement<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector)

  if (!element) throw new Error(`Missing stream UI element: ${selector}`)
  return element
}

export class StreamUi {
  private readonly audioPrompt: HTMLDivElement
  private readonly callbacks: StreamUiCallbacks
  private readonly contextLabel: HTMLSpanElement
  private readonly grid: HTMLDivElement
  private readonly mainButton: HTMLButtonElement
  private readonly root: HTMLDivElement
  private readonly settings: HTMLDivElement
  private readonly statusLabel: HTMLSpanElement
  private readonly tiles = new Map<string, ParticipantTile>()
  private readonly viewers: HTMLDivElement
  private readonly viewersTitle: HTMLSpanElement

  constructor(config: StreamConfig, callbacks: StreamUiCallbacks) {
    this.callbacks = callbacks
    this.root = document.createElement('div')
    this.root.id = 'dorion-stream-root'
    this.root.innerHTML = `
      <div id="dorion-stream-viewers">
        <div class="dorion-stream-viewers-header">
          <span class="dorion-stream-viewers-title">
            <span class="dorion-stream-live">AO VIVO</span>
            <span data-role="viewers-title">Transmissões</span>
          </span>
          <span data-role="context"></span>
        </div>
        <div id="dorion-stream-grid"></div>
      </div>
      <div id="dorion-stream-audio">
        <button class="dorion-stream-audio-button" type="button">Ativar áudio</button>
      </div>
      <div id="dorion-stream-settings">
        <div class="dorion-stream-settings-title">Transmissão Dorion</div>
        <label class="dorion-stream-field" for="dorion-stream-server">Servidor de sessão</label>
        <input class="dorion-stream-input" id="dorion-stream-server" type="url">
        <label class="dorion-stream-field" for="dorion-stream-key">Chave de acesso</label>
        <input class="dorion-stream-input" id="dorion-stream-key" type="password" autocomplete="off">
        <label class="dorion-stream-toggle-row">
          <input id="dorion-stream-enabled" type="checkbox">
          Ativar transmissão independente
        </label>
        <label class="dorion-stream-toggle-row">
          <input id="dorion-stream-auto-connect" type="checkbox">
          Conectar automaticamente à sala atual
        </label>
        <div class="dorion-stream-error" data-role="settings-error"></div>
        <div class="dorion-stream-settings-actions">
          <button class="dorion-stream-secondary" data-role="cancel-settings" type="button">Cancelar</button>
          <button class="dorion-stream-action" data-role="save-settings" type="button">Salvar</button>
        </div>
      </div>
      <div id="dorion-stream-control">
        <span id="dorion-stream-status">Inicializando…</span>
        <button class="dorion-stream-action" data-role="toggle-share" disabled type="button">Transmitir</button>
        <button class="dorion-stream-icon-button" data-role="settings" aria-label="Configurações" title="Configurações" type="button">⚙</button>
      </div>
    `

    const style = document.createElement('style')
    style.id = 'dorion-stream-styles'
    style.textContent = streamingStyles
    document.head.appendChild(style)
    document.body.appendChild(this.root)

    this.audioPrompt = requiredElement(this.root, '#dorion-stream-audio')
    this.contextLabel = requiredElement(this.root, '[data-role="context"]')
    this.grid = requiredElement(this.root, '#dorion-stream-grid')
    this.mainButton = requiredElement(this.root, '[data-role="toggle-share"]')
    this.settings = requiredElement(this.root, '#dorion-stream-settings')
    this.statusLabel = requiredElement(this.root, '#dorion-stream-status')
    this.viewers = requiredElement(this.root, '#dorion-stream-viewers')
    this.viewersTitle = requiredElement(this.root, '[data-role="viewers-title"]')

    this.fillSettings(config)
    this.bindEvents()
  }

  setContext(context: DiscordVoiceContext | null) {
    this.contextLabel.textContent = context ? `# ${context.channelName}` : ''
  }

  setStatus(status: ConnectionStatus, detail?: string) {
    const labels: Record<ConnectionStatus, string> = {
      connected: 'Conectado',
      connecting: 'Conectando…',
      disabled: 'Desativado',
      error: 'Falha na conexão',
      reconnecting: 'Reconectando…',
      waiting: 'Entre em uma chamada',
    }

    this.statusLabel.textContent = detail || labels[status]
    this.statusLabel.title = detail || labels[status]
    this.mainButton.disabled = status !== 'connected'
  }

  setSharing(sharing: boolean) {
    this.mainButton.dataset.sharing = String(sharing)
    this.mainButton.textContent = sharing ? 'Encerrar' : 'Transmitir'
  }

  setAudioBlocked(blocked: boolean) {
    this.audioPrompt.dataset.visible = String(blocked)
  }

  addMedia(
    participantId: string,
    participantName: string,
    trackId: string,
    media: HTMLMediaElement,
    local: boolean,
  ) {
    const tile = this.getOrCreateTile(participantId, participantName, local)

    if (tile.media.has(trackId)) return

    tile.media.set(trackId, media)
    media.dataset.trackId = trackId

    if (media instanceof HTMLVideoElement) {
      media.autoplay = true
      media.controls = false
      media.playsInline = true
      tile.element.prepend(media)
      tile.videos += 1
    } else {
      media.autoplay = true
      media.style.display = 'none'
      tile.element.appendChild(media)
    }

    this.updateViewerCount()
  }

  removeMedia(participantId: string, trackId: string) {
    const tile = this.tiles.get(participantId)
    const media = tile?.media.get(trackId)

    if (!tile || !media) return

    if (media instanceof HTMLVideoElement) tile.videos -= 1
    media.remove()
    tile.media.delete(trackId)

    if (tile.media.size === 0) {
      tile.element.remove()
      this.tiles.delete(participantId)
    }

    this.updateViewerCount()
  }

  removeParticipant(participantId: string) {
    const tile = this.tiles.get(participantId)

    if (!tile) return
    tile.element.remove()
    this.tiles.delete(participantId)
    this.updateViewerCount()
  }

  clearMedia() {
    for (const tile of this.tiles.values()) tile.element.remove()
    this.tiles.clear()
    this.updateViewerCount()
  }

  showError(message: string) {
    this.setStatus('error', message)
  }

  private bindEvents() {
    this.mainButton.addEventListener('click', () => {
      this.mainButton.disabled = true
      void this.callbacks.onToggleShare().finally(() => {
        this.mainButton.disabled = false
      })
    })

    requiredElement<HTMLButtonElement>(this.root, '[data-role="settings"]')
      .addEventListener('click', () => {
        this.settings.dataset.visible = String(
          this.settings.dataset.visible !== 'true',
        )
      })

    requiredElement<HTMLButtonElement>(this.root, '[data-role="cancel-settings"]')
      .addEventListener('click', () => {
        this.settings.dataset.visible = 'false'
      })

    requiredElement<HTMLButtonElement>(this.root, '[data-role="save-settings"]')
      .addEventListener('click', event => {
        void this.saveSettings(event.currentTarget as HTMLButtonElement)
      })

    requiredElement<HTMLButtonElement>(this.root, '.dorion-stream-audio-button')
      .addEventListener('click', () => {
        void this.callbacks.onEnableAudio().then(() => this.setAudioBlocked(false))
      })
  }

  private fillSettings(config: StreamConfig) {
    requiredElement<HTMLInputElement>(this.root, '#dorion-stream-server').value = config.serverUrl
    requiredElement<HTMLInputElement>(this.root, '#dorion-stream-key').value = config.accessKey
    requiredElement<HTMLInputElement>(this.root, '#dorion-stream-enabled').checked = config.enabled
    requiredElement<HTMLInputElement>(this.root, '#dorion-stream-auto-connect').checked = config.autoConnect
  }

  private async saveSettings(button: HTMLButtonElement) {
    const error = requiredElement<HTMLDivElement>(this.root, '[data-role="settings-error"]')
    const serverUrl = requiredElement<HTMLInputElement>(this.root, '#dorion-stream-server').value.trim()

    error.textContent = ''

    try {
      const url = new URL(serverUrl)

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Use um endereço HTTP ou HTTPS válido.')
      }

      button.disabled = true
      await this.callbacks.onSaveConfig({
        accessKey: requiredElement<HTMLInputElement>(this.root, '#dorion-stream-key').value,
        autoConnect: requiredElement<HTMLInputElement>(this.root, '#dorion-stream-auto-connect').checked,
        enabled: requiredElement<HTMLInputElement>(this.root, '#dorion-stream-enabled').checked,
        serverUrl,
      })
      this.settings.dataset.visible = 'false'
    } catch (saveError) {
      error.textContent = saveError instanceof Error
        ? saveError.message
        : 'Não foi possível salvar a configuração.'
    } finally {
      button.disabled = false
    }
  }

  private getOrCreateTile(
    participantId: string,
    participantName: string,
    local: boolean,
  ) {
    const existing = this.tiles.get(participantId)

    if (existing) return existing

    const element = document.createElement('div')
    element.className = 'dorion-stream-tile'
    element.innerHTML = `
      <div class="dorion-stream-tile-info">
        <span></span>
        <button class="dorion-stream-fullscreen" aria-label="Tela cheia" title="Tela cheia" type="button">⛶</button>
      </div>
    `
    requiredElement<HTMLSpanElement>(element, 'span').textContent = local
      ? `${participantName} (você)`
      : participantName
    requiredElement<HTMLButtonElement>(element, 'button').addEventListener('click', () => {
      const video = element.querySelector('video')
      if (video) void video.requestFullscreen()
    })
    this.grid.appendChild(element)

    const tile = { element, media: new Map(), videos: 0 }
    this.tiles.set(participantId, tile)
    return tile
  }

  private updateViewerCount() {
    const streams = [...this.tiles.values()].filter(tile => tile.videos > 0).length
    this.viewers.dataset.visible = String(streams > 0)
    this.viewersTitle.textContent = streams === 1
      ? '1 transmissão'
      : `${streams} transmissões`
  }
}
