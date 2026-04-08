import { Suspense, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { MathUtils, MeshBasicMaterial, SRGBColorSpace } from 'three'
import type { Mesh } from 'three'
import { clamp } from '../lib/date-utils'
import type { ImageRecord } from '../types'

type WebGLCarouselProps = {
  images: ImageRecord[]
  activeIndex: number
  onIndexChange: (index: number) => void
}

type CarouselSceneProps = {
  images: ImageRecord[]
  focusIndex: number
}

function CarouselScene({ images, focusIndex }: CarouselSceneProps) {
  const textures = useTexture(images.map((image) => image.file))
  const meshRefs = useRef<Array<Mesh | null>>([])
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
  }, [textures])

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

      mesh.position.x = deltaIndex * 2.45
      mesh.position.y = Math.sin((index + smoothFocusRef.current) * 0.15) * 0.03
      mesh.position.z = -0.4 - absDistance * 1.4
      mesh.rotation.y = MathUtils.clamp(-deltaIndex * 0.14, -0.35, 0.35)
      mesh.scale.setScalar(Math.max(0.66, 1 - absDistance * 0.09))
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
            <planeGeometry args={[2.35, 4.17]} />
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
    dragRef.current = null
    const snappedIndex = clamp(
      Math.round(dragIndexRef.current ?? activeIndex),
      0,
      images.length - 1,
    )
    updateDragIndex(null)
    onIndexChange(snappedIndex)
  }

  const interactiveIndex = dragIndex ?? activeIndex
  const selectedIndex = clamp(
    Math.round(interactiveIndex),
    0,
    Math.max(images.length - 1, 0),
  )

  return (
    <div className="carousel-shell" ref={viewportRef}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 6], fov: 43, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <CarouselScene images={images} focusIndex={interactiveIndex} />
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
