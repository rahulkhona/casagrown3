'use client'


import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMarket } from '../../../lib/store'
import { createClient } from '../../../lib/supabase'
import { TOS_EFFECTIVE_DATE, needsTosAcceptance } from '../../../lib/legal'
import styles from './page.module.css'

// ---------------------------------------------------------------------------
// Terms of Use content — matches the community app's LegalScreen.tsx
// ---------------------------------------------------------------------------

export const TERMS_SECTIONS = [
  {
    title: '1. Scope of Service & Jurisdiction',
    paragraphs: [
      'CasaGrown is a Marketplace Facilitator providing an internal clearinghouse for neighborhood produce trade.',
      'Operational Rights: CasaGrown reserves the right, in its sole discretion, to determine the states and geographic regions in which it operates. We may block access to the Platform or specific features based on your billing address, IP location, or other regulatory considerations.',
      'Independent Parties: CasaGrown is a technology provider; we are not a party to the sale, a retailer, or a reseller of any produce.',
    ],
  },
  {
    title: '2. Seller Representations & Tax Liability',
    paragraphs: [
      'Accuracy of Listings: Sellers are solely responsible for correctly describing and labeling their products (e.g., distinguishing between "Unprocessed Produce" and "Prepared Goods").',
      'Tax Integrity: CasaGrown relies on Seller-provided labels to calculate and collect sales tax. Sellers are fully liable for any tax underpayments, penalties, or fines resulting from the miscategorization of a product.',
      'Product Matching: Sellers represent that all delivered goods match the provided text and images. Failure to match is a material breach and may result in a reversal of funds.',
    ],
  },
  {
    title: '3. The Clearinghouse & Netting Model',
    paragraphs: [
      'CasaGrown maintains an Internal Settlement Ledger in U.S. Dollars (USD).',
      'Daily Netting: At the conclusion of each market interval, CasaGrown will "net" your account. We subtract the total cost of your Completed Purchases from your total Completed Sales earnings.',
      'Exclusion of Pending Trades: Transactions that are "Pending" are excluded from the netting process until they are marked as "Completed" in the system.',
      'Agent of the Payee: Every Seller hereby appoints CasaGrown as their limited payment collection agent. Receipt of funds by CasaGrown from a Buyer constitutes legal payment to the Seller, and the Buyer\'s debt is extinguished at that moment.',
    ],
  },
  {
    title: '4. Payouts, Thresholds, and Mandatory Settlement',
    paragraphs: [
      'Payout & Redemption Methods: "Payouts" are cash-based distributions to your linked Venmo or electronic account. "Redemptions" refer to the conversion of your balance into a Digital Gift Card.',
      'User-Defined Thresholds: You may set a target threshold (e.g., $50.00) to trigger an automatic Payout. Holding funds below your chosen threshold is a service provided at your direction to minimize transaction fees.',
      'Maximum Ledger Balance: To comply with federal anti-money laundering (AML) guidelines and avoid classification as a custodial institution, CasaGrown imposes a maximum ledger balance of $500.00. If your net earnings exceed this amount, CasaGrown will initiate an automatic Payout regardless of your chosen threshold.',
      'Pass-Through Fees: Cash-based Payouts are subject to a Pass-Through Payout Fee representing the actual third-party processing cost. Digital Gift Card Redemptions carry no payout fee.',
      'Inactivity & The 90-Day Sweep: An account is deemed "Inactive" if the user has not logged into the Platform AND has not initiated or completed a transaction for ninety (90) consecutive days.',
      'Sweep Execution: CasaGrown will perform a mandatory settlement ("The Sweep") of any funds remaining in an Inactive account:',
      'Valid Payout Method: If you have a linked Venmo/Zelle account, we will initiate a Payout for your full net balance (subject to the Pass-Through Fee).',
      'No Payout Method / Low Balance: If no Payout Method is provided, or if the balance is lower than the Payout Fee, the funds will be converted into a Digital Gift Card and sent to your registered email address.',
      'The "Dead Zone" Minimums: Digital Gift Card Redemptions require a minimum balance as dictated by our third-party issuers (typically $1.00). If an Inactive balance remains below the minimum for gift card issuance, it will remain in your ledger until additional activity occurs.',
      'Issuer Selection: CasaGrown reserves the sole right to select the gift card brand for any mandatory Redemptions. This action constitutes final legal settlement of the debt.',
    ],
  },
  {
    title: '5. Taxes and 1099-K',
    paragraphs: [
      'Sales Tax: We calculate and remit sales tax on behalf of Sellers where required.',
      'IRS Reporting: If your Gross Sales (before netting) exceed $600 (or applicable thresholds), you must provide a valid W-9 to receive further payouts.',
    ],
  },
  {
    title: '6. Dispute Resolution and Cancellations',
    paragraphs: [
      'Review Period: Buyers have four (4) hours post-delivery to report issues.',
      'Pickup No-Shows: If a transaction is designated for local pickup and the Buyer fails to arrive within the agreed upon timeframe ("No-Show"), the transaction will automatically be marked as Completed, and funds will be released to the Seller.',
      'Delivery No-Shows: If a transaction is designated for delivery and the Seller fails to deliver the produce within the agreed upon timeframe ("Delivery No-Show"), the transaction will be automatically canceled, and a full refund will be issued to the Buyer.',
      'Final Authority: In the event of an escalation, CasaGrown Administrators hold the absolute final authority in resolving disputes. Administrators will determine, at their sole discretion, whether to release funds to the Seller or return funds to the Buyer. By using the Platform, you agree to abide by CasaGrown\'s final decision.',
    ],
  },
  {
    title: '7. Agricultural Compliance & Quarantine Liability',
    paragraphs: [
      'Venue Status: CasaGrown is a technology venue and is not the shipper, retailer, or distributor of any produce.',
      'Seller Liability: The Seller assumes 100% of the legal burden and liability for complying with all federal, state, and local agricultural laws, including but not limited to observing quarantine boundaries and securing necessary permits.',
      'Platform Warnings: Any automated quarantine warnings or checkout blocks provided by the Platform are offered strictly as a convenience and do not constitute a guarantee of compliance. CasaGrown assumes no liability for a Seller\'s failure to adhere to agricultural regulations.',
    ],
  },
  {
    title: '8. Prohibited Listings and Items',
    paragraphs: [
      'CasaGrown is a marketplace exclusively for fresh produce and related neighborhood goods. To ensure user safety and regulatory compliance, the following items are strictly prohibited:',
      'Regulated Substances: Cigarettes, e-cigarettes, vapes, tobacco, alcohol, and any illegal drugs or drug paraphernalia.',
      'Prescription Goods: Any prescription medications or products making unverified medical claims.',
      'Adult Content: Any sexually explicit, pornographic, or "adult-only" products or services.',
      'Dangerous Items: Weapons, explosives, or hazardous chemicals.',
      'Non-Produce Items: Unless explicitly permitted, the platform may not be used to sell household junk, counterfeit goods, or services unrelated to gardening/produce.',
      'Violation Result: Posting prohibited items will result in immediate removal of the listing and a permanent ban of the user account.',
    ],
  },
  {
    title: '9. Community Standards and Conduct',
    paragraphs: [
      'We have a zero-tolerance policy for behavior that makes our neighborhood unsafe or unwelcome:',
      'Zero Harassment: You may not threaten, stalk, bully, or harass any user.',
      'Communication: All interactions must remain respectful. Profanity, hate speech, or derogatory comments regarding race, religion, gender, or identity are grounds for immediate termination.',
      'Fraud and Misuse: Creating multiple accounts to bypass limits, "shilling" fake reviews, or attempting to lure users off-platform to avoid fees is strictly prohibited.',
      'Enforcement: CasaGrown reserves the right to report any illegal conduct or credible threats to law enforcement.',
    ],
  },
  {
    title: '10. Minor and Teen Safety',
    paragraphs: [
      'CasaGrown allows teenagers to participate in the neighborhood economy, but safety is our priority:',
      'Age Requirement: Users must be at least 13 years old to create an account.',
      'Guardian Oversight: Any user under the age of 18 ("Minor") represents that they have the explicit permission of a parent or legal guardian to use the platform.',
      'Parental Liability: Parents or legal guardians are solely responsible for the conduct, safety, and financial liabilities of any Minor using the account.',
      'Safe Exchanges: We strongly advise that all hand-offs between neighbors occur in public spaces or under the supervision of an adult.',
    ],
  },
  {
    title: '11. CasaGrown Pro Subscriptions & Fees',
    paragraphs: [
      `Subscription Plans: CasaGrown offers a paid subscription tier ("CasaGrown Pro") billed on a recurring monthly or annual basis via Stripe at a rate of $10.00 per month (or the active rate defined in the Platform Fees schedule). Subscription fees, platform transaction fees, and pass-through payout costs are determined dynamically in accordance with the active Platform Fees schedule and our payment processor's (Stripe) rates.`,
      'Billing & Renewal: Subscriptions automatically renew at the end of each billing cycle unless canceled. You may cancel your subscription at any time via your Account Settings. CasaGrown offers a seven (7) day cancellation window from the initial purchase date during which you may receive a full refund of subscription fees. Outside of this seven (7) day window, cancellations will take effect at the end of your current billing period, and no refunds or partial credits will be issued for unused portions of a billing cycle.',
      `Reduced Transaction Fees: Active Pro subscribers are eligible for reduced platform transaction fee rates of 5% on completed marketplace sales, compared to the standard rate of 10%. Platform transaction fees, subscription rates, and Stripe pass-through costs (currently set to direct pass-through of processing costs) are resolved from our active billing records at the time of the transaction.`,
      'Plan Alterations: CasaGrown reserves the right to adjust subscription pricing or fee structures upon thirty (30) days notice. Your continued use of the platform after the change constitutes acceptance of the new terms.',
    ],
  },
  {
    title: '12. Third-Party & Social Page Automation',
    paragraphs: [
      'Social Linking Authorization: By connecting your professional Facebook Page or social accounts to CasaGrown, you grant the Platform a limited, non-exclusive license to access, manage, and publish content to your page solely on your behalf and at your direction.',
      'Merchant Responsibility: You assume 100% responsibility and liability for all posts, inventory listings, and automated replies published by the Platform to your social pages. You represent that all such posts comply with Meta\'s Community Standards and local legal regulations.',
      'Messaging Automation Disclaimer: The Messenger auto-responder is a utility offered for your convenience to reply to customer inquiries when you are unavailable. CasaGrown does not guarantee the uptime, delivery, or absolute accuracy of automated replies and is not liable for customer disputes, business loss, page suspensions, or policy violations arising from automated messaging.',
    ],
  },
]

