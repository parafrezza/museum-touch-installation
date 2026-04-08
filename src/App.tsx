import { useEffect, useRef, useState } from 'react'
import { DateWheelPicker } from './components/DateWheelPicker'
import { WebGLCarousel } from './components/WebGLCarousel'
import {
  clamp,
  datePartsFromDate,
  datePartsToUtcTimestamp,
  daysInMonth,
  formatDate,
  formatDateParts,
} from './lib/date-utils'
import { loadImagesFromManifest, loadInstallationData } from './lib/data-loader'
import { logClientEvent } from './lib/client-logger'
import { findNearestImageIndex } from './lib/indexing'
import { startGraphicsPerformanceLogging } from './lib/performance-monitor'
import type { DateParts, ImageRecord, InstallationSettings } from './types'

type LoadingStatus = 'loading' | 'ready' | 'error'
type NavigationSource = 'bootstrap' | 'picker' | 'carousel' | 'manifest-sync'

const MANIFEST_REFRESH_MS = 2000
const IMAGE_SETTLE_LOG_DELAY_MS = 380
const MIN_SYNC_SPINNER_MS = 320

function imagesHaveChanged(previous: ImageRecord[], next: ImageRecord[]): boolean {
  if (previous.length !== next.length) {
    return true
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (
      previous[index].file !== next[index].file ||
      previous[index].dateISO !== next[index].dateISO
    ) {
      return true
    }
  }

  return false
}

