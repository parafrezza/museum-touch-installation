type LogPayload = {
  section: string
  message: string
  data?: Record<string, unknown>
}

function inferDefaultLogEndpoint(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8787/log'
  }
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  const host = window.location.hostname || '127.0.0.1'
  return `${protocol}//${host}:8787/log`
}

const LOG_ENDPOINT = import.meta.env.VITE_LOG_ENDPOINT
  ? import.meta.env.VITE_LOG_ENDPOINT
  : import.meta.env.DEV
    ? inferDefaultLogEndpoint()
    : ''

function sendLog(payload: LogPayload) {
  if (!LOG_ENDPOINT) {
    return
  }

  const body = JSON.stringify(payload)

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' })
    const queued = navigator.sendBeacon(LOG_ENDPOINT, blob)
    if (queued) {
      return
    }
  }

  void fetch(LOG_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Silent fail: logging must never block UI.
  })
}

export function logClientEvent(
  message: string,
  data?: Record<string, unknown>,
  section = 'interaction',
) {
  sendLog({ section, message, data })
}
