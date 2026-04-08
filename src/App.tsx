import { useEffect, useState } from 'react'
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
import { loadInstallationData } from './lib/data-loader'
import { findNearestImageIndex } from './lib/indexing'
import type { DateParts, ImageRecord, InstallationSettings } from './types'

type LoadingStatus = 'loading' | 'ready' | 'error'

function App() {
  const [status, setStatus] = useState<LoadingStatus>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [settings, setSettings] = useState<InstallationSettings | null>(null)
  const [images, setImages] = useState<ImageRecord[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedDate, setSelectedDate] = useState<DateParts | null>(null)

  useEffect(() => {
    let ignore = false

    async function bootstrap() {
      try {
        const loaded = await loadInstallationData()
        if (ignore) {
          return
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
          loaded.images,
          datePartsToUtcTimestamp(startDate),
        )

        setSettings(loaded.settings)
        setImages(loaded.images)
        setSelectedDate(startDate)
        setActiveIndex(startIndex)
        setStatus('ready')
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

  const activeImage = images[activeIndex]
  const requestedTimestamp = datePartsToUtcTimestamp(selectedDate)
  const exactMatch = activeImage.timestamp === requestedTimestamp

  function handleDateChange(nextDate: DateParts) {
    setSelectedDate(nextDate)
    const nearestIndex = findNearestImageIndex(
      images,
      datePartsToUtcTimestamp(nextDate),
    )
    setActiveIndex(nearestIndex)
  }

  function handleCarouselIndexChange(index: number) {
    const boundedIndex = clamp(index, 0, images.length - 1)
    setActiveIndex(boundedIndex)
    setSelectedDate(datePartsFromDate(images[boundedIndex].date))
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
            activeIndex={activeIndex}
            onIndexChange={handleCarouselIndexChange}
          />
        </section>

        <section className="picker-panel">
          <DateWheelPicker
            minYear={settings.yearStart}
            maxYear={settings.yearEnd}
            value={selectedDate}
            onChange={handleDateChange}
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
