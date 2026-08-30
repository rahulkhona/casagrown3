'use server'

import crypto from 'crypto'

export async function generateSignedQrUrl(orderId: string, passcode: string) {
  const secret = process.env.QR_SECRET || 'default-secret-do-not-use-in-prod'
  const exp = Date.now() + 15 * 60 * 1000 // 15 mins
  const payload = `${orderId}:${passcode}:${exp}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  
  return `/orders/${orderId}/pickup?passcode=${passcode}&exp=${exp}&sig=${hmac}`
}
