import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const LOGS_DIR = path.join(ROOT, 'logs')

function nowLocal() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${milliseconds}`
}

function currentLogFilePath() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return path.join(LOGS_DIR, `installation-${datePart}.log`)
}

function serializeData(data) {
  if (!data || typeof data !== 'object') {
    return ''
  }

  const entries = Object.entries(data)
  if (entries.length === 0) {
    return ''
  }

  return entries
    .map(([key, value]) => {
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value)
      return `  - ${key}: ${stringValue}`
    })
    .join('\n')
}

export async function appendLog({
  section,
  message,
  data,
}) {
  await fs.mkdir(LOGS_DIR, { recursive: true })

  const header = `[${nowLocal()}] ${section.toUpperCase()}`
  const payload = serializeData(data)
  const block = [
    '',
    '============================================================',
    header,
    message,
    payload,
    '============================================================',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')

  await fs.appendFile(currentLogFilePath(), `${block}\n`, 'utf8')
}

export async function getCurrentLogFilePath() {
  await fs.mkdir(LOGS_DIR, { recursive: true })
  return currentLogFilePath()
}
