import {
  AudioPresets,
  ConnectionState,
  type LocalTrack,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  TrackEvent,
} from 'livekit-client'
import { readStreamConfig, writeStreamConfig } from './config'
import {
  resolveVoiceContext,
  waitForContextStores,
  type DiscordContextStores,
} from './context'
import { requestStreamToken } from './token'
import type { DiscordVoiceContext, StreamConfig } from './types'
import { StreamUi } from './ui'

const contextPollInterval = 1_000

export class StreamController {
  private activeChannelId: string | null = null
  private config = readStreamConfig()
  private context: DiscordVoiceContext | null = null
  private contextStores: DiscordContextStores | null = null
  private connectAttempt = 0
  private connectPromise: Promise<Room> | null = null
  private readonly localTracks = new Map<LocalTrack, string>()
  private room: Room | null = null
  private sharing = false
  private readonly ui: StreamUi

  constructor() {
    this.ui = new StreamUi(this.config, {
      onEnableAudio: () => this.enableAudio(),
      onSaveConfig: config => this.saveConfig(config),
      onToggleShare: () => this.toggleShare(),
    })
  }

  async initialize() {
    try {
      this.contextStores = await waitForContextStores()
      await this.syncContext()
      window.setInterval(() => void this.syncContext(), contextPollInterval)
    } catch (error) {
      this.ui.showError(this.errorMessage(error))
    }
  }

  async toggleShare() {
    try {
      if (this.sharing) {
        await this.stopShare()
        return
      }

      await this.startShare()
    } catch (error) {
      this.ui.showError(this.errorMessage(error))
    }
  }

  private async syncContext() {
    if (!this.contextStores) return

    if (!this.config.enabled) {
      this.context = null
      this.ui.setContext(null)
      this.ui.setStatus('disabled')
      await this.disconnect()
      return
    }

    const context = resolveVoiceContext(this.contextStores)
    this.context = context
    this.ui.setContext(context)

    if (!context) {
      if (this.activeChannelId) await this.disconnect()
      this.ui.setStatus('waiting')
      return
    }

    if (this.activeChannelId && this.activeChannelId !== context.channelId) {
      await this.disconnect()
    }

    if (this.room?.state === ConnectionState.Connected) return

    if (!this.config.autoConnect) {
      this.ui.setStatus('connected', 'Pronto para transmitir')
      return
    }

    try {
      await this.ensureConnected()
    } catch (error) {
      this.ui.showError(this.errorMessage(error))
    }
  }

  private async ensureConnected() {
    if (this.room?.state === ConnectionState.Connected) return this.room
    if (this.connectPromise) return this.connectPromise
    if (!this.context) throw new Error('Entre em uma chamada de voz primeiro.')

    const attempt = ++this.connectAttempt
    const context = this.context
    this.ui.setStatus('connecting')
    this.connectPromise = this.connect(context, attempt).finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async connect(context: DiscordVoiceContext, attempt: number) {
    const session = await requestStreamToken(this.config, context)

    if (attempt !== this.connectAttempt) {
      throw new Error('Connection superseded by a channel change')
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        audioPreset: AudioPresets.musicHighQualityStereo,
        dtx: false,
        forceStereo: true,
        red: true,
        screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
        screenShareSimulcastLayers: [
          ScreenSharePresets.h360fps15,
          ScreenSharePresets.h720fps30,
        ],
        simulcast: true,
        videoCodec: 'vp8',
      },
    })

    this.bindRoom(room)
    try {
      await room.connect(session.livekitUrl, session.token, {
        autoSubscribe: true,
      })
    } catch (error) {
      await room.disconnect()
      throw error
    }

    if (attempt !== this.connectAttempt) {
      await room.disconnect()
      throw new Error('Connection superseded by a channel change')
    }

