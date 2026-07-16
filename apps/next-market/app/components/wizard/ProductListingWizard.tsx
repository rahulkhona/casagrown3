'use client'

import React, { useState, useEffect, useRef } from 'react'
import { WizardProvider, useWizard } from './WizardContext'
import styles from './wizard.module.css'
import { createClient } from '../../../lib/supabase'
import { trackEvent, trackStepTiming, trackFieldInteract, resetSessionId } from '../../../lib/crm-analytics'

import Step1Basics from './Step1Basics'
import Step2Fulfillment from './Step2Fulfillment'
import Step3Pricing from './Step3Pricing'
import Step4Verification from './Step4Verification'
import Step5Publish from './Step5Publish'
import Step6Success from './Step6Success'
import { useErrorToast } from '../ErrorToast'

function WizardRouter() {
  const { state, updateState, saveProductToDatabase, isAuthenticated, isAuthLoading, pageSlug } = useWizard()
  const { showError } = useErrorToast()

  const allSteps = [
    { id: 1, label: 'Basics' },
    { id: 2, label: 'Fulfillment' },
    { id: 3, label: 'Pricing' },
    { id: 4, label: 'Verify' },
    { id: 5, label: 'Publish' },
  ]

  const stepEnteredAt = useRef(Date.now())
  const prevStepRef = useRef(state.currentStep)
  const hasAbandoned = useRef(false)
  const currentStepRef = useRef(state.currentStep)
  const stateRef = useRef(state)

  useEffect(() => {
    resetSessionId(pageSlug)
  }, [])

  useEffect(() => {
    currentStepRef.current = state.currentStep
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const duration = (Date.now() - stepEnteredAt.current) / 1000
    const prevStepName = allSteps.find(s => s.id === prevStepRef.current)?.label?.toLowerCase() || 'unknown'
    if (duration > 1) {
      trackStepTiming(pageSlug, prevStepRef.current, prevStepName, duration)
    }
    prevStepRef.current = state.currentStep
    stepEnteredAt.current = Date.now()

    const stepName = allSteps.find(s => s.id === state.currentStep)?.label?.toLowerCase() || (state.currentStep === 6 ? 'success' : 'unknown')
    trackEvent('wizard_step', pageSlug, { step_index: state.currentStep, step_name: stepName })
  }, [state.currentStep])
  
  const steps = allSteps.filter(s => !(s.id === 4 && (isAuthenticated || state.isExistingUser)))

  return (
    <div className={styles.container}>
      {/* Step Numbers Header - hide on success step */}
      {state.currentStep < 6 && (
        <div className={styles.header} style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', width: '100%', overflow: 'hidden' }}>
          <div style={{ flex: 1, minWidth: 0, overflowX: 'auto', paddingBottom: 4, marginRight: 4, WebkitOverflowScrolling: 'touch' }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 380 }}>
              {steps.map((step, index) => {
                const isActive = state.currentStep === step.id
                const isPast = state.currentStep > step.id
                return (
                  <React.Fragment key={step.id}>
                    <div 
                      onClick={() => updateState({ currentStep: step.id })}
                      style={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, 
                        cursor: 'pointer', opacity: isActive || isPast ? 1 : 0.5 
                      }}
                    >
                      <div style={{ 
                        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isActive ? '#16a34a' : isPast ? '#dcfce7' : '#f3f4f6',
                        color: isActive ? '#ffffff' : isPast ? '#16a34a' : '#9ca3af',
                        fontWeight: 700, fontSize: 13, border: isActive || isPast ? 'none' : '1px solid #d1d5db'
                      }}>
                        {isPast ? '✓' : index + 1}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#111827' : '#6b7280' }}>
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: isPast ? '#16a34a' : '#e5e7eb', margin: '0 8px', alignSelf: 'flex-start', marginTop: 13 }} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {(isAuthenticated || state.isExistingUser || !isAuthLoading) && (
            <button 
              onClick={async () => {
                const btn = document.getElementById('save-draft-btn')
                if (btn) btn.innerText = 'Saving...'
                try {
                  const draftId = await saveProductToDatabase(true)
                  if (draftId) {
                    window.location.href = `/my-booth/products/new?edit=${draftId}`
                  }
                } catch (err: any) {
                  showError('Failed to save draft: ' + err.message)
                  if (btn) btn.innerText = 'Save Draft'
                }
              }}
              id="save-draft-btn"
              style={{ 
                padding: '6px 12px', background: 'white', border: '1px solid #d1d5db', 
                borderRadius: 16, fontSize: 12, fontWeight: 600, color: '#4b5563', cursor: 'pointer',
                marginLeft: 16, flexShrink: 0
              }}
            >
              Save Draft
            </button>
          )}
        </div>
      )}


      {/* Render Current Step */}
      <div className={styles.content}>
        {state.currentStep === 1 && <Step1Basics />}
        {state.currentStep === 2 && <Step2Fulfillment />}
        {state.currentStep === 3 && <Step3Pricing />}
        {state.currentStep === 4 && <Step4Verification />}
        {state.currentStep === 5 && <Step5Publish />}
        {state.currentStep === 6 && <Step6Success />}
      </div>
    </div>
  )
}

export default function ProductListingWizard({ pageSlug = '/create-listing' }: { pageSlug?: string }) {
  return (
    <WizardProvider pageSlug={pageSlug}>
      <WizardRouter />
    </WizardProvider>
  )
}
