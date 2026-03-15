'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
  /** Label for capture button. Default '📸 Capture'. */
  captureLabel?: string
  /** Label for close button. Default '✕ Cancel'. */
  closeLabel?: string
}

export default function CameraCapture({
  onCapture,
  onClose,
  facingMode = 'environment',
  cropSquare = false,
  cropGuide,
  multiCapture = false,
  captureLabel = '📸 Capture',
  closeLabel = '✕ Cancel',
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [activeCameraIdx, setActiveCameraIdx] = useState(0)
  const [geoPosition, setGeoPosition] = useState<GeolocationPosition | null>(null)

  const startStream = useCallback(async (deviceId?: string) => {
    // Stop any existing stream
    streamRef.current?.getTracks().forEach(t => t.stop())

    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
    }
    const ms = await navigator.mediaDevices.getUserMedia(constraints)
    streamRef.current = ms
    if (videoRef.current) {
      videoRef.current.srcObject = ms
      videoRef.current.play()
    }
    return ms
  }, [facingMode])

  // Start camera and enumerate devices on mount; also request geolocation
  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
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
      } catch {
        // Camera not accessible — close
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

  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    if (cropSquare) {
      const size = Math.min(video.videoWidth, video.videoHeight)
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')!
      const sx = (video.videoWidth - size) / 2
      const sy = (video.videoHeight - size) / 2
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    } else {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')!.drawImage(video, 0, 0)
    }

    const meta: CaptureMetadata = {
      timestamp: new Date().toISOString(),
    }
    if (geoPosition) {
      meta.latitude = geoPosition.coords.latitude
      meta.longitude = geoPosition.coords.longitude
      meta.accuracy = geoPosition.coords.accuracy
    }

    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (!multiCapture) {
        streamRef.current?.getTracks().forEach(t => t.stop())
      }
      onCapture({ file, meta })
    }, 'image/jpeg', 0.9)
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
        <div className={styles.videoWrap}>
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
          {cropGuide === 'square' && (
            <div className={styles.cropOverlaySquare} />
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Geo indicator */}
          <div className={styles.geoIndicator}>
            {geoPosition
              ? <span className={styles.geoOn}>📍 GPS locked</span>
              : <span className={styles.geoOff}>📍 Acquiring GPS...</span>
            }
          </div>
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.cancelBtn} onClick={handleClose}>
            {closeLabel}
          </button>

          {cameras.length > 1 && (
            <select
              className={styles.cameraSelect}
              value={activeCameraIdx}
              onChange={(e) => handleSwitchCamera(Number(e.target.value))}
            >
              {cameras.map((cam, i) => (
                <option key={cam.deviceId} value={i}>
                  {cam.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}

          <button type="button" className={styles.captureBtn} onClick={handleCapture}>
            {captureLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
