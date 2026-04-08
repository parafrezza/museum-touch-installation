import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist')

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = Number.parseInt(process.env.PORT ?? '4173', 10)

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

function normalizeRequestPath(urlPath) {
  if (!urlPath || urlPath === '/') {
    return '/index.html'
  }
  return decodeURIComponent(urlPath.split('?')[0])
}

async function serveFile(response, absolutePath) {
  const content = await fs.readFile(absolutePath)
  response.statusCode = 200
  response.setHeader('Content-Type', contentTypeFor(absolutePath))
  response.setHeader('Cache-Control', 'public, max-age=300')
  response.end(content)
}

async function pathExists(absolutePath) {
  try {
    const stat = await fs.stat(absolutePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function ensureDistExists() {
  const indexPath = path.join(DIST_DIR, 'index.html')
  if (!(await pathExists(indexPath))) {
    console.error('dist non trovato. Esegui prima: npm run build:prod')
    process.exit(1)
  }
}

await ensureDistExists()

const server = http.createServer(async (request, response) => {
  try {
    const normalizedPath = normalizeRequestPath(request.url ?? '/')
    const safePath = path.normalize(normalizedPath).replace(/^(\.\.(\/|\\|$))+/, '')
    const requestedAbsolutePath = path.join(DIST_DIR, safePath)

    const withinDist = requestedAbsolutePath.startsWith(DIST_DIR)
    if (!withinDist) {
      response.statusCode = 400
      response.end('Bad request')
      return
    }

    if (await pathExists(requestedAbsolutePath)) {
      await serveFile(response, requestedAbsolutePath)
      return
    }

    const fallbackIndexPath = path.join(DIST_DIR, 'index.html')
    await serveFile(response, fallbackIndexPath)
  } catch (error) {
    response.statusCode = 500
    response.end('Internal server error')
    console.error(error)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Production server running on http://${HOST}:${PORT}`)
})

function stop() {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
