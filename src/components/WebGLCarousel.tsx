import { Suspense, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { MathUtils, MeshBasicMaterial, SRGBColorSpace, Texture } from 'three'
import type { Mesh } from 'three'
import { clamp } from '../lib/date-utils'
import type { ImageRecord } from '../types'

type WebGLCarouselProps = {
  images: ImageRecord[]
  activeIndex: number
  onIndexChange: (index: number) => void
  onSwipeEnd?: (details: { fromIndex: number; toIndex: number }) => void
  onLoadingStateChange?: (isLoading: boolean) => void
}

type CarouselSceneProps = {
  images: ImageRecord[]
  focusIndex: number
  onTexturesReady?: () => void
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

function textureToPlaneSize(texture: Texture) {
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

function CarouselScene({ images, focusIndex, onTexturesReady }: CarouselSceneProps) {
  const textures = useTexture(images.map((image) => image.file))
  const meshRefs = useRef<Array<Mesh | null>>([])
  const planeSizesRef = useRef<Array<{ width: number; height: number }>>([])
  const targetFocusRef = useRef(focusIndex)
  const smoothFocusRef = useRef(focusIndex)

  useEffect(() => {
    targetFocusRef.current = focusIndex
  }, [focusIndex])

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
    })
    planeSizesRef.current = textures.map((texture) => textureToPlaneSize(texture))
    onTexturesReady?.()
  }, [onTexturesReady, textures])

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

      const deltaIndex = index - smoothFocusRef.current
      const absDistance = Math.abs(deltaIndex)
      const planeSize = planeSizesRef.current[index] ?? FALLBACK_SIZE
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
        {images.map((image, index) => (
          <mesh
            key={image.id}
            ref={(element) => {
              meshRefs.current[index] = element
            }}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={textures[index]}
              transparent
              opacity={1}
              toneMapped={false}
            />
          </mesh>
        ))}
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
  const hideLoadingTimerRef = useRef<number | null>(null)

  useEffect(() => {
    onLoadingStateChange?.(true)
    return () => {
      if (hideLoadingTimerRef.current) {
        window.clearTimeout(hideLoadingTimerRef.current)
        hideLoadingTimerRef.current = null
      }
    }
  }, [images, onLoadingStateChange])

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

  const interactiveIndex = dragIndex ?? activeIndex
  const selectedIndex = clamp(
    Math.round(interactiveIndex),
    0,
    Math.max(images.length - 1, 0),
  )

  function handleTexturesReady() {
    if (hideLoadingTimerRef.current) {
      window.clearTimeout(hideLoadingTimerRef.current)
      hideLoadingTimerRef.current = null
    }

    hideLoadingTimerRef.current = window.setTimeout(() => {
      onLoadingStateChange?.(false)
    }, 180)
  }

  return (
    <div className="carousel-shell" ref={viewportRef}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov: 43, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <CarouselScene
            images={images}
            focusIndex={interactiveIndex}
            onTexturesReady={handleTexturesReady}
          />
        </Suspense>
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
