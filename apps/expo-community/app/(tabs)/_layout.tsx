import React, { useState, useEffect, useCallback } from 'react'
import { Tabs } from 'expo-router'
import { Home, ShoppingBag, Tag, Menu as MenuIcon, MessagesSquare } from '@tamagui/lucide-icons'
import { colors } from '@casagrown/app/design-tokens'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { getUnreadChatCount } from '@casagrown/app/features/chat/chat-service'
import { getOpenOrderCount } from '@casagrown/app/features/orders/order-service'
import { getOpenOfferCount } from '@casagrown/app/features/offers/offer-service'

export default function TabLayout() {
  const { user } = useAuth()
  const [unreadChats, setUnreadChats] = useState(0)
  const [openOrders, setOpenOrders] = useState(0)
  const [openOffers, setOpenOffers] = useState(0)

  const fetchCounts = useCallback(async () => {
    if (!user?.id) return
    try {
      const [chats, orders, offers] = await Promise.all([
        getUnreadChatCount(user.id),
        getOpenOrderCount(user.id),
        getOpenOfferCount(user.id),
      ])
      setUnreadChats(chats)
      setOpenOrders(orders)
      setOpenOffers(offers)
    } catch (err) {
      console.warn('Badge count fetch failed:', err)
    }
  }, [user?.id])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [fetchCounts])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green[600],
      }}
    >
      <Tabs.Screen 
        name="feed" 
        options={{ 
          title: 'Feed',
          tabBarIcon: ({ color }) => <Home color={color as any} size={24} />,
        }} 
      />
      <Tabs.Screen 
        name="invite" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="buy-points" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="delegate" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="accept-delegation" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="create-post" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="my-posts" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="chats" 
        options={{ 
          title: 'Chats',
          tabBarIcon: ({ color }) => <MessagesSquare color={color as any} size={24} />,
          tabBarBadge: unreadChats > 0 ? unreadChats : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.red[500] },
        }} 
      />
      <Tabs.Screen 
        name="orders" 
        options={{ 
          title: 'Orders',
          tabBarIcon: ({ color }) => <ShoppingBag color={color as any} size={24} />,
          tabBarBadge: openOrders > 0 ? openOrders : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.red[500] },
        }} 
      />
      <Tabs.Screen 
        name="offers" 
        options={{ 
          title: 'Offers',
          tabBarIcon: ({ color }) => <Tag color={color as any} size={24} />,
          tabBarBadge: openOffers > 0 ? openOffers : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.red[500] },
        }} 
      />
      <Tabs.Screen 
        name="menu" 
        options={{ 
          title: 'Menu',
          tabBarIcon: ({ color }) => <MenuIcon color={color as any} size={24} />,
        }} 
      />
      <Tabs.Screen 
        name="chat" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="redeem" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
      <Tabs.Screen 
        name="transaction-history" 
        options={{ 
          href: null,
          headerShown: false,
        }} 
      />
    </Tabs>
  )
}