async function filterReachableImages(records: ImageRecord[]) {
  const checks = await Promise.all(
    records.map(async (record) => {
      try {
        const response = await fetch(`${record.file}?_exist=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-store',
        })
        return response.ok ? record : null
      } catch {
        return null
      }
    }),
  )
  return checks.filter((record): record is ImageRecord => record !== null)
}

function App() {
  const [status, setStatus] = useState<LoadingStatus>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [settings, setSettings] = useState<InstallationSettings | null>(null)
  const [images, setImages] = useState<ImageRecord[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedDate, setSelectedDate] = useState<DateParts | null>(null)
  const [isManifestSyncing, setIsManifestSyncing] = useState(false)
  const [isCarouselLoading, setIsCarouselLoading] = useState(false)
  const imagesRef = useRef<ImageRecord[]>([])
  const selectedDateRef = useRef<DateParts | null>(null)
  const navigationSourceRef = useRef<NavigationSource>('bootstrap')
  const settleLogTimerRef = useRef<number | null>(null)
  const lastSettledKeyRef = useRef('')
  const syncSpinnerStartRef = useRef<number>(0)

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  useEffect(() => {
    let ignore = false

    async function bootstrap() {
      try {
        const loaded = await loadInstallationData()
        const reachableImages = await filterReachableImages(loaded.images)
        if (ignore) {
          return
        }

        if (reachableImages.length === 0) {
          throw new Error(
            'Nessuna immagine raggiungibile: controlla file e manifest.',
          )
        }

        const today = new Date()
        const clampedYear = clamp(
          today.getFullYear(),
          loaded.settings.yearStart,
          loaded.settings.yearEnd,
        )
        const startDate: DateParts = {
          year: clampedYear,
          month: today.getMonth() + 1,
          day: Math.min(today.getDate(), daysInMonth(clampedYear, today.getMonth() + 1)),
        }

        const startIndex = findNearestImageIndex(
          reachableImages,
          datePartsToUtcTimestamp(startDate),
        )

        setSettings(loaded.settings)
        setImages(reachableImages)
        setSelectedDate(startDate)
        setActiveIndex(startIndex)
        navigationSourceRef.current = 'bootstrap'
        setStatus('ready')

        logClientEvent(
          'Bootstrap archivio completato',
          { images: reachableImages.length },
          'system',
        )
      } catch (error) {
        if (!ignore) {
          setStatus('error')
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Errore sconosciuto in fase di bootstrap.',
          )
        }
      }
    }

    void bootstrap()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !settings) {
      return
    }

    let active = true
    const currentSettings = settings

    async function refreshManifest() {
      let syncingStarted = false
      try {
        const refreshedImages = await loadImagesFromManifest(currentSettings)
        if (!active || refreshedImages.length === 0) {
          return
        }

        const reachableImages = await filterReachableImages(refreshedImages)
        if (!active || reachableImages.length === 0) {
          return
        }

        const previousCount = imagesRef.current.length
        if (!imagesHaveChanged(imagesRef.current, reachableImages)) {
          return
        }

        syncingStarted = true
        syncSpinnerStartRef.current = Date.now()
        setIsManifestSyncing(true)

        imagesRef.current = reachableImages
        setImages(reachableImages)
        navigationSourceRef.current = 'manifest-sync'
        logClientEvent(
          'Manifest aggiornato e sincronizzato',
          {
            previousCount,
            nextCount: reachableImages.length,
          },
          'system',
        )

        const selected = selectedDateRef.current
        if (selected) {
          const nearestIndex = findNearestImageIndex(
            reachableImages,
            datePartsToUtcTimestamp(selected),
          )
          setActiveIndex(nearestIndex)
        } else {
          setActiveIndex(0)
          setSelectedDate(datePartsFromDate(reachableImages[0].date))
        }
      } catch {
        // Non blocchiamo la UI su errori temporanei di refresh.
      } finally {
        if (syncingStarted && active) {
          const elapsed = Date.now() - syncSpinnerStartRef.current
          const remaining = Math.max(0, MIN_SYNC_SPINNER_MS - elapsed)
          window.setTimeout(() => {
            if (active) {
              setIsManifestSyncing(false)
            }
          }, remaining)
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshManifest()
    }, MANIFEST_REFRESH_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [settings, status])

  useEffect(() => {
    if (status !== 'ready' || images.length === 0) {
      return
    }

    if (settleLogTimerRef.current) {
      window.clearTimeout(settleLogTimerRef.current)
      settleLogTimerRef.current = null
    }

    settleLogTimerRef.current = window.setTimeout(() => {
      const safeIndex = clamp(activeIndex, 0, images.length - 1)
      const image = images[safeIndex]
      const key = `${image.file}-${image.dateISO}-${safeIndex}`
      if (key === lastSettledKeyRef.current) {
        return
      }
      lastSettledKeyRef.current = key
      logClientEvent('Immagine selezionata', {
        index: safeIndex,
        date: image.dateISO,
        title: image.title,
        file: image.file,
        source: navigationSourceRef.current,
      })
    }, IMAGE_SETTLE_LOG_DELAY_MS)

    return () => {
      if (settleLogTimerRef.current) {
        window.clearTimeout(settleLogTimerRef.current)
        settleLogTimerRef.current = null
      }
    }
  }, [activeIndex, images, status])

  useEffect(() => {
    if (status !== 'ready' || !import.meta.env.DEV) {
      return
    }

    logClientEvent(
      'Monitor performance grafica avviato',
      { intervalMs: 5000 },
      'performance',
    )
    const stopMonitor = startGraphicsPerformanceLogging(5000)

    return () => {
      stopMonitor()
      logClientEvent('Monitor performance grafica arrestato', undefined, 'performance')
    }
  }, [status])

  if (status === 'loading') {
    return (
      <div className="app-state-screen">
        <p>Caricamento archivio immagini...</p>
      </div>
    )
  }

  if (status === 'error' || !settings || !selectedDate || images.length === 0) {
    return (
      <div className="app-state-screen">
        <p>Errore: {errorMessage}</p>
      </div>
    )
  }

  const safeActiveIndex = clamp(activeIndex, 0, images.length - 1)
  const activeImage = images[safeActiveIndex]
  const requestedTimestamp = datePartsToUtcTimestamp(selectedDate)
  const exactMatch = activeImage.timestamp === requestedTimestamp
  const showSyncSpinner = isManifestSyncing || isCarouselLoading

  function handleDateChange(nextDate: DateParts) {
    navigationSourceRef.current = 'picker'
    setSelectedDate(nextDate)
    const nearestIndex = findNearestImageIndex(
      images,
      datePartsToUtcTimestamp(nextDate),
    )
    setActiveIndex(nearestIndex)
  }

  function handleCarouselIndexChange(index: number) {
    const boundedIndex = clamp(index, 0, images.length - 1)
    navigationSourceRef.current = 'carousel'
    setActiveIndex(boundedIndex)
    setSelectedDate(datePartsFromDate(images[boundedIndex].date))
  }

  function handlePickerSwipeEnd(details: {
    column: string
    from: number
    to: number
  }) {
    logClientEvent('Swipe selettore data', details)
  }

  function handleCarouselSwipeEnd(details: {
    fromIndex: number
    toIndex: number
  }) {
    logClientEvent('Swipe carosello', details)
  }

  return (
    <main className="installation-shell">
      <div className="installation-frame">
        <header className="status-strip">
          <div className="status-chip">
            Richiesta: {formatDateParts(selectedDate, settings.locale)}
          </div>
          <div className="status-chip">
            Visualizzata: {formatDate(activeImage.date, settings.locale)}
          </div>
          <div className="status-chip">
            {exactMatch ? 'Data esatta' : 'Data vicina (prima o dopo)'}
          </div>
        </header>

        <section className="carousel-panel">
          <WebGLCarousel
            images={images}
            activeIndex={safeActiveIndex}
            onIndexChange={handleCarouselIndexChange}
            onSwipeEnd={handleCarouselSwipeEnd}
            onLoadingStateChange={setIsCarouselLoading}
          />
          {showSyncSpinner && (
            <div className="carousel-sync-overlay">
              <div className="carousel-spinner" />
              <div className="carousel-sync-text">Aggiornamento immagini...</div>
            </div>
          )}
        </section>

        <section className="picker-panel">
          <DateWheelPicker
            minYear={settings.yearStart}
            maxYear={settings.yearEnd}
            value={selectedDate}
            onChange={handleDateChange}
            onSwipeEnd={handlePickerSwipeEnd}
          />
          <p className="helper-text">
            Trascina il carosello in alto o usa le rotelle data in basso.
          </p>
        </section>
      </div>
    </main>
  )
}

export default App
