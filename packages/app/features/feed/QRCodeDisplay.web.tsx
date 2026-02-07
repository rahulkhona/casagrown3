/**
 * QR Code Display - Web implementation
 * Uses react-qr-code which renders DOM <svg> elements
 */
import QRCode from 'react-qr-code'

interface QRCodeDisplayProps {
  value: string
  size?: number
}

export function QRCodeDisplay({ value, size = 150 }: QRCodeDisplayProps) {
  return (
    <QRCode
      value={value}
      size={size}
      level="M"
      bgColor="#FFFFFF"
      fgColor="#000000"
    />
  )
}