export const getTermsSections = (fees: {
  freeFeePct: number
  proFeePct: number
  proSubPrice: number
  stripeFeeHandling: string
}) => [
  {
    title: '1. Scope of Service & Jurisdiction',
    paragraphs: [
      'CasaGrown is a Marketplace Facilitator providing an internal clearinghouse for neighborhood produce trade.',
      'Operational Rights: CasaGrown reserves the right, in its sole discretion, to determine the states and geographic regions in which it operates. We may block access to the Platform or specific features based on your billing address, IP location, or other regulatory considerations.',
      'Independent Parties: CasaGrown is a technology provider; we are not a party to the sale, a retailer, or a reseller of any produce.',
    ],
  },
  {
    title: '2. Seller Representations & Tax Liability',
    paragraphs: [
      'Accuracy of Listings: Sellers are solely responsible for correctly describing and labeling their products (e.g., distinguishing between "Unprocessed Produce" and "Prepared Goods").',
      'Tax Integrity: CasaGrown relies on Seller-provided labels to calculate and collect sales tax. Sellers are fully liable for any tax underpayments, penalties, or fines resulting from the miscategorization of a product.',
      'Product Matching: Sellers represent that all delivered goods match the provided text and images. Failure to match is a material breach and may result in a reversal of funds.',
    ],
  },
  {
    title: '3. The Clearinghouse & Netting Model',
    paragraphs: [
      'CasaGrown maintains an Internal Settlement Ledger in U.S. Dollars (USD).',
      'Daily Netting: At the conclusion of each market interval, CasaGrown will "net" your account. We subtract the total cost of your Completed Purchases from your total Completed Sales earnings.',
      'Exclusion of Pending Trades: Transactions that are "Pending" are excluded from the netting process until they are marked as "Completed" in the system.',
      'Agent of the Payee: Every Seller hereby appoints CasaGrown as their limited payment collection agent. Receipt of funds by CasaGrown from a Buyer constitutes legal payment to the Seller, and the Buyer\'s debt is extinguished at that moment.',
    ],
  },
  {
    title: '4. Payouts, Thresholds, and Mandatory Settlement',
    paragraphs: [
      'Payout & Redemption Methods: "Payouts" are cash-based distributions to your linked Venmo or electronic account. "Redemptions" refer to the conversion of your balance into a Digital Gift Card.',
      'User-Defined Thresholds: You may set a target threshold (e.g., $50.00) to trigger an automatic Payout. Holding funds below your chosen threshold is a service provided at your direction to minimize transaction fees.',
      'Maximum Ledger Balance: To comply with federal anti-money laundering (AML) guidelines and avoid classification as a custodial institution, CasaGrown imposes a maximum ledger balance of $500.00. If your net earnings exceed this amount, CasaGrown will initiate an automatic Payout regardless of your chosen threshold.',
      'Pass-Through Fees: Cash-based Payouts are subject to a Pass-Through Payout Fee representing the actual third-party processing cost. Digital Gift Card Redemptions carry no payout fee.',
      'Inactivity & The 90-Day Sweep: An account is deemed "Inactive" if the user has not logged into the Platform AND has not initiated or completed a transaction for ninety (90) consecutive days.',
      'Sweep Execution: CasaGrown will perform a mandatory settlement ("The Sweep") of any funds remaining in an Inactive account:',
      'Valid Payout Method: If you have a linked Venmo/Zelle account, we will initiate a Payout for your full net balance (subject to the Pass-Through Fee).',
      'No Payout Method / Low Balance: If no Payout Method is provided, or if the balance is lower than the Payout Fee, the funds will be converted into a Digital Gift Card and sent to your registered email address.',
      'The "Dead Zone" Minimums: Digital Gift Card Redemptions require a minimum balance as dictated by our third-party issuers (typically $1.00). If an Inactive balance remains below the minimum for gift card issuance, it will remain in your ledger until additional activity occurs.',
      'Issuer Selection: CasaGrown reserves the sole right to select the gift card brand for any mandatory Redemptions. This action constitutes final legal settlement of the debt.',
    ],
  },
  {
    title: '5. Taxes and 1099-K',
    paragraphs: [
      'Sales Tax: We calculate and remit sales tax on behalf of Sellers where required.',
      'IRS Reporting: If your Gross Sales (before netting) exceed $600 (or applicable thresholds), you must provide a valid W-9 to receive further payouts.',
    ],
  },
  {
    title: '6. Dispute Resolution and Cancellations',
    paragraphs: [
      'Review Period: Buyers have four (4) hours post-delivery to report issues.',
      'Pickup No-Shows: If a transaction is designated for local pickup and the Buyer fails to arrive within the agreed upon timeframe ("No-Show"), the transaction will automatically be marked as Completed, and funds will be released to the Seller.',
      'Delivery No-Shows: If a transaction is designated for delivery and the Seller fails to deliver the produce within the agreed upon timeframe ("Delivery No-Show"), the transaction will be automatically canceled, and a full refund will be issued to the Buyer.',
      'Final Authority: In the event of an escalation, CasaGrown Administrators hold the absolute final authority in resolving disputes. Administrators will determine, at their sole discretion, whether to release funds to the Seller or return funds to the Buyer. By using the Platform, you agree to abide by CasaGrown\'s final decision.',
    ],
  },
  {
    title: '7. Agricultural Compliance & Quarantine Liability',
    paragraphs: [
      'Venue Status: CasaGrown is a technology venue and is not the shipper, retailer, or distributor of any produce.',
      'Seller Liability: The Seller assumes 100% of the legal burden and liability for complying with all federal, state, and local agricultural laws, including but not limited to observing quarantine boundaries and securing necessary permits.',
      'Platform Warnings: Any automated quarantine warnings or checkout blocks provided by the Platform are offered strictly as a convenience and do not constitute a guarantee of compliance. CasaGrown assumes no liability for a Seller\'s failure to adhere to agricultural regulations.',
    ],
  },
  {
    title: '8. Prohibited Listings and Items',
    paragraphs: [
      'CasaGrown is a marketplace exclusively for fresh produce and related neighborhood goods. To ensure user safety and regulatory compliance, the following items are strictly prohibited:',
      'Regulated Substances: Cigarettes, e-cigarettes, vapes, tobacco, alcohol, and any illegal drugs or drug paraphernalia.',
      'Prescription Goods: Any prescription medications or products making unverified medical claims.',
      'Adult Content: Any sexually explicit, pornographic, or "adult-only" products or services.',
      'Dangerous Items: Weapons, explosives, or hazardous chemicals.',
      'Non-Produce Items: Unless explicitly permitted, the platform may not be used to sell household junk, counterfeit goods, or services unrelated to gardening/produce.',
      'Violation Result: Posting prohibited items will result in immediate removal of the listing and a permanent ban of the user account.',
    ],
  },
  {
    title: '9. Community Standards and Conduct',
    paragraphs: [
      'We have a zero-tolerance policy for behavior that makes our neighborhood unsafe or unwelcome:',
      'Zero Harassment: You may not threaten, stalk, bully, or harass any user.',
      'Communication: All interactions must remain respectful. Profanity, hate speech, or derogatory comments regarding race, religion, gender, or identity are grounds for immediate termination.',
      'Fraud and Misuse: Creating multiple accounts to bypass limits, "shilling" fake reviews, or attempting to lure users off-platform to avoid fees is strictly prohibited.',
      'Enforcement: CasaGrown reserves the right to report any illegal conduct or credible threats to law enforcement.',
    ],
  },
  {
    title: '10. Minor and Teen Safety',
    paragraphs: [
      'CasaGrown allows teenagers to participate in the neighborhood economy, but safety is our priority:',
      'Age Requirement: Users must be at least 13 years old to create an account.',
      'Guardian Oversight: Any user under the age of 18 ("Minor") represents that they have the explicit permission of a parent or legal guardian to use the platform.',
      'Parental Liability: Parents or legal guardians are solely responsible for the conduct, safety, and financial liabilities of any Minor using the account.',
      'Safe Exchanges: We strongly advise that all hand-offs between neighbors occur in public spaces or under the supervision of an adult.',
    ],
  },
  {
    title: '11. CasaGrown Pro Subscriptions & Fees',
    paragraphs: [
      `Subscription Plans: CasaGrown offers a paid subscription tier ("CasaGrown Pro") billed on a recurring monthly or annual basis via Stripe at a rate of $${fees.proSubPrice.toFixed(2)} per month (or the active rate defined in the Platform Fees schedule). Subscription fees, platform transaction fees, and pass-through payout costs are determined dynamically in accordance with the active Platform Fees schedule and our payment processor's (Stripe) rates.`,
      'Billing & Renewal: Subscriptions automatically renew at the end of each billing cycle unless canceled. You may cancel your subscription at any time via your Account Settings. CasaGrown offers a seven (7) day cancellation window from the initial purchase date during which you may receive a full refund of subscription fees. Outside of this seven (7) day window, cancellations will take effect at the end of your current billing period, and no refunds or partial credits will be issued for unused portions of a billing cycle.',
      `Reduced Transaction Fees: Active Pro subscribers are eligible for reduced platform transaction fee rates of ${fees.proFeePct}% on completed marketplace sales, compared to the standard rate of ${fees.freeFeePct}%. Platform transaction fees, subscription rates, and Stripe pass-through costs (currently set to ${fees.stripeFeeHandling === 'pass_through' ? 'direct pass-through of processing costs' : fees.stripeFeeHandling}) are resolved from our active billing records at the time of the transaction.`,
      'Plan Alterations: CasaGrown reserves the right to adjust subscription pricing or fee structures upon thirty (30) days notice. Your continued use of the platform after the change constitutes acceptance of the new terms.',
    ],
  },
  {
    title: '12. Third-Party & Social Page Automation',
    paragraphs: [
      'Social Linking Authorization: By connecting your professional Facebook Page or social accounts to CasaGrown, you grant the Platform a limited, non-exclusive license to access, manage, and publish content to your page solely on your behalf and at your direction.',
      'Merchant Responsibility: You assume 100% responsibility and liability for all posts, inventory listings, and automated replies published by the Platform to your social pages. You represent that all such posts comply with Meta\'s Community Standards and local legal regulations.',
      'Messaging Automation Disclaimer: The Messenger auto-responder is a utility offered for your convenience to reply to customer inquiries when you are unavailable. CasaGrown does not guarantee the uptime, delivery, or absolute accuracy of automated replies and is not liable for customer disputes, business loss, page suspensions, or policy violations arising from automated messaging.',
    ],
  },
]

