import type { DateParts } from '../types'

export const MONTH_LABELS_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
] as const

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function datePartsToUtcTimestamp(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day)
}

export function datePartsFromDate(date: Date): DateParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

export function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }

  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  if (day > daysInMonth(year, month)) {
    return null
  }

  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDateParts(parts: DateParts, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return formatter.format(new Date(datePartsToUtcTimestamp(parts)))
}

export function formatDate(date: Date, locale: string): string {
  return formatDateParts(datePartsFromDate(date), locale)
}
