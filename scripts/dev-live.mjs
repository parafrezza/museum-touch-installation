import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendLog } from './logging.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'

const childProcesses = [
  {
    name: 'logger-server',
    child: spawn(npmCmd, ['run', 'logger:server'], {
      cwd: ROOT,
      stdio: 'inherit',
    }),
  },
  {
    name: 'watch-images',
    child: spawn(npmCmd, ['run', 'watch:images'], {
      cwd: ROOT,
      stdio: 'inherit',
    }),
  },
  {
    name: 'vite-dev',
    child: spawn(npmCmd, ['run', 'dev:vite'], {
      cwd: ROOT,
      stdio: 'inherit',
    }),
  },
]

let shuttingDown = false

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  await appendLog({
    section: 'server',
    message: 'Orchestrator dev-live arrestato',
    data: { exitCode },
  })

  for (const processDescriptor of childProcesses) {
    if (!processDescriptor.child.killed) {
      processDescriptor.child.kill('SIGTERM')
    }
  }

  setTimeout(() => {
    process.exit(exitCode)
  }, 120)
}

await appendLog({
  section: 'server',
  message: 'Orchestrator dev-live avviato',
  data: {
    pid: process.pid,
    workspace: ROOT,
  },
})

for (const processDescriptor of childProcesses) {
  processDescriptor.child.on('exit', (code) => {
    const nextCode = code ?? 0
    void appendLog({
      section: 'server',
      message: 'Processo figlio terminato',
      data: {
        name: processDescriptor.name,
        exitCode: nextCode,
      },
    })
    void shutdown(nextCode)
  })
}

process.on('SIGINT', () => {
  void shutdown(0)
})
process.on('SIGTERM', () => {
  void shutdown(0)
})