    this.room = room
    this.activeChannelId = context.channelId
    this.ui.setStatus('connected')
    this.ui.setAudioBlocked(!room.canPlaybackAudio)
    return room
  }

  private bindRoom(room: Room) {
    room.on(
      RoomEvent.TrackSubscribed,
      (track, publication, participant) => {
        this.attachRemoteTrack(track, publication, participant)
      },
    )

    room.on(
      RoomEvent.TrackUnsubscribed,
      (track, publication, participant) => {
        track.detach()
        this.ui.removeMedia(participant.identity, publication.trackSid)
      },
    )

    room.on(RoomEvent.ParticipantDisconnected, participant => {
      this.ui.removeParticipant(participant.identity)
    })

    room.on(RoomEvent.ConnectionStateChanged, state => {
      if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
        this.ui.setStatus('reconnecting')
      } else if (state === ConnectionState.Connected) {
        this.ui.setStatus('connected')
      }
    })

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      this.ui.setAudioBlocked(!room.canPlaybackAudio)
    })

    room.on(RoomEvent.Disconnected, () => {
      if (this.room !== room) return
      this.ui.clearMedia()
      this.ui.setSharing(false)
      this.sharing = false
      this.room = null
      this.activeChannelId = null
    })
  }

  private attachRemoteTrack(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) {
    if (
      publication.source !== Track.Source.ScreenShare &&
      publication.source !== Track.Source.ScreenShareAudio
    ) return

    const media = track.attach()

    if (media instanceof HTMLAudioElement) media.volume = 1
    this.ui.addMedia(
      participant.identity,
      participant.name || participant.identity,
      publication.trackSid,
      media,
      false,
    )
  }

  private async startShare() {
    const room = await this.ensureConnected()

    if (this.sharing) return

    this.ui.setStatus('connecting', 'Escolha uma tela ou janela…')

    let tracks: LocalTrack[] = []

    try {
      tracks = await room.localParticipant.createScreenTracks({
        audio: {
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: false,
          restrictOwnAudio: true,
        },
        contentHint: 'motion',
        resolution: ScreenSharePresets.h1080fps30.resolution,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
        video: { displaySurface: 'monitor' },
      })

      const publications = await Promise.all(
        tracks.map(track => this.publishScreenTrack(room, track)),
      )

      this.sharing = true
      this.ui.setSharing(true)
      this.ui.setStatus(
        'connected',
        tracks.some(track => track.kind === Track.Kind.Audio)
          ? 'Ao vivo com áudio'
          : 'Ao vivo sem áudio compartilhado',
      )

      this.attachLocalPreview(room, tracks, publications)
    } catch (error) {
      await Promise.all(tracks.map(async track => {
        if (this.localTracks.has(track)) {
          await room.localParticipant.unpublishTrack(track, true)
        }
        track.stop()
      }))
      this.localTracks.clear()
      this.ui.setSharing(false)
      this.ui.setStatus('connected')

      if (error instanceof DOMException && error.name === 'NotAllowedError') return
      throw error
    }
  }

  private async publishScreenTrack(room: Room, track: LocalTrack) {
    const video = track.kind === Track.Kind.Video
    const publication = await room.localParticipant.publishTrack(track, {
      audioPreset: AudioPresets.musicHighQualityStereo,
      degradationPreference: 'maintain-resolution',
      dtx: false,
      forceStereo: true,
      red: true,
      screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
      screenShareSimulcastLayers: [
        ScreenSharePresets.h360fps15,
        ScreenSharePresets.h720fps30,
      ],
      simulcast: video,
      source: video
        ? Track.Source.ScreenShare
        : Track.Source.ScreenShareAudio,
      stream: 'dorion-screen',
      videoCodec: 'vp8',
    })

    this.localTracks.set(track, publication.trackSid)
    if (video) track.once(TrackEvent.Ended, () => void this.stopShare())
    return publication
  }

  private attachLocalPreview(
    room: Room,
    tracks: LocalTrack[],
    publications: LocalTrackPublication[],
  ) {
    tracks.forEach((track, index) => {
      if (track.kind !== Track.Kind.Video) return

      const media = track.attach()

      if (media instanceof HTMLVideoElement) media.muted = true
      this.ui.addMedia(
        room.localParticipant.identity,
        room.localParticipant.name || this.context?.displayName || 'Você',
        publications[index].trackSid,
        media,
        true,
      )
    })
  }

  private async stopShare() {
    if (!this.room || this.localTracks.size === 0) {
      this.sharing = false
      this.ui.setSharing(false)
      return
    }

    const room = this.room
    const participantId = room.localParticipant.identity
    const tracks = [...this.localTracks.entries()]
    this.localTracks.clear()

    await Promise.all(tracks.map(async ([track, trackId]) => {
      track.detach()
      this.ui.removeMedia(participantId, trackId)
      await room.localParticipant.unpublishTrack(track, true)
      track.stop()
    }))

    this.sharing = false
    this.ui.setSharing(false)
    this.ui.setStatus('connected')
  }

  private async enableAudio() {
    if (this.room) await this.room.startAudio()
  }

  private async saveConfig(config: StreamConfig) {
    await writeStreamConfig(config)
    this.config = readStreamConfig()
    await this.disconnect()
    await this.syncContext()
  }

  private async disconnect() {
    this.connectAttempt += 1
    const room = this.room
    this.room = null
    this.activeChannelId = null

    if (!room) return

    await this.stopShareFrom(room)

    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        publication.track?.detach()
      }
    }

    this.ui.clearMedia()
    await room.disconnect()
  }

  private async stopShareFrom(room: Room) {
    const tracks = [...this.localTracks.keys()]
    this.localTracks.clear()

    await Promise.all(tracks.map(async track => {
      track.detach()
      await room.localParticipant.unpublishTrack(track, true)
      track.stop()
    }))
    this.sharing = false
    this.ui.setSharing(false)
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Falha desconhecida na transmissão.'
  }
}
