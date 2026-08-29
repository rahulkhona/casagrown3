'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { NativeBridge } from '../lib/nativeBridge'
import styles from './CameraCapture.module.css'

export interface CaptureMetadata {
  timestamp: string
  latitude?: number
  longitude?: number
  accuracy?: number
}

export interface CaptureResult {
  file: File
  meta: CaptureMetadata
}

interface CameraCaptureProps {
  /** Called with the captured File + metadata. The consumer handles upload. */
  onCapture: (result: CaptureResult) => void
  /** Called when the user cancels / closes. */
  onClose: () => void
  /** Preferred facing mode. Default 'environment' (rear). */
  facingMode?: 'user' | 'environment'
  /** If true, crop to square (for avatars). Default false. */
  cropSquare?: boolean
  /** Show a crop guide overlay: 'banner' for wide banner shape. */
  cropGuide?: 'banner' | 'square'
  /** If true, keep camera running after capture for multiple photos. Default false. */
  multiCapture?: boolean
  /** If true, burn timestamp + GPS location onto the captured photo. Only use for delivery proofs. Default false. */
  stampPhoto?: boolean
  /** Label for capture button. Default '📸 Capture'. */
  captureLabel?: string
  /** Label for close button. Default '✕ Cancel'. */
  closeLabel?: string
  /** Callback for skipping photo entirely without backing out of enclosing view */
  onSkip?: () => void
  /** Label for skip button */
  skipLabel?: string
}

