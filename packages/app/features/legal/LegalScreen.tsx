'use client'

/**
 * LegalScreen — Renders Terms of Use, Privacy Policy, Community Guidelines,
 * or Seller's Handbook.
 *
 * Shared between web (Next.js) and native (Expo).
 */

import React from 'react'
import { YStack, XStack, Text, ScrollView } from 'tamagui'
import { Platform, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'solito/navigation'
import { ArrowLeft } from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'

// =============================================================================
// Content Data
// =============================================================================

interface Section {
  title: string
  paragraphs: string[]
}

const TERMS_OF_USE: { title: string; effectiveDate: string; sections: Section[] } = {
  title: 'Terms of Use: CasaGrown Marketplace',
  effectiveDate: 'Effective Date: March 4, 2026',
  sections: [
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
        'Agent of Payee: CasaGrown acts as the limited payment collection agent for Sellers. Receipt of Points/funds by CasaGrown satisfies the Buyer\'s debt to the Seller.',
        'Dispute Rights: CasaGrown reserves the right to hold or return Points to a Buyer in the event of a delivery dispute.',
        'Tax Reporting: CasaGrown will issue a Form 1099 to any Seller exceeding $600 in annual sales.',
        'Sales Tax: We calculate and collect sales tax on behalf of Sellers in compliance with applicable state marketplace facilitator laws.',
      ],
    },
    {
      title: '7. Dispute Resolution & Point Release',
      paragraphs: [
        'Confirmation Window: Upon delivery of produce, the Buyer has a four (4) hour window (the "Review Period") to inspect the goods and report any significant issues or non-delivery through the Platform.',
        'Automatic Release: If no dispute is filed within the Review Period, CasaGrown will automatically release the Points to the Seller\'s account. Once Points are released, the transaction is considered final.',
        'Resolution Process: We encourage Buyers and Sellers to resolve disputes directly through the Platform\'s messaging system. If a resolution cannot be reached, either party may escalate the dispute to CasaGrown Staff.',
        'Final Authority: CasaGrown Staff will review escalated disputes and, at their sole discretion, determine the final disposition of the Points. This may include releasing Points to the Seller or returning Points to the Buyer. By using the Platform, you agree to abide by CasaGrown\'s final decision regarding any transaction dispute.',
      ],
    },
    {
      title: '8. Account Termination & Suspension',
      paragraphs: [
        'Right to Terminate: CasaGrown reserves the right, in its sole and absolute discretion, to terminate, suspend, or limit your access to the Platform and your account at any time, for any reason or no reason, without notice or liability.',
        'Effect of Termination: Upon termination, your right to use the Platform ceases immediately. Any purchased Points will be refunded in accordance with Section 5, while any earned Points may be subject to forfeiture if the account was terminated for fraudulent activity or violation of these Terms.',
      ],
    },
  ],
}

