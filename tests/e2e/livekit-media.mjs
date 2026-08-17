import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const composeArgs = [
  'compose',
  '-p',
  'dorion-webrtc-e2e',
  '-f',
  resolve(root, 'deploy/docker-compose.yml'),
]
const testEnvironment = {
  ...process.env,
  LIVEKIT_API_KEY: 'e2ekey',
  LIVEKIT_API_SECRET: 'e2e-secret-with-at-least-32-characters',
  LIVEKIT_NODE_IP: '127.0.0.1',
  LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:7880',
  STREAM_ACCESS_KEY: 'e2e-access-key',
  STREAM_ALLOWED_ORIGINS: 'https://discord.com',
  STREAM_ROOM_SALT: 'e2e-room-salt-with-at-least-32-characters',
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: testEnvironment,
      stdio: options.quiet ? 'ignore' : 'inherit',
    })

    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:8787/health')
      if (response.ok) return
    } catch {
      // Service is starting.
    }

    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }

  throw new Error('Stream services did not become healthy')
}

async function issueToken(displayName, sessionId, userId) {
  const response = await fetch('http://127.0.0.1:8787/v1/token', {
    body: JSON.stringify({
      context: {
        channelId: '345678901234567890',
        guildId: '234567890123456789',
      },
      participant: { displayName, sessionId, userId },
    }),
    headers: {
      authorization: 'Bearer e2e-access-key',
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) throw new Error(`Token request failed: ${response.status}`)
  return response.json()
}

function browserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)

  const executable = candidates.find(candidate => existsSync(candidate))

  if (!executable) {
    throw new Error('Set PLAYWRIGHT_BROWSER_EXECUTABLE to a Chromium browser')
  }

  return executable
}

async function preparePage(browser, livekitBundle) {
  const page = await browser.newPage()
  await page.setContent('<main id="media"></main>')
  await page.addScriptTag({ path: livekitBundle })
  return page
}

async function connectViewer(page, session) {
  await page.evaluate(async ({ livekitUrl, token }) => {
    const livekit = window.LivekitClient
    const room = new livekit.Room({ adaptiveStream: true })
    window.testState = {
      audioContext: null,
      audioTrack: null,
      room,
      tracks: [],
      videoFrames: 0,
    }

    room.on(livekit.RoomEvent.TrackSubscribed, track => {
      window.testState.tracks.push({
        kind: track.kind,
        readyState: track.mediaStreamTrack.readyState,
        source: track.source,
      })

      if (track.kind === livekit.Track.Kind.Video) {
        const video = track.attach()
        video.autoplay = true
        video.muted = true
        document.querySelector('#media').appendChild(video)

        const countFrame = () => {
          window.testState.videoFrames += 1
          video.requestVideoFrameCallback(countFrame)
        }
        video.requestVideoFrameCallback(countFrame)
        void video.play()
      } else {
        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaStreamSource(
          new MediaStream([track.mediaStreamTrack]),
        )
        source.connect(analyser)
        void audioContext.resume()
        window.testState.audioContext = audioContext
        window.testState.audioTrack = track
      }
    })

    await room.connect(livekitUrl, token, { autoSubscribe: true })
  }, session)
}

async function connectPublisher(page, session) {
  await page.evaluate(async ({ livekitUrl, token }) => {
    const livekit = window.LivekitClient
    const room = new livekit.Room({
      publishDefaults: {
        audioPreset: livekit.AudioPresets.musicHighQualityStereo,
        dtx: false,
        forceStereo: true,
        screenShareEncoding: livekit.ScreenSharePresets.h1080fps30.encoding,
        simulcast: true,
        videoCodec: 'vp8',
      },
    })
    await room.connect(livekitUrl, token)

    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const context = canvas.getContext('2d')
    let frame = 0
    const render = () => {
      context.fillStyle = `hsl(${frame % 360} 80% 45%)`
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#fff'
      context.font = '40px sans-serif'
      context.fillText(`Dorion ${frame}`, 30, 70)
      frame += 1
      requestAnimationFrame(render)
    }
    render()

    const videoTrack = canvas.captureStream(30).getVideoTracks()[0]
    videoTrack.contentHint = 'motion'
    const localVideo = new livekit.LocalVideoTrack(videoTrack)

    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const destination = audioContext.createMediaStreamDestination()
    oscillator.frequency.value = 440
    gain.gain.value = 0.25
    oscillator.connect(gain).connect(destination)
    oscillator.start()
    await audioContext.resume()
    const localAudio = new livekit.LocalAudioTrack(
      destination.stream.getAudioTracks()[0],
    )

    await Promise.all([
      room.localParticipant.publishTrack(localVideo, {
        screenShareEncoding: livekit.ScreenSharePresets.h1080fps30.encoding,
        simulcast: true,
        source: livekit.Track.Source.ScreenShare,
        stream: 'dorion-screen',
        videoCodec: 'vp8',
      }),
      room.localParticipant.publishTrack(localAudio, {
        audioPreset: livekit.AudioPresets.musicHighQualityStereo,
        dtx: false,
        forceStereo: true,
        source: livekit.Track.Source.ScreenShareAudio,
        stream: 'dorion-screen',
      }),
    ])

    window.testPublisher = { audioContext, localAudio, localVideo, oscillator, room }
  }, session)
}

