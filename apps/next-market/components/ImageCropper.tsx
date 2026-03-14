'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './ImageCropper.module.css'

interface ImageCropperProps {
  /** The image source URL (data URL or object URL) */
  src: string
  /** Aspect ratio of the crop area (width / height). E.g. 3.5 for banner, 1 for avatar. */
  aspectRatio?: number
  /** Show a circular guide overlay (for avatar crops) */
  circleGuide?: boolean
  /** Called with the cropped image file */
  onCrop: (file: File) => void
  /** Called when the user cancels */
  onCancel: () => void
}

export default function ImageCropper({ src, aspectRatio = 3.5, circleGuide = false, onCrop, onCancel }: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  // On image load, compute initial scale to COVER the crop area
  const handleImageLoad = useCallback(() => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return

    const cw = container.offsetWidth
    const ch = container.offsetHeight
    const iw = img.naturalWidth
    const ih = img.naturalHeight

    setImgSize({ w: iw, h: ih })
    setContainerSize({ w: cw, h: ch })

    // Scale so image covers the crop area (must fill entire width and height)
    const fillScale = Math.max(cw / iw, ch / ih)
    setScale(fillScale)
    setPosition({ x: 0, y: 0 })
  }, [])

  // Pointer drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [position])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return
    setPosition({
      x: dragStart.current.posX + (e.clientX - dragStart.current.x),
      y: dragStart.current.posY + (e.clientY - dragStart.current.y),
    })
  }, [dragging])

  const handlePointerUp = useCallback(() => setDragging(false), [])

  // Zoom
  const zoom = useCallback((delta: number) => {
    setScale(prev => {
      const next = Math.max(0.05, prev + delta)
      return next
    })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    zoom(e.deltaY < 0 ? 0.02 : -0.02)
  }, [zoom])

  // Crop
  const handleCrop = useCallback(() => {
    const container = containerRef.current
    if (!container || !imgSize.w) return

    const cw = container.offsetWidth
    const ch = container.offsetHeight

    // Displayed image dimensions
    const dw = imgSize.w * scale
    const dh = imgSize.h * scale

    // Image top-left relative to container
    const imgLeft = (cw - dw) / 2 + position.x
    const imgTop = (ch - dh) / 2 + position.y

    // Source rect in original image coords
    const srcX = Math.max(0, -imgLeft / scale)
    const srcY = Math.max(0, -imgTop / scale)
    const srcW = Math.min(imgSize.w - srcX, cw / scale)
    const srcH = Math.min(imgSize.h - srcY, ch / scale)

    const canvas = document.createElement('canvas')
    const outW = Math.min(1400, Math.round(srcW))
    const outH = Math.round(outW / aspectRatio)
    canvas.width = outW
    canvas.height = outH

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(imgRef.current!, srcX, srcY, srcW, srcH, 0, 0, outW, outH)

    canvas.toBlob((blob) => {
      if (!blob) return
      onCrop(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }, [imgSize, scale, position, aspectRatio, onCrop])

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Drag to position · Scroll to zoom</span>
        </div>

        <div
          ref={containerRef}
          className={styles.cropArea}
          style={{ aspectRatio: `${aspectRatio} / 1` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          {/* The image — positioned via left/top, scaled from center */}
          {(() => {
            const cw = containerSize.w || 1
            const ch = containerSize.h || 1
            const dw = imgSize.w * scale
            const dh = imgSize.h * scale
            const left = (cw - dw) / 2 + position.x
            const top = (ch - dh) / 2 + position.y
            return (
              <img
                ref={imgRef}
                src={src}
                alt="Crop"
                className={styles.cropImage}
                style={{
                  width: dw || 'auto',
                  height: dh || 'auto',
                  left: left,
                  top: top,
                  cursor: dragging ? 'grabbing' : 'grab',
                }}
                onLoad={handleImageLoad}
                draggable={false}
              />
            )
          })()}

          {/* Crop border indicators */}
          <div className={styles.cropBorder} />
          {circleGuide && <div className={styles.circleGuide} />}
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <div className={styles.zoomControls}>
            <button type="button" className={styles.zoomBtn} onClick={() => zoom(-0.05)}>−</button>
            <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
            <button type="button" className={styles.zoomBtn} onClick={() => zoom(0.05)}>+</button>
          </div>
          <button type="button" className={styles.cropBtn} onClick={handleCrop}>✂️ Crop & Use</button>
        </div>
      </div>
    </div>
  )
}
