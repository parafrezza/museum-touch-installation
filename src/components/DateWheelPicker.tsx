import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { MONTH_LABELS_IT, clamp, daysInMonth } from '../lib/date-utils'
import type { DateParts } from '../types'

type WheelOption = {
  value: number
  label: string
}

type WheelColumnProps = {
  label: string
  options: WheelOption[]
  value: number
  onChange: (value: number) => void
  onSwipeEnd?: (details: { column: string; from: number; to: number }) => void
}

type DateWheelPickerProps = {
  minYear: number
  maxYear: number
  value: DateParts
  onChange: (value: DateParts) => void
  onSwipeEnd?: (details: { column: string; from: number; to: number }) => void
}

const ITEM_HEIGHT = 46
const ANGLE_STEP = 18
const WHEEL_RADIUS = 110

function optionIndexForValue(options: WheelOption[], value: number): number {
  const foundIndex = options.findIndex((option) => option.value === value)
  return foundIndex >= 0 ? foundIndex : 0
}

function WheelColumn({ label, options, value, onChange, onSwipeEnd }: WheelColumnProps) {
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const dragOffsetRef = useRef<number | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startOffset: number
  } | null>(null)
  const gestureStartValueRef = useRef(value)
  const emittedIndexRef = useRef(optionIndexForValue(options, value))

  const baseOffset = -optionIndexForValue(options, value) * ITEM_HEIGHT
  const offset = dragOffset ?? baseOffset

  function minOffset() {
    return -(options.length - 1) * ITEM_HEIGHT
  }

  function clampOffset(nextOffset: number) {
    return clamp(nextOffset, minOffset(), 0)
  }

  function indexFromOffset(currentOffset: number): number {
    return clamp(Math.round(-currentOffset / ITEM_HEIGHT), 0, options.length - 1)
  }

  function updateDragOffset(nextOffset: number | null) {
    dragOffsetRef.current = nextOffset
    setDragOffset(nextOffset)
  }

  function emitIndex(index: number) {
    if (index === emittedIndexRef.current) {
      return
    }
    emittedIndexRef.current = index
    onChange(options[index].value)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    emittedIndexRef.current = optionIndexForValue(options, value)
    gestureStartValueRef.current = options[emittedIndexRef.current].value
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offset,
    }
    updateDragOffset(offset)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    const deltaY = event.clientY - drag.startY
    const nextOffset = clampOffset(drag.startOffset - deltaY)
    updateDragOffset(nextOffset)
    emitIndex(indexFromOffset(nextOffset))
  }

  function endDrag() {
    if (!dragRef.current) {
      return
    }

    const snappedIndex = indexFromOffset(dragOffsetRef.current ?? baseOffset)
    const finalValue = options[snappedIndex].value
    emitIndex(snappedIndex)
    onSwipeEnd?.({
      column: label,
      from: gestureStartValueRef.current,
      to: finalValue,
    })
    updateDragOffset(null)
    dragRef.current = null
  }

  const virtualIndex = -offset / ITEM_HEIGHT
  const selectedIndex = indexFromOffset(offset)

  return (
    <div className="wheel-column">
      <div
        className="wheel-hitbox"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        aria-label={label}
      >
        <div className="wheel-cylinder">
          {options.map((option, index) => {
            const relative = index - virtualIndex
            if (Math.abs(relative) > 7) {
              return null
            }

            const angle = relative * ANGLE_STEP
            const opacity = Math.max(0.1, 1 - Math.abs(relative) * 0.22)
            const scale = Math.max(0.78, 1 - Math.abs(relative) * 0.08)
            const selected = selectedIndex === index

            return (
              <div
                key={`${label}-${option.value}`}
                className={`wheel-item${selected ? ' is-selected' : ''}`}
                style={{
                  opacity,
                  transform: `translate(-50%, -50%) rotateX(${angle}deg) translateZ(${WHEEL_RADIUS}px) scale(${scale})`,
                }}
              >
                {option.label}
              </div>
            )
          })}
        </div>
        <div className="wheel-mask wheel-mask-top" />
        <div className="wheel-mask wheel-mask-bottom" />
        <div className="wheel-selection-band" />
      </div>
      <div className="wheel-column-label">{label}</div>
    </div>
  )
}

export function DateWheelPicker({
  minYear,
  maxYear,
  value,
  onChange,
  onSwipeEnd,
}: DateWheelPickerProps) {
  const yearOptions: WheelOption[] = []
  for (let year = minYear; year <= maxYear; year += 1) {
    yearOptions.push({ value: year, label: String(year) })
  }

  const monthOptions: WheelOption[] = MONTH_LABELS_IT.map((label, index) => ({
    value: index + 1,
    label: label.slice(0, 3).toUpperCase(),
  }))

  const totalDays = daysInMonth(value.year, value.month)
  const dayOptions: WheelOption[] = []
  for (let day = 1; day <= totalDays; day += 1) {
    dayOptions.push({
      value: day,
      label: String(day).padStart(2, '0'),
    })
  }

  function updateYear(year: number) {
    const nextDay = Math.min(value.day, daysInMonth(year, value.month))
    onChange({ year, month: value.month, day: nextDay })
  }

  function updateMonth(month: number) {
    const nextDay = Math.min(value.day, daysInMonth(value.year, month))
    onChange({ year: value.year, month, day: nextDay })
  }

  function updateDay(day: number) {
    onChange({ year: value.year, month: value.month, day })
  }

  return (
    <div className="date-wheel-picker">
      <WheelColumn
        label="ANNO"
        options={yearOptions}
        value={value.year}
        onChange={updateYear}
        onSwipeEnd={onSwipeEnd}
      />
      <WheelColumn
        label="MESE"
        options={monthOptions}
        value={value.month}
        onChange={updateMonth}
        onSwipeEnd={onSwipeEnd}
      />
      <WheelColumn
        label="GIORNO"
        options={dayOptions}
        value={value.day}
        onChange={updateDay}
        onSwipeEnd={onSwipeEnd}
      />
    </div>
  )
}
