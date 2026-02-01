import { z } from 'zod'

export const EmailSchema = z.string().email({ message: 'auth.validation.invalidEmail' })

export const OtpSchema = z.string()
  .min(6, { message: 'auth.validation.otpLength' })
  .max(6, { message: 'auth.validation.otpLength' })
  .regex(/^\d+$/, { message: 'auth.validation.otpNumeric' })

export type EmailInput = z.infer<typeof EmailSchema>
export type OtpInput = z.infer<typeof OtpSchema>
