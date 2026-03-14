'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarket } from '../../../lib/store'
import { createClient } from '../../../lib/supabase'
import styles from './page.module.css'

// ---------------------------------------------------------------------------
// Terms of Use content — matches the community app's LegalScreen.tsx
// ---------------------------------------------------------------------------

const TERMS_SECTIONS = [
  {
    title: '1. Amendments and Modifications',
    paragraphs: [
      'CasaGrown reserves the right, at its sole discretion, to change, modify, add, or remove portions of these Terms at any time. We will notify you of any material changes by posting the updated Terms on the Platform. Your continued use of the Platform following the posting of changes will mean that you accept and agree to the revisions.',
    ],
  },
  {
    title: '2. Platform Role & Independence',
    paragraphs: [
      'No Resale: CasaGrown is a marketplace facilitator and platform provider. We are not the reseller or retailer of any produce.',
      'Seller Responsibility: Sellers are independent affiliates and are solely responsible for the quality, safety, and compliance of the produce they list.',
    ],
  },
  {
    title: '3. The CasaGrown Points System',
    paragraphs: [
      'Closed-Loop Nature: Points are proprietary and intended for use solely within the CasaGrown ecosystem.',
      'Purchase Limits: To maintain the safety and integrity of the Platform, you may not purchase Points if your balance would exceed $2,000. We also enforce a daily purchase limit of $500.',
      'Processing Fees: We reserve the right to charge purchase processing fees for Point acquisitions below certain thresholds.',
    ],
  },
  {
    title: '4. Earning & Redeeming Points',
    paragraphs: [
      'Redemption Options: We offer various methods for Sellers to redeem Earned Points, which may include gift cards, charitable donations, or 529 account contributions.',
      'Right to Limit or Add: CasaGrown reserves the right to limit, modify, or add new redemption options at any time. Such changes may be made to ensure compliance with evolving state laws, financial regulations, or operational requirements.',
      'State-Specific Restrictions: Redemption options vary by state. In certain states (including CA, NY, FL, GA, and CT), cash redemption of Earned Points is not available.',
    ],
  },
  {
    title: '5. Refunds & Mandatory Cash-Outs',
    paragraphs: [
      'General Refunds: Purchased Points are refundable to the original payment instrument used for purchase. If the original refund window has expired, CasaGrown may, at its discretion, issue a refund via Venmo or a pre-loaded card.',
      'Small Balance Cash-Outs (Jurisdiction Specific): In certain jurisdictions, such as California, if your purchased Points balance falls below a specific statutory threshold (e.g., less than $15), you may be entitled to redeem that balance for cash via Venmo or a gift card upon request. CasaGrown complies with all state-mandated "cash-out" thresholds as they change over time.',
    ],
  },
  {
    title: '6. Payments & Taxes',
    paragraphs: [
      "Agent of Payee: CasaGrown acts as the limited payment collection agent for Sellers. Receipt of Points/funds by CasaGrown satisfies the Buyer's debt to the Seller.",
      'Dispute Rights: CasaGrown reserves the right to hold or return Points to a Buyer in the event of a delivery dispute.',
      'Tax Reporting: CasaGrown will issue a Form 1099 to any Seller exceeding $600 in annual sales.',
      'Sales Tax: We calculate and collect sales tax on behalf of Sellers in compliance with applicable state marketplace facilitator laws.',
    ],
  },
  {
    title: '7. Dispute Resolution & Point Release',
    paragraphs: [
      'Confirmation Window: Upon delivery of produce, the Buyer has a four (4) hour window (the "Review Period") to inspect the goods and report any significant issues or non-delivery through the Platform.',
      "Automatic Release: If no dispute is filed within the Review Period, CasaGrown will automatically release the Points to the Seller's account. Once Points are released, the transaction is considered final.",
      "Resolution Process: We encourage Buyers and Sellers to resolve disputes directly through the Platform's messaging system. If a resolution cannot be reached, either party may escalate the dispute to CasaGrown Staff.",
      "Final Authority: CasaGrown Staff will review escalated disputes and, at their sole discretion, determine the final disposition of the Points. This may include releasing Points to the Seller or returning Points to the Buyer. By using the Platform, you agree to abide by CasaGrown's final decision regarding any transaction dispute.",
    ],
  },
  {
    title: '8. Account Termination & Suspension',
    paragraphs: [
      'Right to Terminate: CasaGrown reserves the right, in its sole and absolute discretion, to terminate, suspend, or limit your access to the Platform and your account at any time, for any reason or no reason, without notice or liability.',
      'Effect of Termination: Upon termination, your right to use the Platform ceases immediately. Any purchased Points will be refunded in accordance with Section 5, while any earned Points may be subject to forfeiture if the account was terminated for fraudulent activity or violation of these Terms.',
    ],
  },
]

