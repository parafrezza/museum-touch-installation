export type DateParts = {
  year: number
  month: number
  day: number
}

export type RawSettings = {
  yearStart: number
  yearEnd: number | 'current'
  manifestPath: string
  locale: string
}

export type InstallationSettings = {
  yearStart: number
  yearEnd: number
  manifestPath: string
  locale: string
}

export type ManifestImageEntry = {
  file: string
  date: string
  title?: string
}

export type ImagesManifest = {
  generatedAt?: string
  imageCount?: number
  images: ManifestImageEntry[]
}

export type ImageRecord = {
  id: string
  file: string
  dateISO: string
  date: Date
  timestamp: number
  title: string
}
