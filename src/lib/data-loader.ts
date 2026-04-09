import { parseIsoDate } from './date-utils'
import type {
  ImageRecord,
  ImagesManifest,
  InstallationSettings,
  RawSettings,
  TextureWindowSettings,
} from '../types'

const FALLBACK_SETTINGS: RawSettings = {
  yearStart: 1950,
  yearEnd: 'current',
  manifestPath: '/images/manifest.json',
  locale: 'it-IT',
  textureWindow: {
    prefetchBefore: 8,
    prefetchAfter: 8,
    maxResident: 24,
  },
}

function withTimestampQuery(url: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}_ts=${Date.now()}`
}

function normalizeSettings(value: Partial<RawSettings>): InstallationSettings {
  const currentYear = new Date().getFullYear()

  const rawYearStart =
    typeof value.yearStart === 'number' ? value.yearStart : FALLBACK_SETTINGS.yearStart
  const rawYearEnd =
    value.yearEnd === 'current' || typeof value.yearEnd === 'number'
      ? value.yearEnd
      : FALLBACK_SETTINGS.yearEnd

  const yearStart = Math.max(1900, Math.floor(rawYearStart))
  const yearEnd =
    rawYearEnd === 'current'
      ? currentYear
      : Math.max(yearStart, Math.floor(rawYearEnd))

  const rawTextureWindow = value.textureWindow ?? FALLBACK_SETTINGS.textureWindow ?? {}
  const normalizeTextureWindow = (
    input: Partial<TextureWindowSettings>,
  ): TextureWindowSettings => {
    const prefetchBefore = Math.max(
      1,
      Math.min(80, Math.floor(input.prefetchBefore ?? 8)),
    )
    const prefetchAfter = Math.max(
      1,
      Math.min(80, Math.floor(input.prefetchAfter ?? 8)),
    )
    const minResident = prefetchBefore + prefetchAfter + 1
    const maxResident = Math.max(
      minResident,
      Math.min(200, Math.floor(input.maxResident ?? 24)),
    )
    return {
      prefetchBefore,
      prefetchAfter,
      maxResident,
    }
  }

  return {
    yearStart,
    yearEnd,
    manifestPath:
      typeof value.manifestPath === 'string'
        ? value.manifestPath
        : FALLBACK_SETTINGS.manifestPath,
    locale:
      typeof value.locale === 'string' ? value.locale : FALLBACK_SETTINGS.locale,
    textureWindow: normalizeTextureWindow(rawTextureWindow),
  }
}

function inferTitleFromPath(filePath: string, date: string): string {
  const filename = filePath.split('/').at(-1) ?? ''
  if (filename.length === 0) {
    return `Archivio ${date}`
  }

  const withoutExtension = filename.replace(/\.[a-z0-9]+$/i, '')
  const withoutDatePrefix = withoutExtension.replace(/^\d{4}-\d{2}-\d{2}[_-]?/, '')
  const normalized = withoutDatePrefix.replace(/[_-]+/g, ' ').trim()

  return normalized.length > 0 ? normalized : `Archivio ${date}`
}

function normalizeFilePath(value: string): string {
  return value.startsWith('/') ? value : `/${value}`
}

function normalizeManifest(
  manifest: ImagesManifest,
  settings: InstallationSettings,
): ImageRecord[] {
  const normalized = manifest.images
    .map((entry, index) => {
      const parsedDate = parseIsoDate(entry.date)
      if (!parsedDate || typeof entry.file !== 'string') {
        return null
      }

      const year = parsedDate.getUTCFullYear()
      if (year < settings.yearStart || year > settings.yearEnd) {
        return null
      }

      return {
        id: `${entry.date}-${index}`,
        file: normalizeFilePath(entry.file),
        dateISO: entry.date,
        date: parsedDate,
        timestamp: parsedDate.getTime(),
        title:
          typeof entry.title === 'string' && entry.title.trim().length > 0
            ? entry.title.trim()
            : inferTitleFromPath(entry.file, entry.date),
      }
    })
    .filter((record): record is ImageRecord => record !== null)

  normalized.sort((a, b) => a.timestamp - b.timestamp)
  return normalized
}

export async function loadSettings(): Promise<InstallationSettings> {
  const settingsResponse = await fetch('/config/settings.json', {
    cache: 'no-store',
  })
  if (!settingsResponse.ok) {
    throw new Error(`Impossibile leggere settings.json (${settingsResponse.status})`)
  }

  const rawSettings = (await settingsResponse.json()) as Partial<RawSettings>
  return normalizeSettings(rawSettings)
}

export async function loadImagesFromManifest(
  settings: InstallationSettings,
): Promise<ImageRecord[]> {
  const manifestResponse = await fetch(withTimestampQuery(settings.manifestPath), {
    cache: 'no-store',
  })
  if (!manifestResponse.ok) {
    throw new Error(
      `Impossibile leggere il manifest immagini (${manifestResponse.status})`,
    )
  }

  const manifest = (await manifestResponse.json()) as ImagesManifest
  return normalizeManifest(manifest, settings)
}

export async function loadInstallationData(): Promise<{
  settings: InstallationSettings
  images: ImageRecord[]
}> {
  const settings = await loadSettings()
  const images = await loadImagesFromManifest(settings)
  if (images.length === 0) {
    throw new Error('Nessuna immagine valida trovata nel manifest.')
  }

  return { settings, images }
}
