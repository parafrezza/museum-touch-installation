import { logClientEvent } from './client-logger'

type StopMonitor = () => void

const DEFAULT_INTERVAL_MS = 5000
const LONG_FRAME_THRESHOLD_MS = 34

function toFixedNumber(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

export function startGraphicsPerformanceLogging(
  intervalMs = DEFAULT_INTERVAL_MS,
): StopMonitor {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return () => {}
  }

  let frameCount = 0
  let longFrames = 0
  let worstFrameMs = 0
  let sampleStart = performance.now()
  let lastFrameTs = sampleStart
  let rafId = 0

  const tick = (timestamp: number) => {
    const deltaMs = timestamp - lastFrameTs
    lastFrameTs = timestamp
    frameCount += 1

    if (deltaMs > LONG_FRAME_THRESHOLD_MS) {
      longFrames += 1
    }
    if (deltaMs > worstFrameMs) {
      worstFrameMs = deltaMs
    }

    rafId = window.requestAnimationFrame(tick)
  }

  rafId = window.requestAnimationFrame(tick)

  const timerId = window.setInterval(() => {
    const now = performance.now()
    const elapsed = Math.max(1, now - sampleStart)
    const fps = (frameCount * 1000) / elapsed
    const longFrameRatio = frameCount > 0 ? (longFrames / frameCount) * 100 : 0

    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize?: number }
    }).memory

    logClientEvent(
      'Performance grafica',
      {
        fpsAvg: toFixedNumber(fps),
        frames: frameCount,
        longFrames,
        longFrameRatioPct: toFixedNumber(longFrameRatio),
        worstFrameMs: toFixedNumber(worstFrameMs),
        dpr: toFixedNumber(window.devicePixelRatio ?? 1),
        visibility: document.visibilityState,
        usedHeapMb:
          typeof memory?.usedJSHeapSize === 'number'
            ? toFixedNumber(memory.usedJSHeapSize / 1024 / 1024)
            : null,
      },
      'performance',
    )

    sampleStart = now
    frameCount = 0
    longFrames = 0
    worstFrameMs = 0
  }, intervalMs)

  return () => {
    window.clearInterval(timerId)
    window.cancelAnimationFrame(rafId)
  }
}
