import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  MathUtils,
  MeshBasicMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import type { Mesh } from 'three'
import { clamp } from '../lib/date-utils'
import type { ImageRecord, TextureWindowSettings } from '../types'

type WebGLCarouselProps = {
  images: ImageRecord[]
  activeIndex: number
  onIndexChange: (index: number) => void
  onSwipeEnd?: (details: { fromIndex: number; toIndex: number }) => void
  onLoadingStateChange?: (isLoading: boolean) => void
  textureWindow: TextureWindowSettings
}

type CachedTextureEntry = {
  texture: Texture
  size: Size2D
  source: string
}

type CarouselSceneProps = {
  images: ImageRecord[]
  focusIndex: number
  textureCache: Map<number, CachedTextureEntry>
}

const FRAME_WIDTH = 2.35
const FRAME_HEIGHT = 4.17
const FRAME_ASPECT = FRAME_WIDTH / FRAME_HEIGHT
const FALLBACK_SIZE = { width: FRAME_WIDTH, height: FRAME_HEIGHT }
type Size2D = { width: number; height: number }

function inferTextureSize(texture: Texture): Size2D {
  const source = texture.image as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    | undefined

  const width = source?.width ?? source?.videoWidth ?? 1
  const height = source?.height ?? source?.videoHeight ?? 1
  return { width, height }
}

function textureToPlaneSize(texture: Texture): Size2D {
  const { width, height } = inferTextureSize(texture)
  const safeAspect = width > 0 && height > 0 ? width / height : FRAME_ASPECT

  if (safeAspect >= FRAME_ASPECT) {
    return {
      width: FRAME_WIDTH,
      height: FRAME_WIDTH / safeAspect,
    }
  }

  return {
    width: FRAME_HEIGHT * safeAspect,
    height: FRAME_HEIGHT,
  }
}

function computeWindowBounds(
  totalImages: number,
  centerIndex: number,
  settings: TextureWindowSettings,
) {
  const clampedCenter = clamp(centerIndex, 0, Math.max(totalImages - 1, 0))
  if (totalImages <= 0) {
    return { start: 0, end: -1 }
  }

  const targetResident = Math.min(totalImages, Math.max(1, settings.maxResident))
  let start = Math.max(0, clampedCenter - settings.prefetchBefore)
  let end = Math.min(totalImages - 1, clampedCenter + settings.prefetchAfter)

  while (end - start + 1 > targetResident) {
    const leftDistance = clampedCenter - start
    const rightDistance = end - clampedCenter
    if (leftDistance > rightDistance) {
      start += 1
    } else {
      end -= 1
    }
  }

  while (end - start + 1 < targetResident) {
    if (start > 0) {
      start -= 1
    }
    if (end - start + 1 >= targetResident) {
      break
    }
    if (end < totalImages - 1) {
      end += 1
    }
    if (start === 0 && end === totalImages - 1) {
      break
    }
  }

  return { start, end }
}

function buildLoadOrder(start: number, end: number, center: number): number[] {
  const order: number[] = []
  for (
    let distance = 0;
    center - distance >= start || center + distance <= end;
    distance += 1
  ) {
    const left = center - distance
    if (left >= start && left <= end) {
      order.push(left)
    }

    const right = center + distance
    if (distance !== 0 && right >= start && right <= end) {
      order.push(right)
    }
  }
  return order
}

function disposeTextureEntry(entry: CachedTextureEntry) {
  entry.texture.dispose()
}

