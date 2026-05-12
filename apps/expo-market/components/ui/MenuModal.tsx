/**
 * MenuModal — native equivalent of next-market's hamburger slideMenu.
 *
 * Sections match Navbar.tsx exactly:
 *   Navigation: My Produce Stand, Earnings, Wallet, Helping, Following
 *   Account:    Profile, Settings
 *   Support:    How It Works, Contact Support, Terms, Privacy
 *   Sign Out
 */

import React from 'react';
import {
  Modal, View, Text, Pressable, ScrollView, StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { colors, spacing, radius } from '../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface MenuItem {
  icon: string;
  label: string;
  route: string;
  locked?: boolean;
}

const NAV_ITEMS: MenuItem[] = [
  { icon: '🏪', label: 'My Produce Stand', route: '/my-booth/index' },
  { icon: '💰', label: 'Earnings & Activity', route: '/earnings/index' },
  { icon: '💸', label: 'Wallet', route: '/earnings/payout' },
  { icon: '🤝', label: 'Helping', route: '/helping' },
  { icon: '❤️', label: 'Following', route: '/following' },
];

const ACCOUNT_ITEMS: MenuItem[] = [
  { icon: '👤', label: 'Profile', route: '/profile' },
  { icon: '⚙️', label: 'Settings', route: '/settings' },
];

const SUPPORT_ITEMS: MenuItem[] = [
  { icon: '📖', label: 'How It Works', route: '/guide' },
  { icon: '📋', label: 'Contact Support', route: '/voice/submit' },
  { icon: '📄', label: 'Terms of Use', route: '/terms' },
];

export function MenuModal({ visible, onClose }: Props) {
  const router = useRouter();
  const { user, isLoggedIn, isProfileComplete } = useAuth();
  const isProfileLocked = !isLoggedIn || !isProfileComplete;

  const navigate = (route: string, requiresProfile = false) => {
    onClose();
    if (requiresProfile && isProfileLocked) {
      router.push('/(auth)/login' as any);
      return;
    }
    router.push(route as any);
  };

  const signOut = async () => {
    onClose();
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut({ scope: 'local' });
          router.replace('/(tabs)' as any);
        }
      }
    ]);
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  );

  const Item = ({ icon, label, onPress, locked }: { icon: string; label: string; onPress: () => void; locked?: boolean }) => (
    <Pressable style={({ pressed }) => [styles.item, pressed && styles.itemPressed]} onPress={onPress}>
      <Text style={styles.itemIcon}>{icon}</Text>
      <Text style={[styles.itemLabel, locked && styles.itemLabelLocked]}>{label}</Text>
      {locked && <Text style={styles.lockIcon}>🔒</Text>}
      {!locked && <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />}
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Menu</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.gray[700]} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* User info */}
          {isLoggedIn && (
            <Pressable style={styles.userRow} onPress={() => navigate('/profile')}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {user?.email?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user?.email?.split('@')[0] || 'Account'}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
            </Pressable>
          )}

          {/* Sign in prompt when logged out */}
          {!isLoggedIn && (
            <Pressable style={styles.signInRow} onPress={() => { onClose(); router.push('/(auth)/login' as any); }}>
              <Text style={styles.signInIcon}>🔑</Text>
              <Text style={styles.signInLabel}>Sign In</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.green[700]} />
            </Pressable>
          )}

          {/* Navigation */}
          {isLoggedIn && (
            <Section title="Navigation">
              {NAV_ITEMS.map(item => (
                <Item
                  key={item.route}
                  icon={item.icon}
                  label={item.label}
                  locked={isProfileLocked}
                  onPress={() => navigate(item.route, true)}
                />
              ))}
            </Section>
          )}

          {/* Account */}
          {isLoggedIn && (
            <Section title="Account">
              {ACCOUNT_ITEMS.map(item => (
                <Item key={item.route} icon={item.icon} label={item.label} onPress={() => navigate(item.route)} />
              ))}
            </Section>
          )}

          {/* Support & Legal */}
          <Section title="Support & Legal">
            {SUPPORT_ITEMS.map(item => (
              <Item key={item.route} icon={item.icon} label={item.label} onPress={() => navigate(item.route)} />
            ))}
          </Section>

          {/* Sign Out */}
          {isLoggedIn && (
            <Pressable style={[styles.item, styles.signOutItem]} onPress={signOut}>
              <Text style={styles.itemIcon}>🚪</Text>
              <Text style={[styles.itemLabel, styles.signOutLabel]}>Sign Out</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 18, color: colors.gray[900] },
  closeBtn: { padding: 4 },
  scroll: { paddingBottom: 40 },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.green[100],
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontFamily: 'Inter-Bold', fontSize: 18, color: colors.green[700] },
  userInfo: { flex: 1 },
  userName: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.gray[900] },
  userEmail: { fontFamily: 'Inter', fontSize: 12, color: colors.gray[500], marginTop: 1 },

  signInRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  signInIcon: { fontSize: 22 },
  signInLabel: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 16, color: colors.green[700] },

  section: { paddingTop: 20, paddingBottom: 4 },
  sectionLabel: {
    fontFamily: 'Inter-SemiBold', fontSize: 11, color: colors.gray[400],
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: spacing.lg, paddingBottom: 4,
  },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.lg, paddingVertical: 13,
  },
  itemPressed: { backgroundColor: colors.gray[50] },
  itemIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  itemLabel: { flex: 1, fontFamily: 'Inter-Medium', fontSize: 15, color: colors.gray[800] },
  itemLabelLocked: { color: colors.gray[400] },
  lockIcon: { fontSize: 14 },

  signOutItem: { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.gray[100] },
  signOutLabel: { color: '#dc2626' },
});
