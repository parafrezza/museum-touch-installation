import { parseIsoDate } from './date-utils'
import type {
  ImageRecord,
  ImagesManifest,
  InstallationSettings,
  RawSettings,
} from '../types'

const FALLBACK_SETTINGS: RawSettings = {
  yearStart: 1950,
  yearEnd: 'current',
  manifestPath: '/images/manifest.json',
  locale: 'it-IT',
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

  return {
    yearStart,
    yearEnd,
    manifestPath:
      typeof value.manifestPath === 'string'
        ? value.manifestPath
        : FALLBACK_SETTINGS.manifestPath,
    locale:
      typeof value.locale === 'string' ? value.locale : FALLBACK_SETTINGS.locale,
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

export async function loadInstallationData(): Promise<{
  settings: InstallationSettings
  images: ImageRecord[]
}> {
  const settingsResponse = await fetch('/config/settings.json', {
    cache: 'no-store',
  })
  if (!settingsResponse.ok) {
    throw new Error(`Impossibile leggere settings.json (${settingsResponse.status})`)
  }

  const rawSettings = (await settingsResponse.json()) as Partial<RawSettings>
  const settings = normalizeSettings(rawSettings)

  const manifestResponse = await fetch(settings.manifestPath, { cache: 'no-store' })
  if (!manifestResponse.ok) {
    throw new Error(
      `Impossibile leggere il manifest immagini (${manifestResponse.status})`,
    )
  }

  const manifest = (await manifestResponse.json()) as ImagesManifest
  const images = normalizeManifest(manifest, settings)
  if (images.length === 0) {
    throw new Error('Nessuna immagine valida trovata nel manifest.')
  }

  return { settings, images }
}