export default function CameraCapture({
  onCapture,
  onClose,
  onSkip,
  facingMode = 'environment',
  cropSquare = false,
  cropGuide,
  multiCapture = false,
  stampPhoto = false,
  captureLabel = '📸 Capture',
  closeLabel = '✕ Cancel',
  skipLabel = 'Skip',
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [activeCameraIdx, setActiveCameraIdx] = useState(0)
  const [geoPosition, setGeoPosition] = useState<GeolocationPosition | null>(null)
  const [useFileFallback, setUseFileFallback] = useState(false)

  const startStream = useCallback(async (deviceId?: string) => {
    // navigator.mediaDevices is only available in secure contexts (HTTPS or localhost).
    // On LAN IP over HTTP, fall back to file-input picker.
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('INSECURE_CONTEXT')
    }

    // Stop any existing stream
    streamRef.current?.getTracks().forEach(t => t.stop())

    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } }
        : { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } }
    }
    const ms = await navigator.mediaDevices.getUserMedia(constraints)
    streamRef.current = ms
    if (videoRef.current) {
      videoRef.current.srcObject = ms
      const playPromise = videoRef.current.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => { /* ignore AbortError when stream replaced */ })
      }
    }
    return ms
  }, [facingMode])

  // Start camera and enumerate devices on mount; also request geolocation
  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        if (NativeBridge.isNative && NativeBridge.supportsCamera) {
          const status = await NativeBridge.requestCameraPermission()
          if (status !== 'granted') {
            throw new Error('Permission denied')
          }
        }
        const ms = await startStream()
        if (!mounted) { ms.getTracks().forEach(t => t.stop()); return }

        // Enumerate cameras after permission is granted
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(d => d.kind === 'videoinput')
        if (mounted) {
          setCameras(videoDevices)
          const activeId = ms.getVideoTracks()[0]?.getSettings()?.deviceId
          const idx = videoDevices.findIndex(d => d.deviceId === activeId)
          setActiveCameraIdx(idx >= 0 ? idx : 0)
        }
      } catch (err: any) {
        // AbortError happens when React StrictMode double-mounts — ignore it
        if (err?.name === 'AbortError') return
        // Insecure context (LAN IP over HTTP) — show file picker fallback
        if (err?.message === 'INSECURE_CONTEXT') {
          if (mounted) setUseFileFallback(true)
          return
        }
        // Other errors (permission denied, no camera) — close
        console.error('Camera init error:', err)
        if (mounted) onClose()
      }
    }
    init()

    // Request geolocation (continuous watch for fresh coordinates)
    let watchId: number | undefined
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => { if (mounted) setGeoPosition(pos) },
        () => { /* geo denied — continue without it */ },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [captureCount, setCaptureCount] = useState(0)
  const [flash, setFlash] = useState(false)

  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Ensure dimensions, with natural / client fallbacks
    const vWidth = video.videoWidth || video.clientWidth || 640
    const vHeight = video.videoHeight || video.clientHeight || 480

    // Set canvas size
    let w = vWidth
    let h = vHeight
    if (cropSquare) {
      const size = Math.min(w, h)
      w = size
      h = size
    }
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.error('Cannot get canvas context')
      return
    }

    // Draw video frame
    if (cropSquare) {
      const size = Math.min(vWidth, vHeight)
      const sx = (vWidth - size) / 2
      const sy = (vHeight - size) / 2
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    } else {
      ctx.drawImage(video, 0, 0, w, h)
    }

    // Build metadata
    const now = new Date()
    const meta: CaptureMetadata = { timestamp: now.toISOString() }
    if (geoPosition) {
      meta.latitude = geoPosition.coords.latitude
      meta.longitude = geoPosition.coords.longitude
      meta.accuracy = geoPosition.coords.accuracy
    }

    // Burn timestamp + location text onto the photo (delivery proof only)
    if (stampPhoto) {
      const fontSize = Math.max(16, Math.round(w / 35))
      ctx.font = `bold ${fontSize}px monospace`
      const stampLines: string[] = [
        `Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
      ]
      if (meta.latitude != null) {
        stampLines.push(`Loc: ${meta.latitude.toFixed(5)}, ${meta.longitude!.toFixed(5)} +/-${Math.round(meta.accuracy || 0)}m`)
      } else {
        stampLines.push('Loc: GPS unavailable')
      }
      const lh = fontSize * 1.5
      const pad = fontSize * 0.7
      const boxH = stampLines.length * lh + pad * 2
      const boxY = h - boxH

      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
      ctx.fillRect(0, boxY, w, boxH)
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'top'
      stampLines.forEach((line, i) => {
        ctx.fillText(line, pad, boxY + pad + i * lh)
      })
    }

    const processBlob = (blob: Blob | null) => {
      let finalBlob = blob
      if (!finalBlob) {
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
          const byteString = atob(dataUrl.split(',')[1] || '')
          const ab = new ArrayBuffer(byteString.length)
          const ia = new Uint8Array(ab)
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i)
          }
          finalBlob = new Blob([ab], { type: 'image/jpeg' })
        } catch (e) {
          console.error('Fallback blob conversion failed:', e)
        }
      }
      if (!finalBlob) return

      const file = new File([finalBlob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (!multiCapture) {
        streamRef.current?.getTracks().forEach((t) => t.stop())
      }
      onCapture({ file, meta })
      setCaptureCount((c) => c + 1)
      setFlash(true)
      setTimeout(() => setFlash(false), 200)
    }

    try {
      canvas.toBlob(processBlob, 'image/jpeg', 0.9)
    } catch {
      processBlob(null)
    }
  }

  const handleSwitchCamera = async (idx: number) => {
    setActiveCameraIdx(idx)
    await startStream(cameras[idx]!.deviceId)
  }

  const handleClose = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    onClose()
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {useFileFallback ? (
          /* File-input fallback for insecure contexts (LAN IP over HTTP) */
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: '#fff', marginBottom: 16, fontSize: 14, lineHeight: 1.5 }}>
              📷 Camera requires HTTPS. Use your gallery instead:
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const meta: CaptureMetadata = { timestamp: new Date().toISOString() }
                if (geoPosition) {
                  meta.latitude = geoPosition.coords.latitude
                  meta.longitude = geoPosition.coords.longitude
                  meta.accuracy = geoPosition.coords.accuracy
                }
                onCapture({ file, meta })
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: 'var(--green-500, #22c55e)', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}
            >
              📸 Take Photo / Choose from Gallery
            </button>
            <div style={{ marginTop: 12 }}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
                {closeLabel}
              </button>
            </div>
          </div>
        ) : (
        <>
        <div className={styles.videoWrap}>
          {cameras.length > 1 && (
            <div className={styles.topBar}>
              <select
                className={styles.cameraSelect}
                value={activeCameraIdx}
                onChange={(e) => handleSwitchCamera(Number(e.target.value))}
                aria-label="Select camera"
              >
                {cameras.map((cam, i) => (
                  <option key={cam.deviceId || i} value={i}>
                    {cam.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
          {cropGuide === 'banner' && (
            <div className={styles.cropOverlay}>
              <div className={styles.cropDarkTop} />
              <div className={styles.cropClear}>
                <span className={styles.cropLabel}>Banner area</span>
              </div>
              <div className={styles.cropDarkBottom} />
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Flash overlay */}
          {flash && (
            <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.7, pointerEvents: 'none', transition: 'opacity 0.2s' }} />
          )}

          {/* Photo count badge (multi-capture) */}
          {multiCapture && captureCount > 0 && (
            <div style={{ position: 'absolute', top: 8, right: 8, background: 'var(--green-500, #22c55e)', color: '#fff', fontWeight: 700, fontSize: 14, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {captureCount}
            </div>
          )}

          {/* Geo indicator (only for delivery proof stamping) */}
          {stampPhoto && (
            <div className={styles.geoIndicator}>
              {geoPosition
                ? <span className={styles.geoOn}>📍 GPS locked</span>
                : <span className={styles.geoOff}>📍 Acquiring GPS...</span>
              }
            </div>
          )}
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={handleClose}
            data-testid="close-camera-btn"
            aria-label={closeLabel}
          >
            {multiCapture && captureCount > 0 ? `✓ Done (${captureCount})` : closeLabel}
          </button>

          {onSkip && (!multiCapture || captureCount === 0) && (
            <button 
              type="button" 
              className={styles.skipBtn} 
              onClick={() => {
                streamRef.current?.getTracks().forEach(t => t.stop())
                onSkip()
              }}
            >
              {skipLabel}
            </button>
          )}

          <button
            type="button"
            className={styles.captureBtn}
            onClick={handleCapture}
            data-testid="capture-btn"
            aria-label={captureLabel}
          >
            {captureLabel}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