// ---------------------------------------------------------------------------
// Privacy Policy content — matches the community app's LegalScreen.tsx
// ---------------------------------------------------------------------------

const PRIVACY_SECTIONS = [
  {
    title: '1. Information Collection',
    paragraphs: [
      'We collect information that you voluntarily provide to us to facilitate neighborhood commerce and ensure regulatory compliance.',
      'Account Data: When you register, we collect your name, email address, and phone number.',
      "Address Information: To provide a \"hyperlocal\" experience, we collect the physical address you manually enter. CasaGrown does not track your real-time GPS location or background movement. Your address is used solely to identify your neighborhood and calculate sales tax for transactions.",
      'Financial & Transaction Data: We collect records of Points purchased, Points earned through sales, and redemption history. Payment processing is handled by secure third-party providers.',
      'Tax Information (Sellers Only): If you sell more than $600 worth of produce in a calendar year, we are required by the IRS to collect your Social Security Number (SSN) or Taxpayer Identification Number (TIN) to issue Form 1099.',
      'Communications: We store messages sent between Buyers and Sellers through the Platform to facilitate dispute resolution and safety.',
    ],
  },
  {
    title: '2. How We Use Your Information',
    paragraphs: [
      'We use your data to:',
      '• Connect you with Buyers and Sellers in your immediate neighborhood.',
      '• Process Point purchases, manage your "Earned Balance," and facilitate redemptions (gift cards, donations, or cash-outs where permitted).',
      '• Calculate and remit sales tax on your behalf in compliance with state marketplace facilitator laws.',
      '• Resolve disputes via CasaGrown staff review of transaction and message history.',
      '• Issue mandatory tax documentation (Form 1099).',
    ],
  },
  {
    title: '3. Data Sharing and Disclosure',
    paragraphs: [
      'With Other Users: When a transaction is initiated, your name and the necessary pickup/delivery address details are shared with the other party to complete the exchange.',
      'With Service Providers: We share data with third-party partners who provide essential services, such as payment processors, tax compliance software, and point-redemption platforms (e.g., Tremendous or Reloadly).',
      'Legal & Regulatory: We may disclose your information if required to do so by law or in response to valid requests by public authorities (e.g., a court or government agency).',
      'No Sale of Data: CasaGrown does not sell your personal data or contact information to third parties for marketing purposes.',
    ],
  },
  {
    title: '4. Your Rights and Choices',
    paragraphs: [
      "Address Accuracy: You may update your provided address at any time through your account settings. An accurate address is required to use the Platform's core marketplace features.",
      'Account Deletion: You may request that we delete your account and associated personal data. Please note that we are legally required to retain certain information (such as 1099 tax records or transaction history) for a minimum period mandated by law.',
      'Communication: You can opt-out of non-essential marketing emails, though you will still receive transaction-related notifications (e.g., delivery confirmations or dispute updates).',
    ],
  },
  {
    title: '5. State-Specific Privacy Rights (Including California)',
    paragraphs: [
      'California SB 22 Compliance: In accordance with California law, if your purchased Points balance drops below $15, you may request a cash-out via Venmo or gift card.',
      'California Privacy Rights (CCPA): California residents have the right to request access to the specific pieces of personal information we have collected and the right to request deletion of that information, subject to legal retention requirements.',
    ],
  },
  {
    title: '6. Data Security',
    paragraphs: [
      'We use industry-standard security measures to protect your personal information. However, please remember that no method of electronic storage is 100% secure. We encourage you to use unique passwords for your CasaGrown account.',
    ],
  },
  {
    title: '7. Changes to This Privacy Policy',
    paragraphs: [
      'We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date at the top.',
    ],
  },
  {
    title: '8. Contact Us',
    paragraphs: [
      'For questions about this Privacy Policy or to exercise your data rights, please contact us at privacy@casagrown.com.',
    ],
  },
]

