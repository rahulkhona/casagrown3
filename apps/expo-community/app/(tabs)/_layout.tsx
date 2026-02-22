import React from 'react'
import { Tabs } from 'expo-router'
import { Home, ShoppingBag, Tag, Menu as MenuIcon, MessagesSquare } from '@tamagui/lucide-icons'
import { colors } from '@casagrown/app/design-tokens'

export default function TabLayout() {
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
        }} 
      />
      <Tabs.Screen 
        name="orders" 
        options={{ 
          title: 'Orders',
          tabBarIcon: ({ color }) => <ShoppingBag color={color as any} size={24} />,
        }} 
      />
      <Tabs.Screen 
        name="offers" 
        options={{ 
          title: 'Offers',
          tabBarIcon: ({ color }) => <Tag color={color as any} size={24} />,
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
    </Tabs>
  )
}