// ---------------------------------------------------------------------------
// Privacy Policy content
// ---------------------------------------------------------------------------

export const PRIVACY_SECTIONS = [
  {
    title: '1. Information Collection',
    paragraphs: [
      'To provide our neighborhood marketplace and ensure regulatory compliance, we collect:',
      'Personal Identifiers: Legal name, email address, phone number, and physical neighborhood address (required for geofencing and delivery).',
      'Financial & Tax Data: Payout handles (Venmo/Zelle), transaction history (Gross Sales vs. Purchases), and Taxpayer Identity (SSN/EIN) for users exceeding IRS or state reporting thresholds.',
      'Usage & Device Data: IP address, device identifiers, and "Cookies" or tracking pixels used to measure app performance and deliver relevant neighborhood advertisements.',
      'Connected Social & Page Data: If you choose to link your Facebook Page or Messenger account, we collect basic page profile details, page identifiers, message metadata, and comment text necessary to execute auto-posts and auto-responses. We only fetch and process this data when explicitly authorized by you.',
      'Listing Content: Photos and descriptions of your produce used for tax categorization and platform safety monitoring.',
    ],
  },
  {
    title: '2. Data Usage & Third-Party Sharing',
    paragraphs: [
      'We use your data to operate the marketplace and grow our community:',
      'Service Operations: To facilitate netting, payouts, and neighborhood deliveries.',
      'Mandatory Retention: We are legally required to retain transaction records and Taxpayer Identity for seven (7) years for audit purposes.',
      'Social Automation Processing: When utilizing the Page Auto-Responder, message content is processed in real-time solely to match customer questions with active inventory databases and generate automated responses. We do not permanently store or cache private message content in our long-term logs, and we never share Messenger data with third-party advertising brokers.',
      'No Marketing Tracking or Sharing: We do not share your personal identifiers, transaction data, or hashed credentials with third-party advertising networks or platforms for marketing, behavioral targeting, or lookalike tracking.',
      'Safety & Inactivity: We monitor login timestamps to execute the 90-Day Force-Sweep of inactive accounts.',
    ],
  },
  {
    title: '3. Teen Safety & COPPA Compliance',
    paragraphs: [
      'CasaGrown is a family-oriented platform, but we take the privacy of minors seriously:',
      'Under 13: We do not knowingly collect or store data from children under the age of 13. If we discover a user is under 13, the account will be immediately deleted.',
      'Teens (13–17): Data collected from minor users is strictly used for platform operations and safety. We do not sell or lease the personal data of known minors to third-party advertisers for behavioral targeting.',
    ],
  },
  {
    title: '4. Your Rights & Choices',
    paragraphs: [
      'Depending on your location (e.g., California, Texas, or Virginia), you have the right to:',
      'Access & Export: Request a copy of the data we hold about you.',
      'Deletion: Request that we delete your account (subject to our 7-year legal tax retention requirement).',
      'Opt-Out & Preferences: We do not perform third-party tracking, profiling, or behavioral advertising. You can manage notification and location permissions directly in your account settings.',
    ],
  },
  {
    title: '5. Connected Social Services & Data Deletion',
    paragraphs: [
      'Control Over Connections: You have absolute control over your connected third-party integrations (such as Facebook Pages or Messenger bots). You can disconnect these integrations instantly via your CasaGrown Account Settings or directly from your Facebook Business Integrations page.',
      'Immediate Data Purge: When you disconnect your Facebook Page, all associated page access tokens, page preferences, and transient message metadata are instantly and permanently purged from our active databases.',
      'Data Erasure Requests: If you wish to submit a formal request for complete data deletion of all personal and social data collected by the Platform, you may do so at any time by emailing privacy@casagrown.com. Requests will be fulfilled within thirty (30) days, subject to our legally mandated tax and transaction retention requirements.',
    ],
  },
]

