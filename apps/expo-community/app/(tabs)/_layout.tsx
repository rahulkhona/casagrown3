import React from 'react'
import { Stack } from 'expo-router'

/**
 * Tabs Layout - Now uses Stack (no visible tab bar)
 * 
 * Navigation is handled by header menu in FeedScreen,
 * so we don't need a bottom tab bar.
 * 
 * The name is kept as "(tabs)" for routing compatibility,
 * but we use Stack instead of Tabs to hide the tab bar.
 */
export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen 
        name="feed" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="profile" 
        options={{ 
          headerShown: false,
        }} 
      />
    </Stack>
  )
}