const PRIVACY_POLICY: { title: string; lastUpdated: string; intro: string; sections: Section[] } = {
  title: 'Privacy Policy: CasaGrown',
  lastUpdated: 'Last Updated: March 4, 2026',
  intro: 'This Privacy Policy describes how CasaGrown ("we," "us," or "our") collects, uses, and shares your personal information when you use our hyperlocal marketplace (the "Platform"). By using the Platform, you agree to the collection and use of information in accordance with this policy.',
  sections: [
    {
      title: '1. Information Collection',
      paragraphs: [
        'We collect information that you voluntarily provide to us to facilitate neighborhood commerce and ensure regulatory compliance.',
        'Account Data: When you register, we collect your name, email address, and phone number.',
        'Address Information: To provide a "hyperlocal" experience, we collect the physical address you manually enter. CasaGrown does not track your real-time GPS location or background movement. Your address is used solely to identify your neighborhood and calculate sales tax for transactions.',
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
        'Address Accuracy: You may update your provided address at any time through your account settings. An accurate address is required to use the Platform\'s core marketplace features.',
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
  ],
}

const COMMUNITY_GUIDELINES: { title: string; effectiveDate: string; intro: string; sections: Section[] } = {
  title: 'CasaGrown Community Guidelines',
  effectiveDate: 'Effective Date: March 4, 2026',
  intro: 'Welcome to the neighborhood! To keep our marketplace safe and fun, please follow these simple rules:',
  sections: [
    {
      title: 'Be a Good Neighbor',
      paragraphs: [
        'Only sell what you would be happy to put on your own table. Ensure produce is clean and free of pests.',
      ],
    },
    {
      title: 'Know Your Points',
      paragraphs: [
        '1 Point = $1. You can buy up to $500 in points a day, but you can\'t hold more than $2000 in your account.',
      ],
    },
    {
      title: 'Confirm Deliveries',
      paragraphs: [
        'Buyers, please hit "Confirm" as soon as you get your produce so your neighbor gets their points!',
      ],
    },
    {
      title: 'Transparent Fees',
      paragraphs: [
        'We take a 10% fee to keep the lights on, the app running, and the community growing.',
      ],
    },
    {
      title: 'Redemption Rules',
      paragraphs: [
        'You can turn your earned points into gift cards or donations anytime. In some states, cash-outs are available, but check your local settings—laws vary!',
      ],
    },
    {
      title: 'Tax Time',
      paragraphs: [
        'If you\'re a superstar seller making over $600 a year, we\'ll send you a 1099 form for your taxes.',
      ],
    },
  ],
}

const SELLERS_HANDBOOK: { title: string; effectiveDate: string; intro: string; sections: Section[] } = {
  title: 'The CasaGrown Seller\'s Handbook',
  effectiveDate: 'Effective Date: March 4, 2026',
  intro: 'As a CasaGrown Seller, you are an independent affiliate. You are the "Face" of your backyard farm!',
  sections: [
    {
      title: '1. Produce Standards',
      paragraphs: [
        'You are the Expert: You are responsible for the safety of your produce. CasaGrown does not inspect or "grade" your food.',
        'Labeling: If your state requires specific labels for "Cottage Foods" or raw produce, you must include them with your delivery.',
        'Honesty is Policy: Use real photos of your actual garden/produce. Misleading listings can lead to point reversals and account suspension.',
      ],
    },
    {
      title: '2. Getting Paid',
      paragraphs: [
        'The Hold Period: When a buyer "buys" your tomatoes, the points move to a "Pending" state. Once they confirm delivery, the points land in your "Earned" balance.',
        'Platform Fees: Remember that 10% of the sale stays with CasaGrown to cover payment processing and marketplace maintenance.',
      ],
    },
    {
      title: '3. Taxes & Legal',
      paragraphs: [
        '1099-K Forms: We track your annual sales. If you cross the $600 threshold, our system will prompt you for your tax info so we can issue your 1099.',
        'Sales Tax: Don\'t worry about the math! CasaGrown automatically calculates and collects the sales tax from the buyer and sends it to the state for you.',
      ],
    },
    {
      title: '4. Disputes',
      paragraphs: [
        'If a neighbor claims their lettuce was wilted or never arrived, we will investigate. If we find the claim is valid, the points will be returned to the buyer. Please communicate with your buyers to resolve issues locally first!',
      ],
    },
  ],
}

// =============================================================================
// Component
// =============================================================================

export type LegalDocType = 'terms' | 'privacy' | 'guidelines' | 'sellers-handbook'

export interface LegalScreenProps {
  type: LegalDocType
}

export function LegalScreen({ type }: LegalScreenProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const docMap = {
    terms: TERMS_OF_USE,
    privacy: PRIVACY_POLICY,
    guidelines: COMMUNITY_GUIDELINES,
    'sellers-handbook': SELLERS_HANDBOOK,
  }
  const doc = docMap[type]
  const subtitle = type === 'privacy'
    ? PRIVACY_POLICY.lastUpdated
    : (doc as any).effectiveDate || ''

  return (
    <YStack flex={1} backgroundColor={colors.green[50]}>
      {/* Branded Header — matches home page green */}
      <YStack
        backgroundColor={colors.green[700]}
        paddingTop={Platform.OS === 'web' ? 24 : insets.top + (Platform.OS === 'ios' ? 10 : 20)}
        paddingBottom="$5"
        paddingHorizontal="$5"
        alignItems="center"
      >
        {/* Back + Logo Row */}
        <XStack width="100%" maxWidth={720} alignItems="center" gap="$3">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={22} color="white" />
          </Pressable>
          <XStack flex={1} alignItems="center" justifyContent="center" gap="$2" marginRight={22}>
            {Platform.OS === 'web' ? (
              <img
                src="/logo.png"
                alt="CasaGrown"
                style={{ width: 32, height: 32, objectFit: 'contain' }}
              />
            ) : (
              <Text fontSize={24}>🏠</Text>
            )}
            <Text fontWeight="700" fontSize={20} color="white">
              CasaGrown
            </Text>
          </XStack>
        </XStack>

        {/* Document Title */}
        <YStack marginTop="$3" alignItems="center" gap="$1">
          <Text fontSize={22} fontWeight="800" color="white" textAlign="center">
            {type === 'terms' ? 'Terms of Use' : type === 'privacy' ? 'Privacy Policy' : type === 'guidelines' ? 'Community Guidelines' : "Seller's Handbook"}
          </Text>
          <Text fontSize={13} color={colors.green[200]} fontWeight="500">
            {subtitle}
          </Text>
        </YStack>
      </YStack>

      {/* Content */}
      <ScrollView
        flex={1}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <YStack
          maxWidth={720}
          width="100%"
          alignSelf="center"
          paddingHorizontal="$4"
          paddingVertical="$5"
          gap="$4"
        >
          {/* Intro paragraph */}
          {(doc as any).intro && (
            <YStack
              backgroundColor="white"
              borderRadius={12}
              padding="$5"
              borderWidth={1}
              borderColor={colors.gray[200]}
            >
              <Text fontSize={15} color={colors.gray[700]} lineHeight={24}>
                {(doc as any).intro}
              </Text>
            </YStack>
          )}

          {/* Sections */}
          {doc.sections.map((section, si) => (
            <YStack
              key={si}
              backgroundColor="white"
              borderRadius={12}
              padding="$5"
              gap="$3"
              borderWidth={1}
              borderColor={colors.gray[200]}
            >
              <Text fontSize={16} fontWeight="700" color={colors.green[800]} lineHeight={22}>
                {section.title}
              </Text>
              {section.paragraphs.map((paragraph, pi) => (
                <Text
                  key={pi}
                  fontSize={14}
                  color={colors.gray[700]}
                  lineHeight={22}
                >
                  {paragraph}
                </Text>
              ))}
            </YStack>
          ))}

          {/* Footer */}
          <YStack
            marginTop="$2"
            paddingVertical="$4"
            alignItems="center"
            gap="$1"
          >
            <Text fontSize={12} color={colors.gray[400]}>
              © 2026 CasaGrown. All rights reserved.
            </Text>
            <Text fontSize={12} color={colors.gray[400]}>
              Questions? Contact us at privacy@casagrown.com
            </Text>
          </YStack>
        </YStack>
      </ScrollView>
    </YStack>
  )
}
