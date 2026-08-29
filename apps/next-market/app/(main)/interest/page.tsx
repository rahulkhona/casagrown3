'use client'

import React, { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function InterestRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const params = searchParams?.toString() || ''
    const target = params ? `/market?${params}` : '/market'
    if (router && typeof router.replace === 'function') {
      router.replace(target)
    } else if (router && typeof router.push === 'function') {
      router.push(target)
    }
  }, [router, searchParams])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 space-y-3">
      <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-xs font-medium">Redirecting to Produce Market...</p>
    </div>
  )
}

export default function InterestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <InterestRedirect />
    </Suspense>
  )
}
