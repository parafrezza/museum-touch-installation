import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const IMAGES_DIR = path.join(ROOT, 'public', 'images')
const MANIFEST_FILE = path.join(IMAGES_DIR, 'manifest.json')

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.svg',
])

const FILENAME_DATE_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[_-](.+))?\.[a-z0-9]+$/i

function isValidDateParts(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }
  const test = new Date(Date.UTC(year, month - 1, day))
  return (
    test.getUTCFullYear() === year &&
    test.getUTCMonth() === month - 1 &&
    test.getUTCDate() === day
  )
}

function humanizeSlug(value) {
  if (!value) {
    return ''
  }
  return value.replace(/[_-]+/g, ' ').trim()
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

async function buildManifest() {
  await fs.mkdir(IMAGES_DIR, { recursive: true })
  const dirEntries = await fs.readdir(IMAGES_DIR, { withFileTypes: true })

  const images = []
  const skipped = []

  for (const entry of dirEntries) {
    if (!entry.isFile()) {
      continue
    }

    const extension = path.extname(entry.name).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      continue
    }

    if (entry.name === 'manifest.json') {
      continue
    }

    const match = entry.name.match(FILENAME_DATE_REGEX)
    if (!match) {
      skipped.push(entry.name)
      continue
    }

    const year = Number.parseInt(match[1], 10)
    const month = Number.parseInt(match[2], 10)
    const day = Number.parseInt(match[3], 10)

    if (!isValidDateParts(year, month, day)) {
      skipped.push(entry.name)
      continue
    }

    const date = `${match[1]}-${pad2(month)}-${pad2(day)}`
    const inferredTitle = humanizeSlug(match[4]) || `Archivio ${date}`

    images.push({
      file: `/images/${entry.name}`,
      date,
      title: inferredTitle,
    })
  }

  images.sort((a, b) => a.date.localeCompare(b.date))

  const manifest = {
    generatedAt: new Date().toISOString(),
    imageCount: images.length,
    images,
  }

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`Manifest generated: ${images.length} images -> ${MANIFEST_FILE}`)
  if (skipped.length > 0) {
    console.log('\nSkipped files (invalid naming, expected YYYY-MM-DD_name.ext):')
    for (const filename of skipped) {
      console.log(`- ${filename}`)
    }
  }
}

buildManifest().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