type DocTab = 'terms' | 'privacy'

function TermsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { dispatch } = useMarket()
  const template = searchParams.get('template')
  const redirectTo = searchParams.get('redirect')
  const [activeTab, setActiveTab] = useState<DocTab>(
    searchParams.get('tab') === 'privacy' ? 'privacy' : 'terms'
  )
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedPrivacy, setAgreedPrivacy] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [alreadyAccepted, setAlreadyAccepted] = useState(false)
  const [acceptedDate, setAcceptedDate] = useState<string | null>(null)
  const [fees, setFees] = useState({
    freeFeePct: 10,
    proFeePct: 5,
    proSubPrice: 10.00,
    stripeFeeHandling: 'pass_through'
  })

  const allAgreed = agreedTerms && agreedPrivacy
  const isOnboarding = !!(template || redirectTo)
  const supabase = createClient()

  // Check if user has already accepted current TOS (read-only mode)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      setIsLoggedIn(true)
      const { data: profile } = await supabase
        .from('profiles')
        .select('tos_accepted_at')
        .eq('id', user.id)
        .single()
      if (profile?.tos_accepted_at && !needsTosAcceptance(profile.tos_accepted_at)) {
        setAlreadyAccepted(true)
        setAcceptedDate(new Date(profile.tos_accepted_at).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        }))
      }
    })

    const fetchFees = async () => {
      try {
        const { data, error } = await supabase
          .from('platform_fees')
          .select('free_fee_pct, pro_fee_pct, pro_sub_price, stripe_fee_handling')
          .eq('country_code', 'USA')
          .order('creation_date', { ascending: false })
          .limit(1)
          .single()

        if (error) {
          console.error('Error fetching platform fees:', error)
          return
        }

        if (data) {
          setFees({
            freeFeePct: Number(data.free_fee_pct ?? 10),
            proFeePct: Number(data.pro_fee_pct ?? 5),
            proSubPrice: Number(data.pro_sub_price ?? 10.00),
            stripeFeeHandling: data.stripe_fee_handling ?? 'pass_through'
          })
        }
      } catch (err) {
        console.error('Error fetching platform fees:', err)
      }
    }
    fetchFees()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = async () => {
    if (!allAgreed) return

    // Record ToS acceptance with timestamp in profiles table
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (user) {
      await supabase
        .from('profiles')
        .update({ tos_accepted_at: new Date().toISOString() })
        .eq('id', user.id)

      // Check if profile is already complete (returning user re-accepting updated ToS)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, street_address')
        .eq('id', user.id)
        .single()

      dispatch({ type: 'ACCEPT_TERMS' })

      if (template) {
        router.push(`/get-started/${template}`)
      } else if (profile?.full_name && profile?.street_address) {
        // Profile already complete — go to redirect target or community
        router.push(redirectTo || '/community')
      } else {
        const redirectParam = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''
        router.push(`/profile-setup${redirectParam}`)
      }
    } else {
      dispatch({ type: 'ACCEPT_TERMS' })
      router.push('/profile-setup')
    }
  }

  const sections = activeTab === 'terms' ? getTermsSections(fees) : PRIVACY_SECTIONS

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
            {isOnboarding && agreedTerms && <span className={styles.tabCheck}>✓</span>}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'privacy' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            🔒 Privacy Policy
            {isOnboarding && agreedPrivacy && <span className={styles.tabCheck}>✓</span>}
          </button>
        </div>

        {/* Document subtitle */}
        <div className={styles.docSubtitle}>
          {activeTab === 'terms'
            ? `Effective Date: ${TOS_EFFECTIVE_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
            : `Last Updated: ${TOS_EFFECTIVE_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
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

      {/* Accept bar — hidden if user already accepted current version */}
      {!isLoggedIn ? null : alreadyAccepted ? (
        <div className={styles.acceptBar} style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--green-700)', fontWeight: 600, margin: '0 0 4px' }}>
            ✓ You accepted these agreements on {acceptedDate}
          </p>
          <p style={{ color: 'var(--gray-500)', fontSize: 13, margin: 0 }}>
            You can review them anytime from the menu.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  )
}

export default function TermsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <TermsPageInner />
    </Suspense>
  )
}
