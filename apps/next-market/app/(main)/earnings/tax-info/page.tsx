'use client'

/**
 * Tax Information — 1099-K Collection
 *
 * Placeholder page for collecting tax information from sellers
 * approaching or exceeding the $600 federal 1099-K threshold.
 * Will later integrate with a third-party tax info collection system.
 */

import Link from 'next/link'
import { useAuth } from '../../../../lib/useAuth'
import styles from './page.module.css'

export default function TaxInfoPage() {
  const { isAuthenticated, loading: authLoading } = useAuth()

  if (authLoading) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  }

  if (!isAuthenticated) {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2>Sign in to manage tax information</h2>
        <Link href="/login?returnTo=/earnings/tax-info" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link>
      </div>
    )
  }

  return (
    <div className="container-sm">
      <Link href="/earnings" className={styles.backLink}>← Back to Earnings</Link>

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Tax Information</h1>
      </div>

      <div className={styles.infoCard}>
        <div className={styles.infoIcon}>📋</div>
        <h2 className={styles.infoHeading}>1099-K Tax Reporting</h2>
        <p className={styles.infoText}>
          Federal law requires CasaGrown to report seller earnings that exceed <strong>$600</strong> per
          calendar year. To ensure accurate reporting, we need to collect your tax information.
        </p>
      </div>

      <div className={styles.statusCard}>
        <h3 className={styles.statusTitle}>What you&apos;ll need</h3>
        <ul className={styles.checklist}>
          <li>Legal full name (as it appears on tax returns)</li>
          <li>Social Security Number (SSN) or EIN</li>
          <li>Current mailing address</li>
          <li>Date of birth</li>
        </ul>
      </div>

      <div className={styles.comingSoon}>
        <div className={styles.comingSoonIcon}>🔒</div>
        <h3>Secure Tax Form Coming Soon</h3>
        <p>
          We&apos;re integrating with a secure third-party provider to safely collect and store your
          tax information. You&apos;ll be notified when this form is available.
        </p>
        <p className={styles.comingSoonNote}>
          Your information will be encrypted and handled in compliance with IRS regulations.
        </p>
      </div>

      <div style={{ height: 40 }} />
    </div>
  )
}
