import type { ImageRecord } from '../types'

export function findNearestImageIndex(
  images: ImageRecord[],
  targetTimestamp: number,
): number {
  if (images.length === 0) {
    return 0
  }

  if (targetTimestamp <= images[0].timestamp) {
    return 0
  }

  const lastIndex = images.length - 1
  if (targetTimestamp >= images[lastIndex].timestamp) {
    return lastIndex
  }

  let left = 0
  let right = lastIndex

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midValue = images[mid].timestamp

    if (midValue === targetTimestamp) {
      return mid
    }

    if (midValue < targetTimestamp) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  const previousIndex = Math.max(0, right)
  const nextIndex = Math.min(lastIndex, left)
  const previousDistance = Math.abs(images[previousIndex].timestamp - targetTimestamp)
  const nextDistance = Math.abs(images[nextIndex].timestamp - targetTimestamp)

  return nextDistance < previousDistance ? nextIndex : previousIndex
}