type DocTab = 'terms' | 'privacy'

export default function TermsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { dispatch } = useMarket()
  const template = searchParams.get('template')
  const [activeTab, setActiveTab] = useState<DocTab>('terms')
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPrivacy, setAgreedPrivacy] = useState(false)

  const allAgreed = agreedTerms && agreedPrivacy
  const supabase = createClient()

  const handleAccept = async () => {
    if (!allAgreed) return

    // Record ToS acceptance with timestamp in profiles table
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ tos_accepted_at: new Date().toISOString() })
        .eq('id', user.id)
    }

    dispatch({ type: 'ACCEPT_TERMS' })
    router.push(template ? `/get-started/${template}` : '/profile-setup')
  }

  const sections = activeTab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <img src="/logo.png" alt="CasaGrown" className={styles.headerLogo} />
          <h1 className={styles.headerTitle}>Legal Agreements</h1>
          <p className={styles.headerDate}>Please review and accept both documents to continue</p>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'terms' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('terms')}
          >
            📜 Terms of Use
            {agreedTerms && <span className={styles.tabCheck}>✓</span>}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'privacy' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            🔒 Privacy Policy
            {agreedPrivacy && <span className={styles.tabCheck}>✓</span>}
          </button>
        </div>

        {/* Document subtitle */}
        <div className={styles.docSubtitle}>
          {activeTab === 'terms'
            ? 'Effective Date: March 4, 2026'
            : 'Last Updated: March 4, 2026'}
        </div>

        {/* Sections */}
        {sections.map((section, si) => (
          <div key={`${activeTab}-${si}`} className={styles.section}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            {section.paragraphs.map((p, pi) => (
              <p key={pi} className={styles.sectionParagraph}>{p}</p>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div className={styles.footer}>
          <p className={styles.footerText}>© 2026 CasaGrown. All rights reserved.</p>
          <p className={styles.footerText}>Questions? Contact us at privacy@casagrown.com</p>
        </div>
      </div>

      {/* Sticky accept bar */}
      <div className={styles.acceptBar}>
        <div className={styles.acceptRow}>
          <input
            type="checkbox"
            id="agree-terms"
            className={styles.checkbox}
            checked={agreedTerms}
            onChange={e => setAgreedTerms(e.target.checked)}
          />
          <label htmlFor="agree-terms" className={styles.checkboxLabel}>
            Terms of Use
          </label>
        </div>
        <div className={styles.acceptRow}>
          <input
            type="checkbox"
            id="agree-privacy"
            className={styles.checkbox}
            checked={agreedPrivacy}
            onChange={e => setAgreedPrivacy(e.target.checked)}
          />
          <label htmlFor="agree-privacy" className={styles.checkboxLabel}>
            Privacy Policy
          </label>
        </div>
        <button
          className={`btn btn-primary ${styles.acceptBtn}`}
          disabled={!allAgreed}
          onClick={handleAccept}
        >
          Accept & Continue →
        </button>
      </div>
    </div>
  )
}