function CarouselScene({ images, focusIndex, textureCache }: CarouselSceneProps) {
  const meshRefs = useRef<Array<Mesh | null>>([])
  const targetFocusRef = useRef(focusIndex)
  const smoothFocusRef = useRef(focusIndex)

  useEffect(() => {
    targetFocusRef.current = focusIndex
  }, [focusIndex])

  useFrame((_, delta) => {
    smoothFocusRef.current = MathUtils.damp(
      smoothFocusRef.current,
      targetFocusRef.current,
      10,
      delta,
    )

    for (let index = 0; index < meshRefs.current.length; index += 1) {
      const mesh = meshRefs.current[index]
      if (!mesh) {
        continue
      }

      const cached = textureCache.get(index)
      const planeSize = cached?.size ?? FALLBACK_SIZE
      const deltaIndex = index - smoothFocusRef.current
      const absDistance = Math.abs(deltaIndex)
      const distanceScale = Math.max(0.66, 1 - absDistance * 0.09)

      mesh.position.x = deltaIndex * 2.45
      mesh.position.y = Math.sin((index + smoothFocusRef.current) * 0.15) * 0.03
      mesh.position.z = -0.4 - absDistance * 1.4
      mesh.rotation.y = MathUtils.clamp(-deltaIndex * 0.14, -0.35, 0.35)
      mesh.scale.set(
        planeSize.width * distanceScale,
        planeSize.height * distanceScale,
        1,
      )
      mesh.visible = absDistance < 6.8

      const material = mesh.material as MeshBasicMaterial
      material.opacity = Math.max(0.08, 1 - absDistance * 0.18)
    }
  })

  return (
    <>
      <color attach="background" args={['#0b0f16']} />
      <group position={[0, 0.08, 0]}>
        {images.map((image, index) => {
          const cached = textureCache.get(index)
          return (
            <mesh
              key={image.id}
              ref={(element) => {
                meshRefs.current[index] = element
              }}
            >
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial
                map={cached?.texture ?? null}
                color={cached ? '#ffffff' : '#1d2a3b'}
                transparent
                opacity={1}
                toneMapped={false}
              />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

export function WebGLCarousel({
  images,
  activeIndex,
  onIndexChange,
  onSwipeEnd,
  onLoadingStateChange,
  textureWindow,
}: WebGLCarouselProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startIndex: number
  } | null>(null)
  const draggingRef = useRef(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  const textureLoaderRef = useRef(new TextureLoader())
  const textureCacheRef = useRef<Map<number, CachedTextureEntry>>(new Map())
  const loadingIndicesRef = useRef<Set<number>>(new Set())
  const generationRef = useRef(0)
  const imagesRef = useRef(images)
  const selectedIndexRef = useRef(0)
  const textureWindowRef = useRef(textureWindow)
  const [textureCache, setTextureCache] = useState<Map<number, CachedTextureEntry>>(
    () => new Map(),
  )

  const interactiveIndex = dragIndex ?? activeIndex
  const selectedIndex = clamp(
    Math.round(interactiveIndex),
    0,
    Math.max(images.length - 1, 0),
  )

  useEffect(() => {
    textureCacheRef.current = textureCache
  }, [textureCache])

  const updateCache = useCallback(
    (mutator: (next: Map<number, CachedTextureEntry>) => boolean) => {
      setTextureCache((previous) => {
        const next = new Map(previous)
        const changed = mutator(next)
        if (!changed) {
          return previous
        }
        textureCacheRef.current = next
        return next
      })
    },
    [],
  )

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  useEffect(() => {
    textureWindowRef.current = textureWindow
  }, [textureWindow])

  useEffect(() => {
    generationRef.current += 1
    loadingIndicesRef.current.clear()
    updateCache((next) => {
      if (next.size === 0) {
        return false
      }
      for (const entry of next.values()) {
        disposeTextureEntry(entry)
      }
      next.clear()
      return true
    })
  }, [images, updateCache])

  useEffect(() => {
    const loadingSet = loadingIndicesRef.current
    return () => {
      generationRef.current += 1
      loadingSet.clear()
      const cacheSnapshot = textureCacheRef.current
      for (const entry of cacheSnapshot.values()) {
        disposeTextureEntry(entry)
      }
      cacheSnapshot.clear()
    }
  }, [])

  const pruneCacheToWindow = useCallback(
    (start: number, end: number) => {
      updateCache((next) => {
        let changed = false
        for (const [index, entry] of next.entries()) {
          if (index < start || index > end) {
            disposeTextureEntry(entry)
            next.delete(index)
            changed = true
          }
        }
        return changed
      })
    },
    [updateCache],
  )

  useEffect(() => {
    if (images.length === 0) {
      return
    }

    const { start, end } = computeWindowBounds(images.length, selectedIndex, textureWindow)
    pruneCacheToWindow(start, end)

    const loadOrder = buildLoadOrder(start, end, selectedIndex)
    const currentGeneration = generationRef.current

    for (const index of loadOrder) {
      if (
        textureCacheRef.current.has(index) ||
        loadingIndicesRef.current.has(index)
      ) {
        continue
      }

      const imageFile = images[index]?.file
      if (!imageFile) {
        continue
      }

      loadingIndicesRef.current.add(index)
      textureLoaderRef.current.load(
        imageFile,
        (texture) => {
          loadingIndicesRef.current.delete(index)

          if (generationRef.current !== currentGeneration) {
            texture.dispose()
            return
          }

          const currentFile = imagesRef.current[index]?.file
          if (currentFile !== imageFile) {
            texture.dispose()
            return
          }

          texture.colorSpace = SRGBColorSpace
          texture.needsUpdate = true

          const currentBounds = computeWindowBounds(
            imagesRef.current.length,
            selectedIndexRef.current,
            textureWindowRef.current,
          )

          updateCache((next) => {
            const existing = next.get(index)
            if (existing && existing.source === imageFile) {
              texture.dispose()
              return false
            }

            if (existing) {
              disposeTextureEntry(existing)
            }

            next.set(index, {
              texture,
              size: textureToPlaneSize(texture),
              source: imageFile,
            })

            for (const [cacheIndex, entry] of next.entries()) {
              if (cacheIndex < currentBounds.start || cacheIndex > currentBounds.end) {
                disposeTextureEntry(entry)
                next.delete(cacheIndex)
              }
            }

            return true
          })
        },
        undefined,
        () => {
          loadingIndicesRef.current.delete(index)
        },
      )
    }
  }, [images, pruneCacheToWindow, selectedIndex, textureWindow, updateCache])

  useEffect(() => {
    if (images.length === 0) {
      onLoadingStateChange?.(false)
      return
    }

    onLoadingStateChange?.(!textureCache.has(selectedIndex))
  }, [images.length, onLoadingStateChange, selectedIndex, textureCache])

  function updateDragIndex(nextIndex: number | null) {
    dragIndexRef.current = nextIndex
    setDragIndex(nextIndex)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (images.length === 0) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startIndex: dragIndexRef.current ?? activeIndex,
    }
    draggingRef.current = true
    updateDragIndex(dragRef.current.startIndex)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    const width = Math.max(1, viewportRef.current?.clientWidth ?? 1)
    const distancePx = event.clientX - drag.startX
    const slideDelta = (distancePx / width) * 2.2
    const nextIndex = clamp(drag.startIndex - slideDelta, 0, images.length - 1)
    updateDragIndex(nextIndex)
  }

  function endDrag() {
    if (!draggingRef.current || images.length === 0) {
      return
    }

    draggingRef.current = false
    const initialIndex = Math.round(dragRef.current?.startIndex ?? activeIndex)
    dragRef.current = null
    const snappedIndex = clamp(
      Math.round(dragIndexRef.current ?? activeIndex),
      0,
      images.length - 1,
    )
    updateDragIndex(null)
    onSwipeEnd?.({
      fromIndex: initialIndex,
      toIndex: snappedIndex,
    })
    onIndexChange(snappedIndex)
  }

  return (
    <div className="carousel-shell" ref={viewportRef}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov: 43, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false }}
      >
        <CarouselScene
          images={images}
          focusIndex={interactiveIndex}
          textureCache={textureCache}
        />
      </Canvas>

      <div
        className="carousel-gesture-layer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      />

      <div className="carousel-overlay">
        <div className="carousel-counter">
          {selectedIndex + 1} / {images.length}
        </div>
        <div className="carousel-title">{images[selectedIndex]?.title ?? ''}</div>
      </div>
    </div>
  )
}