async function waitForMedia(page, label) {
  await page.waitForFunction(() => {
    const state = window.testState
    const video = state.tracks.some(track =>
      track.kind === 'video' &&
      track.source === 'screen_share' &&
      track.readyState === 'live')
    const audio = state.tracks.some(track =>
      track.kind === 'audio' &&
      track.source === 'screen_share_audio' &&
      track.readyState === 'live')
    return video && audio && state.videoFrames >= 3
  }, null, { timeout: 30_000 })

  await page.waitForFunction(async () => {
    const track = window.testState.audioTrack

    if (!track) return false

    const report = await track.getRTCStatsReport()
    let bytesReceived = 0
    report?.forEach(stat => {
      if (
        stat.type === 'inbound-rtp' &&
        (stat.kind === 'audio' || stat.mediaType === 'audio')
      ) bytesReceived += stat.bytesReceived || 0
    })
    return bytesReceived > 0
  }, null, { timeout: 30_000 })

  const result = await page.evaluate(async () => {
    const report = await window.testState.audioTrack.getRTCStatsReport()
    let audioBytesReceived = 0
    report?.forEach(stat => {
      if (
        stat.type === 'inbound-rtp' &&
        (stat.kind === 'audio' || stat.mediaType === 'audio')
      ) audioBytesReceived += stat.bytesReceived || 0
    })

    return {
      audioBytesReceived,
      tracks: window.testState.tracks,
      videoFrames: window.testState.videoFrames,
    }
  })

  if (result.audioBytesReceived === 0) {
    throw new Error(`${label} did not receive audio packets`)
  }

  return result
}

async function main() {
  const livekitBundle = resolve(
    root,
    'node_modules/livekit-client/dist/livekit-client.umd.js',
  )
  let browser
  let servicesStarted = false

  try {
    await run('docker', [...composeArgs, 'up', '-d', '--build'])
    servicesStarted = true
    await waitForHealth()

    const [publisherSession, viewerOneSession, viewerTwoSession] = await Promise.all([
      issueToken('Publisher', 'publisher-session', '123456789012345678'),
      issueToken('Viewer one', 'viewer-one-session', '123456789012345679'),
      issueToken('Viewer two', 'viewer-two-session', '123456789012345680'),
    ])

    browser = await chromium.launch({
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-ui-for-media-stream',
      ],
      executablePath: browserExecutable(),
      headless: true,
    })

    const [publisher, viewerOne, viewerTwo] = await Promise.all([
      preparePage(browser, livekitBundle),
      preparePage(browser, livekitBundle),
      preparePage(browser, livekitBundle),
    ])
    await Promise.all([
      connectViewer(viewerOne, viewerOneSession),
      connectViewer(viewerTwo, viewerTwoSession),
    ])
    await connectPublisher(publisher, publisherSession)

    const results = await Promise.all([
      waitForMedia(viewerOne, 'Viewer one'),
      waitForMedia(viewerTwo, 'Viewer two'),
    ])

    process.stdout.write(`${JSON.stringify({
      publisher: 'connected',
      viewers: results,
    }, null, 2)}\n`)
  } finally {
    if (browser) await browser.close()
    if (servicesStarted) {
      await run('docker', [...composeArgs, 'down', '--volumes'], { quiet: true })
    }
  }
}

await main()
