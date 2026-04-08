import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { appendLog } from './logging.mjs'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const IMAGES_DIR = path.join(ROOT, 'public', 'images')
const BUILD_MANIFEST_SCRIPT = path.join(ROOT, 'scripts', 'build-manifest.mjs')

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.svg',
])

const DEBOUNCE_MS = 180

let debounceTimer = null
let ignoreEventsUntil = 0
let running = false
let queued = false
let stopping = false

function shouldProcessEvent(filename) {
  if (!filename) {
    return true
  }

  if (filename === 'manifest.json' || filename.startsWith('.')) {
    return false
  }

  const extension = path.extname(filename).toLowerCase()
  return SUPPORTED_EXTENSIONS.has(extension)
}

async function runBuild(reason) {
  if (running) {
    queued = true
    return
  }

  running = true
  try {
    await execFileAsync('node', [BUILD_MANIFEST_SCRIPT], { cwd: ROOT })
    ignoreEventsUntil = Date.now() + 350
    console.log(`[watch-images] manifest aggiornato (${reason})`)
    await appendLog({
      section: 'watcher',
      message: 'Manifest aggiornato',
      data: { reason },
    })
  } catch (error) {
    console.error('[watch-images] errore aggiornando il manifest')
    console.error(error)
    await appendLog({
      section: 'error',
      message: 'Errore watcher aggiornando manifest',
      data: { reason, error: error instanceof Error ? error.message : String(error) },
    })
  } finally {
    running = false
    if (queued) {
      queued = false
      await runBuild('queue')
    }
  }
}

async function start() {
  await fsPromises.mkdir(IMAGES_DIR, { recursive: true })
  await runBuild('startup')

  const watcher = fs.watch(IMAGES_DIR, { persistent: true }, (_event, fileBuffer) => {
    try {
      if (Date.now() < ignoreEventsUntil) {
        return
      }

      const filename =
        typeof fileBuffer === 'string' ? fileBuffer : fileBuffer?.toString()
      if (!shouldProcessEvent(filename)) {
        return
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void runBuild(filename ? `file: ${filename}` : 'evento generico')
      }, DEBOUNCE_MS)
    } catch (error) {
      void appendLog({
        section: 'error',
        message: 'Eccezione callback watcher',
        data: { error: error instanceof Error ? error.message : String(error) },
      })
    }
  })

  async function stop() {
    if (stopping) {
      return
    }
    stopping = true
    watcher.close()
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    await appendLog({
      section: 'watcher',
      message: 'Watcher immagini arrestato',
      data: { imagesDir: IMAGES_DIR },
    })
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void stop()
  })
  process.on('SIGTERM', () => {
    void stop()
  })
  console.log(`[watch-images] in ascolto su ${IMAGES_DIR}`)
  await appendLog({
    section: 'watcher',
    message: 'Watcher immagini avviato',
    data: { imagesDir: IMAGES_DIR },
  })
}

start().catch((error) => {
  console.error(error)
  void appendLog({
    section: 'error',
    message: 'Crash watcher immagini',
    data: { error: error instanceof Error ? error.message : String(error) },
  })
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('[watch-images] uncaughtException', error)
  void appendLog({
    section: 'error',
    message: 'Uncaught exception watcher',
    data: { error: error.message },
  })
})

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[watch-images] unhandledRejection', error)
  void appendLog({
    section: 'error',
    message: 'Unhandled rejection watcher',
    data: { error: message },
  })
})
