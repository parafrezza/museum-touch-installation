import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const IMAGES_DIR = path.join(ROOT, 'public', 'images')
const BUILD_MANIFEST_SCRIPT = path.join(ROOT, 'scripts', 'build-manifest.mjs')

const START_YEAR = 1976
const TOTAL_IMAGES = 50

const MONTH_LABELS = [
  'GEN',
  'FEB',
  'MAR',
  'APR',
  'MAG',
  'GIU',
  'LUG',
  'AGO',
  'SET',
  'OTT',
  'NOV',
  'DIC',
]

function pad2(value) {
  return String(value).padStart(2, '0')
}

function makeSvg({
  year,
  month,
  day,
  index,
  colorA,
  colorB,
  colorC,
}) {
  const monthLabel = MONTH_LABELS[month - 1]
  const serial = String(index + 1).padStart(2, '0')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${colorA}" />
      <stop offset="100%" stop-color="${colorB}" />
    </linearGradient>
    <linearGradient id="overlay" x1="1" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.22)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.28)" />
    </linearGradient>
    <filter id="grain">
      <feTurbulence baseFrequency="0.8" numOctaves="2" seed="${index + 11}" type="fractalNoise" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.12" />
      </feComponentTransfer>
    </filter>
  </defs>

  <rect width="1080" height="1920" fill="url(#bg)" />
  <rect width="1080" height="1920" fill="url(#overlay)" />

  <g opacity="0.35">
    <circle cx="${210 + (index % 6) * 115}" cy="${360 + (index % 4) * 110}" r="${120 + (index % 5) * 18}" fill="${colorC}" />
    <circle cx="${920 - (index % 7) * 82}" cy="${1260 - (index % 5) * 140}" r="${145 + (index % 6) * 16}" fill="${colorC}" />
  </g>

  <g filter="url(#grain)">
    <rect width="1080" height="1920" fill="white" />
  </g>

  <line x1="86" y1="86" x2="994" y2="86" stroke="rgba(255,255,255,0.42)" stroke-width="2" />
  <line x1="86" y1="1834" x2="994" y2="1834" stroke="rgba(255,255,255,0.42)" stroke-width="2" />

  <text x="90" y="170" fill="rgba(255,255,255,0.9)" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="46" font-weight="600">
    ARCHIVIO MUSEO
  </text>
  <text x="90" y="278" fill="rgba(255,255,255,0.95)" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="136" font-weight="700">
    ${year}
  </text>
  <text x="90" y="352" fill="rgba(255,255,255,0.82)" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="48" font-weight="500">
    ${pad2(day)} ${monthLabel}
  </text>
  <text x="90" y="1780" fill="rgba(255,255,255,0.82)" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="40" letter-spacing="6">
    DEMO ${serial} / ${TOTAL_IMAGES}
  </text>
</svg>
`
}

function pickPalette(index) {
  const hue = (index * 41 + 12) % 360
  const hue2 = (hue + 55) % 360
  const hue3 = (hue + 170) % 360

  const colorA = `hsl(${hue}, 66%, 36%)`
  const colorB = `hsl(${hue2}, 68%, 22%)`
  const colorC = `hsla(${hue3}, 78%, 68%, 0.45)`
  return { colorA, colorB, colorC }
}

async function removeExistingGeneratedFiles() {
  await fs.mkdir(IMAGES_DIR, { recursive: true })
  const entries = await fs.readdir(IMAGES_DIR, { withFileTypes: true })
  const removable = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((filename) => filename.endsWith('.svg') || filename === 'manifest.json')

  await Promise.all(
    removable.map((filename) => fs.rm(path.join(IMAGES_DIR, filename), { force: true })),
  )
}

async function generateDemoImages() {
  await removeExistingGeneratedFiles()

  for (let index = 0; index < TOTAL_IMAGES; index += 1) {
    const year = START_YEAR + index
    const month = ((index * 7) % 12) + 1
    const day = ((index * 11) % 28) + 1
    const date = `${year}-${pad2(month)}-${pad2(day)}`
    const filename = `${date}_demo_${String(index + 1).padStart(2, '0')}.svg`
    const { colorA, colorB, colorC } = pickPalette(index)

    const svg = makeSvg({
      year,
      month,
      day,
      index,
      colorA,
      colorB,
      colorC,
    })

    await fs.writeFile(path.join(IMAGES_DIR, filename), svg, 'utf8')
  }

  await execFileAsync('node', [BUILD_MANIFEST_SCRIPT], { cwd: ROOT })
  console.log(`Generated ${TOTAL_IMAGES} demo images in ${IMAGES_DIR}`)
}

generateDemoImages().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
