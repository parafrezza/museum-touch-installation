import http from 'node:http'
import { appendLog, getCurrentLogFilePath } from './logging.mjs'

const PORT = Number.parseInt(process.env.LOG_SERVER_PORT ?? '8787', 10)
let shuttingDown = false

function applyCorsHeaders(request, response) {
  const origin = request.headers.origin
  if (typeof origin === 'string' && origin.length > 0) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Vary', 'Origin')
  } else {
    response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
  }
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    return {}
  }
  return JSON.parse(raw)
}

const server = http.createServer(async (request, response) => {
  applyCorsHeaders(request, response)

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ ok: true }))
    return
  }

  if (request.method === 'POST' && request.url === '/log') {
    try {
      const payload = await readJsonBody(request)
      await appendLog({
        section: payload.section ?? 'client',
        message:
          typeof payload.message === 'string'
            ? payload.message
            : 'Evento client',
        data: payload.data,
      })
      response.statusCode = 204
      response.end()
    } catch (error) {
      response.statusCode = 400
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'invalid payload',
        }),
      )
    }
    return
  }

  response.statusCode = 404
  response.end()
})

async function boot() {
  const logFilePath = await getCurrentLogFilePath()
  server.listen(PORT, '127.0.0.1', async () => {
    console.log(`[logger] listening on http://127.0.0.1:${PORT}/log`)
    console.log(`[logger] file ${logFilePath}`)
    await appendLog({
      section: 'server',
      message: 'Logger server avviato',
      data: { port: PORT, logFilePath },
    })
  })
}

async function shutdown() {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  await appendLog({
    section: 'server',
    message: 'Logger server arrestato',
    data: { port: PORT },
  })
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', () => {
  void shutdown()
})
process.on('SIGTERM', () => {
  void shutdown()
})

boot().catch(async (error) => {
  console.error(error)
  await appendLog({
    section: 'error',
    message: 'Logger server crash',
    data: { reason: error instanceof Error ? error.message : String(error) },
  })
  process.exit(1)
})
