/**
 * WebCameraModal - Webcam capture modal for taking photos and recording videos on web.
 * Uses navigator.mediaDevices.getUserMedia for camera access.
 * Renders via React portal to avoid being clipped by parent overflow.
 * Supports camera device selection for machines with multiple cameras.
 * 
 * Platform: Web only — not imported on native.
 */
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface WebCameraModalProps {
  mode: 'photo' | 'video'
  onCapture: (asset: { uri: string; type: 'image' | 'video'; fileName: string }) => void
  onClose: () => void
}

interface CameraDevice {
  deviceId: string
  label: string
}

function WebCameraModalContent({ mode, onCapture, onClose }: WebCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')

  // Enumerate camera devices
  useEffect(() => {
    async function listCameras() {
      try {
        // Need initial getUserMedia call to get permission, then enumerate
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        tempStream.getTracks().forEach((t) => t.stop())
        
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`,
          }))
        setCameras(videoDevices)
        if (videoDevices.length > 0 && !selectedCameraId) {
          setSelectedCameraId(videoDevices[0]!.deviceId)
        }
      } catch (err) {
        console.error('Error listing cameras:', err)
        setError('Could not access camera. Please ensure camera permissions are granted.')
      }
    }
    listCameras()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Start camera stream when selected camera changes
  useEffect(() => {
    if (!selectedCameraId) return
    let cancelled = false

    async function startCamera() {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      setCameraReady(false)

      try {
        const constraints: MediaStreamConstraints = {
          video: { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: mode === 'video',
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setCameraReady(true)
        }
      } catch (err) {
        console.error('Camera access error:', err)
        if (!cancelled) {
          setError('Could not access this camera. Please try another one.')
        }
      }
    }
    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [selectedCameraId, mode])

  // Recording timer
  useEffect(() => {
    if (!isRecording) return
    const interval = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isRecording])

  const takePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        onCapture({ uri: url, type: 'image', fileName: `photo_${Date.now()}.jpg` })
      },
      'image/jpeg',
      0.85
    )
  }, [onCapture])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return

    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      onCapture({ uri: url, type: 'video', fileName: `video_${Date.now()}.webm` })
    }
    recorder.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
    setRecordingTime(0)
  }, [onCapture])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>
            {mode === 'photo' ? '📷 Take Photo' : '🎥 Record Video'}
          </span>
          <div style={styles.headerRight}>
            {/* Camera selector */}
            {cameras.length > 1 && (
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                style={styles.cameraSelect}
                disabled={isRecording}
              >
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label}
                  </option>
                ))}
              </select>
            )}
            <button onClick={onClose} style={styles.closeBtn} type="button">✕</button>
          </div>
        </div>

        {/* Camera View */}
        <div style={styles.cameraContainer}>
          {error ? (
            <div style={styles.errorContainer}>
              <p style={styles.errorText}>{error}</p>
              <button onClick={onClose} style={styles.actionBtn} type="button">Close</button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={styles.video}
              />
              {!cameraReady && (
                <div style={styles.loading}>Starting camera...</div>
              )}
              {isRecording && (
                <div style={styles.recordingIndicator}>
                  <span style={styles.recordingDot} />
                  <span style={styles.recordingTimeText}>{formatTime(recordingTime)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        {cameraReady && !error && (
          <div style={styles.controls}>
            {mode === 'photo' ? (
              <button onClick={takePhoto} style={styles.captureBtn} type="button" title="Take Photo">
                <div style={styles.captureInnerPhoto} />
              </button>
            ) : isRecording ? (
              <button onClick={stopRecording} style={styles.stopBtn} type="button" title="Stop Recording">
                <div style={styles.stopInner} />
              </button>
            ) : (
              <button onClick={startRecording} style={styles.captureBtn} type="button" title="Start Recording">
                <div style={styles.captureInnerVideo} />
              </button>
            )}
            <span style={styles.hint}>
              {mode === 'photo'
                ? 'Click the button to take a photo'
                : isRecording
                  ? 'Click the square to stop recording'
                  : 'Click the button to start recording'}
            </span>
          </div>
        )}

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

export function WebCameraModal(props: WebCameraModalProps) {
  if (typeof document === 'undefined') return null
  return createPortal(<WebCameraModalContent {...props} />, document.body)
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    width: '90%',
    maxWidth: 640,
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid #333',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: 600,
  },
  cameraSelect: {
    background: '#333',
    color: 'white',
    border: '1px solid #555',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 13,
    cursor: 'pointer',
    maxWidth: 220,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: 22,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 8,
    lineHeight: 1,
  },
  cameraContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
    fontSize: 14,
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: 200,
    padding: 32,
    gap: 16,
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    fontSize: 14,
    margin: 0,
  },
  actionBtn: {
    background: '#333',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '8px 24px',
    cursor: 'pointer',
    fontSize: 14,
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '20px 0 24px',
  },
  captureBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    border: '4px solid white',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  captureInnerPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    backgroundColor: 'white',
  },
  captureInnerVideo: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    backgroundColor: '#EF4444',
  },
  stopBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    border: '4px solid #EF4444',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  stopInner: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  hint: {
    color: '#888',
    fontSize: 12,
  },
  recordingIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: '6px 14px',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingTimeText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'monospace',
  },
}
