import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

type Profile = {
  id: string;
  full_name: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  zip_code: string | null;
  phone: string | null;
  avatar_url: string | null;
  tos_accepted_at: string | null;
  phone_verified_at: string | null;
  profile_completed_at: string | null;
  home_community_h3_index: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isProfileComplete: boolean;
  signInWithOtp: (email: string) => Promise<{ error: any }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: any; session: Session | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id);
      else setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id);
      else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, street_address, city, state, state_code, zip_code, phone, avatar_url, tos_accepted_at, phone_verified_at, profile_completed_at, home_community_h3_index')
        .eq('id', userId)
        .single();
      setProfile(data || null);
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }

  const signInWithOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error };
  };

  const verifyOtp = async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    return { error, session: data?.session || null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  const user = session?.user || null;
  const isLoggedIn = !!session;
  const isProfileComplete = !!(profile?.full_name && profile?.street_address && profile?.tos_accepted_at);

  return (
    <AuthContext.Provider value={{
      session, user, profile, isLoading, isLoggedIn, isProfileComplete,
      signInWithOtp, verifyOtp, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
