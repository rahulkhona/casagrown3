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
  /** Called when the user bypasses cropping */
  onSkipCrop?: () => void
}

export default function ImageCropper({ src, aspectRatio = 3.5, circleGuide = false, onCrop, onCancel, onSkipCrop }: ImageCropperProps) {
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

    // Scale so image covers the crop area with a slight comfortable 15% zoom for panning
    const fillScale = Math.max(cw / iw, ch / ih)
    setScale(fillScale * 1.15)
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
    const container = containerRef.current
    if (!container) return
    
    const cw = container.offsetWidth
    const ch = container.offsetHeight
    const dw = imgSize.w * scale
    const dh = imgSize.h * scale

    // Constrain panning so photo always fills the crop area without exposing empty borders
    const maxBoundX = Math.max(0, (dw - cw) / 2)
    const maxBoundY = Math.max(0, (dh - ch) / 2)

    let candidateX = dragStart.current.posX + (e.clientX - dragStart.current.x)
    let candidateY = dragStart.current.posY + (e.clientY - dragStart.current.y)

    candidateX = Math.min(Math.max(candidateX, -maxBoundX), maxBoundX)
    candidateY = Math.min(Math.max(candidateY, -maxBoundY), maxBoundY)

    setPosition({ x: candidateX, y: candidateY })
  }, [dragging, scale, imgSize])

  const handlePointerUp = useCallback(() => setDragging(false), [])

  // Zoom
  const zoom = useCallback((delta: number) => {
    setScale(prev => {
      const container = containerRef.current
      const fillScale = (container && imgSize.w && imgSize.h)
        ? Math.max(container.offsetWidth / imgSize.w, container.offsetHeight / imgSize.h)
        : 0.05
      const maxScale = (container && imgSize.w && imgSize.h) ? fillScale * 4 : 5
        
      return Math.max(fillScale, Math.min(maxScale, prev + delta))
    })
  }, [imgSize])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    zoom(e.deltaY < 0 ? 0.02 : -0.02)
  }, [zoom])

  // Crop
  const handleCrop = useCallback(() => {
    const container = containerRef.current
    if (!container || !imgSize.w || !imgRef.current) return

    const cw = container.offsetWidth
    const ch = container.offsetHeight
    if (cw === 0 || ch === 0) return

    // Displayed image dimensions
    const dw = imgSize.w * scale
    const dh = imgSize.h * scale

    // Image top-left relative to container in display pixels
    const imgLeft = (cw - dw) / 2 + position.x
    const imgTop = (ch - dh) / 2 + position.y

    const canvas = document.createElement('canvas')
    
    // High-res output
    const outWidth = circleGuide ? 512 : Math.min(1200, Math.max(cw * 2, 600))
    const outHeight = Math.round(outWidth / aspectRatio)

    canvas.width = outWidth
    canvas.height = outHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Clean background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outWidth, outHeight)
    
    // Scale factor from display to output canvas
    const factor = outWidth / cw
    const destX = imgLeft * factor
    const destY = imgTop * factor
    const destW = dw * factor
    const destH = dh * factor

    ctx.drawImage(imgRef.current, destX, destY, destW, destH)

    canvas.toBlob((blob) => {
      if (!blob) return
      onCrop(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }, [imgSize, scale, position, aspectRatio, circleGuide, onCrop])

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Crop Photo</span>
        </div>

        <div className={styles.cropWrapper}>
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

          {!circleGuide && <div className={styles.cropBorder} />}
          {circleGuide && <div className={styles.circleGuide} />}
        </div>
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          {onSkipCrop && (
            <button type="button" className={styles.cancelBtn} onClick={onSkipCrop}>Use Full Image</button>
          )}
          <div className={styles.zoomControls}>
            <button type="button" className={styles.zoomBtn} onClick={() => zoom(-0.05)}>−</button>
            <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
            <button type="button" className={styles.zoomBtn} onClick={() => zoom(0.05)}>+</button>
          </div>
          <button type="button" className={styles.cropBtn} onClick={handleCrop}>✂️ Crop</button>
        </div>
      </div>
    </div>
  )
}
