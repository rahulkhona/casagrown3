'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { YStack, XStack, Text, Button, Sheet, ScrollView, Separator } from 'tamagui'
import { useMedia } from 'tamagui'
import { Menu, LogOut, Users, ShoppingBag, Settings, Award, CreditCard, Receipt, ChevronRight, Store, FileSpreadsheet, DollarSign, BarChart, AlertTriangle, Mail } from '@tamagui/lucide-icons'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { useAdminPush } from '../../lib/useAdminPush'
import { colors } from '@casagrown/app/design-tokens'

type MenuItem = {
  label: string;
  path?: string;
  action?: 'logout';
}

type MenuGroup = {
  title: string;
  icon: any;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'USER MANAGEMENT',
    icon: Users,
    items: [
      { label: 'Staff & Roles', path: '/users' },
      { label: 'Members', path: '/members' },
      { label: 'Beta Testers', path: '/beta-testers' },
    ]
  },
  {
    title: 'MARKET CATEGORIES',
    icon: ShoppingBag,
    items: [
      { label: 'Sales Categories', path: '/sales-categories' },
      { label: 'Category Restrictions', path: '/category-restrictions' },
      { label: 'Product Restrictions', path: '/product-restrictions' },
    ]
  },
  {
    title: 'MARKET OPERATIONS',
    icon: Store,
    items: [
      { label: 'Market Settings & Hours', path: '/market-operations' },
      { label: 'Market Availability', path: '/market-availability' },
      { label: 'Receipt Footers', path: '/receipt-footers' },
    ]
  },
  {
    title: 'QUARANTINE ZONES',
    icon: AlertTriangle,
    items: [
      { label: 'Manage Quarantines', path: '/quarantine-zones' },
    ]
  },
  {
    title: 'FINANCIAL',
    icon: DollarSign,
    items: [
      { label: 'Cash Flow', path: '/cash-flow' },
      { label: 'Settlements & Stripe', path: '/settlements' },
      { label: 'Payout Queue', path: '/payouts' },
      { label: 'Chargebacks', path: '/disputes' },
      { label: 'Escalations', path: '/escalations' },
      { label: 'Redemption Methods', path: '/methods' },
    ]
  },
  {
    title: 'PLATFORM SETTINGS',
    icon: Settings,
    items: [
      { label: 'Settings & Fees', path: '/platform-settings' },
      { label: 'Post Type Expiration', path: '/post-policies' },
    ]
  },
  {
    title: 'CRM & MARKETING',
    icon: Mail,
    items: [
      { label: 'Landing Pages', path: '/crm/landing-pages' },
      { label: 'Leads', path: '/crm/leads' },
      { label: 'Email / SMS Campaigns', path: '/crm/campaigns' },
      { label: 'Audiences', path: '/crm/audiences' },
      { label: 'Audience Functions', path: '/crm/audience-functions' },
      { label: 'Assets', path: '/crm/assets' },
    ]
  },
  {
    title: 'REWARDS & INCENTIVES',
    icon: Award,
    items: [
      { label: 'Campaigns', path: '/campaigns' },
    ]
  },
  {
    title: 'SALES TAX RULES',
    icon: Receipt,
    items: [
      { label: 'Tax Rules', path: '/tax-rules' },
      { label: '1099 Thresholds', path: '/tax-reporting' },
    ]
  },
  {
    title: 'ACCOUNT',
    icon: LogOut,
    items: [
      { label: 'Sign Out', action: 'logout' },
    ]
  }
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const media = useMedia()
  
  // @ts-ignore - Match AppHeader.tsx pattern to determine Desktop screens correctly
  const isDesktop = isMounted ? (media.lg || media.xl || media.xxl) : true
  const isMobile = !isDesktop

  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  // Silently subscribe admin to push notifications on first load
  useAdminPush(user?.id)

  const handleLogout = async () => {
    await signOut()
    router.replace('/login')
  }

  const navigateTo = (path: string) => {
    router.push(path)
    setMenuOpen(false)
  }

  // Sidebar content component to reuse for both desktop AND mobile sheet
  const SidebarContent = () => (
    <YStack flex={1} padding="$4" gap="$4">
      <XStack alignItems="center" gap="$2" paddingBottom="$2">
        <img 
          src="/logo.png" 
          alt="CasaGrown" 
          style={{ width: 24, height: 24, objectFit: 'contain' }}
        />
        <Text fontSize="$6" fontWeight="bold" color={colors.green[800]}>
          CasaGrown Admin
        </Text>
      </XStack>
      
      <ScrollView flex={1} showsVerticalScrollIndicator={false}>
        <YStack gap="$6" paddingBottom="$8">
          {MENU_GROUPS.map((group) => (
            <YStack key={group.title} gap="$2">
              <XStack alignItems="center" gap="$2" paddingHorizontal="$2" paddingBottom="$1">
                <group.icon size={16} color={colors.gray[500]} />
                <Text fontSize="$2" fontWeight="700" color={colors.gray[500]} letterSpacing={0.5}>
                  {group.title}
                </Text>
              </XStack>
              <YStack gap="$1">
                {group.items.map((item) => {
                  if (item.action === 'logout') {
                    return (
                      <Button
                        key="logout"
                        chromeless
                        justifyContent="space-between"
                        paddingHorizontal="$3"
                        height="$4"
                        borderRadius="$2"
                        backgroundColor="transparent"
                        pressStyle={{ backgroundColor: colors.red[100] }}
                        hoverStyle={{ backgroundColor: colors.red[50] }}
                        onPress={handleLogout}
                      >
                        <Text color={colors.red[600]} fontWeight="600">
                          {item.label}
                        </Text>
                      </Button>
                    )
                  }

                  const isActive = pathname === item.path
                  return (
                    <Link key={item.path || item.label} href={item.path === '#' ? '' : (item.path || '')} passHref>
                      <Button
                        chromeless
                        justifyContent="space-between"
                        paddingHorizontal="$3"
                        height="$4"
                        borderRadius="$2"
                        backgroundColor={isActive ? colors.green[100] : 'transparent'}
                        pressStyle={{ backgroundColor: colors.green[200] }}
                        hoverStyle={{ backgroundColor: colors.green[50] }}
                        onPress={() => setMenuOpen(false)}
                      >
                        <Text 
                          color={isActive ? colors.green[800] : colors.gray[700]} 
                          fontWeight={isActive ? "600" : "400"}
                        >
                          {item.label}
                        </Text>
                        {isActive && <ChevronRight size={16} color={colors.green[600]} />}
                      </Button>
                    </Link>
                  )
                })}
              </YStack>
            </YStack>
          ))}
        </YStack>
      </ScrollView>
    </YStack>
  )

  return (
    <XStack flex={1} backgroundColor={colors.white} minHeight="100vh" flexDirection="row" $sm={{ flexDirection: 'column' }}>
      
      {/* 🖥️ DESKTOP SIDEBAR */}
      <YStack 
        display="flex"
        $sm={{ display: 'none' }}
          width={300} 
          borderRightWidth={1} 
          borderColor={colors.gray[200]} 
          backgroundColor={colors.gray[50]}
        >
          <SidebarContent />
        </YStack>

      {/* 📱 MOBILE HEADER (Hamburger Menu) */}
      <XStack 
        display="none"
        $sm={{ display: 'flex' }}
          alignItems="center" 
          justifyContent="space-between" 
          padding="$4" 
          borderBottomWidth={1} 
          borderColor={colors.gray[200]}
          backgroundColor={colors.white}
        >
          <XStack alignItems="center" gap="$2">
            <img 
              src="/logo.png" 
              alt="CasaGrown" 
              style={{ width: 24, height: 24, objectFit: 'contain' }}
            />
            <Text fontSize="$5" fontWeight="bold" color={colors.green[800]}>CasaGrown Admin</Text>
          </XStack>
          <Button icon={Menu} chromeless size="$4" onPress={() => setMenuOpen(true)} />
        </XStack>

      {/* 📱 MOBILE SHEET FOR SIDEBAR */}
      <Sheet 
        modal 
        open={menuOpen} 
        onOpenChange={setMenuOpen} 
        snapPoints={[85]}
        position={0}
      >
        <Sheet.Overlay />
        <Sheet.Frame backgroundColor={colors.white}>
          <Sheet.Handle />
          <SidebarContent />
        </Sheet.Frame>
      </Sheet>

      {/* MAIN CONTENT AREA */}
      <YStack flex={1} backgroundColor={colors.white} overflow="hidden">
        {/* We wrap children in a ScrollView so the page scrolls internally, keeping sidebar fixed */}
        <ScrollView flex={1}>
          <YStack flex={1} padding="$6" $sm={{ padding: '$4' }}>
            {children}
          </YStack>
        </ScrollView>
      </YStack>

    </XStack>
  )
}
