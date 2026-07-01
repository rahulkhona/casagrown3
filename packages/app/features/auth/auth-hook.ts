"use client";

import React, { useContext, useEffect, useState } from "react";
import { createClient, Session, User } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { authStorage } from "./auth-storage";

const getSupabaseUrl = () => {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";

  // Normalize Localhost URLs for Native Platforms
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost") ||
    url.includes("10.0.2.2");

  if (isLocal) {
    if (Platform.OS === "android") {
      console.log("🤖 [Android] Enforcing 10.0.2.2");
      return url.replace("127.0.0.1", "10.0.2.2").replace(
        "localhost",
        "10.0.2.2",
      );
    }
    if (Platform.OS === "ios") {
      // iOS Simulator MUST use localhost (maps to Mac)
      // 10.0.2.2 is unreachable on iOS
      console.log("🍎 [iOS] Enforcing localhost");
      return url.replace("127.0.0.1", "localhost").replace(
        "10.0.2.2",
        "localhost",
      );
    }
  }

  console.log(`🔧 [${Platform.OS}] Using Supabase URL:`, url);
  return url;
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  // Local Supabase dev anon key (safe to commit — it's the default demo key)
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/**
 * Singleton Supabase client.
 *
 * CRITICAL: In Next.js dev mode, HMR re-executes module-level code. Without
 * caching on globalThis, each reload creates a NEW GoTrueClient that competes
 * for navigator.locks, causing AbortError → infinite loading spinners.
 */
const SUPABASE_GLOBAL_KEY = "__casagrown_supabase_client__";

function getOrCreateClient() {
  const g = globalThis as any;
  if (g[SUPABASE_GLOBAL_KEY]) {
    return g[SUPABASE_GLOBAL_KEY];
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
      // Use a no-op lock instead of navigator.locks.
      // navigator.locks can hang indefinitely when a page is opened
      // via window.open() from a different origin (e.g. Contact Support
      // link on port 3000 opening Community Voice on port 3002).
      // This matches the Supabase library's own default for React Native
      // (single-process environments that don't need cross-tab coordination).
      lock: async (
        _name: string,
        _acquireTimeout: number,
        fn: () => Promise<any>,
      ) => {
        return await fn();
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
      heartbeatIntervalMs: 15000,
      reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** tries, 10000),
    },
  });
  g[SUPABASE_GLOBAL_KEY] = client;
  return client;
}

export const supabase = getOrCreateClient();

// ── Reconnect realtime when app returns from background ──
// Android emulators (and sometimes real devices) silently drop WebSocket
// connections when the app is backgrounded.
// IMPORTANT: We must NOT call disconnect()/connect() — that destroys ALL
// existing channels (including presence). The Supabase client's built-in
// reconnectAfterMs handles reconnection automatically. We just need to
// ensure the socket transport is aware the connection may have dropped.
if (Platform.OS !== "web") {
  const { AppState } = require("react-native");
  let lastState = "active";
  AppState.addEventListener("change", (nextState: string) => {
    if (lastState.match(/inactive|background/) && nextState === "active") {
      console.log("📡 App resumed — checking Supabase realtime connection");
      // Only reconnect if the socket is actually disconnected
      const socket = (supabase.realtime as any)?.conn;
      if (socket && socket.readyState !== 1 /* WebSocket.OPEN */) {
        console.log("📡 WebSocket not open, triggering reconnect");
        supabase.realtime.connect();
      }
    }
    lastState = nextState;
  });
}

// =============================================================================
// Auth Context — shared state across all consumers
// =============================================================================

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True when the user has accepted the Terms of Service (from DB) */
  tosAccepted: boolean;
};

type AuthContextValue = AuthState & {
  signInWithOtp: (email: string) => Promise<{ otpToken?: string }>;
  verifyOtp: (email: string, token: string) => Promise<any>;
  signInWithOAuth: (provider: "google" | "apple" | "facebook") => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read tos_accepted_at from the database and update shared state */
  refreshTosStatus: () => Promise<void>;
  /** @deprecated Use refreshTosStatus() instead — kept for backward compat */
  markTosAccepted: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * AuthProvider — wrap your app with this once (in layout).
 * All useAuth() consumers share the same state instance.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
    tosAccepted: false,
  });

  useEffect(() => {
    let mounted = true;

    // Check active session
    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      if (session?.user) {
        // Guard: verify profile actually exists in DB (protects against stale sessions after db reset)
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, tos_accepted_at")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!mounted) return;

        if (!profile && !profileError) {
          // Session is stale — user no longer exists in db
          console.warn(
            "⚠️ Stale session detected (no profile row). Auto-signing out.",
          );
          await supabase.auth.signOut();
          if (!mounted) return;
          setState({
            session: null,
            user: null,
            loading: false,
            tosAccepted: false,
          });
          return;
        }

        const tosAccepted = !!profile?.tos_accepted_at;
        setState({ session, user: session.user, loading: false, tosAccepted });
        return;
      }
      if (mounted) {
        setState({ session, user: null, loading: false, tosAccepted: false });
      }
    }).catch((err: any) => {
      // Handle AbortError from navigator.locks when page navigates away
      if (err?.name === "AbortError") {
        console.debug("Auth: getSession aborted (page navigated away)");
        // Still set loading: false so the auth guard doesn't hang on a spinner
        if (mounted) {
          setState({
            session: null,
            user: null,
            loading: false,
            tosAccepted: false,
          });
        }
        return;
      }
      console.error("Auth: getSession error:", err);
      if (mounted) {
        setState({
          session: null,
          user: null,
          loading: false,
          tosAccepted: false,
        });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: Session | null) => {
        if (!mounted) return;
        try {
          if (session?.user) {
            // Re-check ToS on auth state change (e.g. after login)
            const { data: profile } = await supabase
              .from("profiles")
              .select("tos_accepted_at")
              .eq("id", session.user.id)
              .maybeSingle();
            if (!mounted) return;
            setState({
              session,
              user: session.user,
              loading: false,
              tosAccepted: !!profile?.tos_accepted_at,
            });
          } else {
            setState({
              session,
              user: null,
              loading: false,
              tosAccepted: false,
            });
          }
        } catch (err: any) {
          if (err?.name === "AbortError") {
            console.debug(
              "Auth: onAuthStateChange aborted (page navigated away)",
            );
            return;
          }
          console.error("Auth: onAuthStateChange error:", err);
          if (mounted) {
            setState({
              session: null,
              user: null,
              loading: false,
              tosAccepted: false,
            });
          }
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Auth methods (stable across renders) ──

  const signInWithOtp = async (
    email: string,
  ): Promise<{ otpToken?: string }> => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
    });
    if (error) throw error;

    // DEV MODE: Fetch OTP from local Supabase's Mailpit (email catcher)
    // Mailpit runs on port 54324 in local Supabase
    if (__DEV__ || process.env.NODE_ENV === "development") {
      try {
        // Wait a moment for the email to be captured
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Android emulator needs 10.0.2.2 to reach host machine
        const mailpitUrl = Platform.OS === "android"
          ? "http://10.0.2.2:54324"
          : "http://localhost:54324";

        // Add 3-second timeout to prevent blocking UI
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
          // Mailpit API: search messages sent to this email
          const listResponse = await fetch(
            `${mailpitUrl}/api/v1/search?query=to:${encodeURIComponent(email)}`,
            {
              signal: controller.signal,
            },
          );
          clearTimeout(timeoutId);

          if (listResponse.ok) {
            const data = await listResponse.json();
            const messages = data.messages || [];
            if (messages.length > 0) {
              // Get most recent message (first in list, sorted by newest)
              const latestMsgId = messages[0].ID;
              const msgResponse = await fetch(
                `${mailpitUrl}/api/v1/message/${latestMsgId}`,
                {
                  signal: controller.signal,
                },
              );
              if (msgResponse.ok) {
                const msgData = await msgResponse.json();
                // Extract 6-digit OTP from email text body or snippet
                const textBody = msgData.Text || msgData.Snippet || "";
                const otpMatch = textBody.match(/\b(\d{6})\b/);
                if (otpMatch) {
                  console.log("🔑 [DEV] OTP from Mailpit:", otpMatch[1]);
                  return { otpToken: otpMatch[1] };
                }
              }
            }
          }
        } catch (fetchError: any) {
          if (fetchError.name === "AbortError") {
            console.warn(
              "⏱️ Mailpit fetch timed out - proceeding without dev OTP",
            );
          } else {
            throw fetchError;
          }
        }
      } catch (e) {
        console.warn("Could not fetch OTP from Mailpit:", e);
      }
    }

    return {}; // OTP sent, but token not available
  };

  const verifyOtp = async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error) throw error;
    return data;
  };

  const signInWithOAuth = async (provider: "google" | "apple" | "facebook") => {
    console.log(`[Auth] Env: ${process.env.NODE_ENV}, Provider: ${provider}`);

    if (process.env.NODE_ENV === "development") {
      console.log("🧪 [Dev] Mocking Social Login for:", provider);
      const { error } = await supabase.auth.signInWithPassword({
        email: "mock@social.com",
        password: "test1234",
      });
      if (error) {
        console.error("❌ Mock Login Failed:", error);
        throw error;
      }
      return;
    }

    // Standard flow (Future/Prod)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: Platform.OS === 'web' ? window.location.href : 'casagrowncom://login',
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    // Explicitly clear persisted auth tokens to prevent stale session issues
    try {
      if (Platform.OS === "web") {
        // Clear all Supabase auth keys from localStorage
        if (typeof window !== "undefined" && window.localStorage) {
          const keysToRemove = Object.keys(window.localStorage).filter(
            (k) => k.startsWith("sb-") || k.startsWith("supabase."),
          );
          keysToRemove.forEach((k) => window.localStorage.removeItem(k));
        }
      } else {
        // Native: clear from SecureStore (Supabase stores session under this key)
        const SecureStore = require("expo-secure-store");
        // Default Supabase storage key pattern
        await SecureStore.deleteItemAsync("supabase.auth.token").catch(
          () => {},
        );
        // Also try the project-specific key format
        const projectRef = supabaseUrl.match(/\/\/([^.]+)/)?.[1] || "";
        if (projectRef) {
          await SecureStore.deleteItemAsync(
            `sb-${projectRef}-auth-token`,
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Could not clear auth storage:", e);
    }
    // Force state to logged out
    setState({ session: null, user: null, loading: false, tosAccepted: false });
  };

  /** Re-read tos_accepted_at from the database and update shared state */
  const refreshTosStatus = async () => {
    const userId = state.user?.id;
    if (!userId) return;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("tos_accepted_at")
        .eq("id", userId)
        .maybeSingle();
      setState((prev) => ({ ...prev, tosAccepted: !!profile?.tos_accepted_at }));
    } catch (err) {
      console.warn("refreshTosStatus: failed to read DB", err);
    }
  };

  /** @deprecated Use refreshTosStatus() instead */
  const markTosAccepted = () => {
    setState((prev) => ({ ...prev, tosAccepted: true }));
  };

  const value: AuthContextValue = {
    ...state,
    signInWithOtp,
    verifyOtp,
    signInWithOAuth,
    signOut,
    refreshTosStatus,
    markTosAccepted,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

/**
 * useAuth — returns shared auth state from the nearest AuthProvider.
 *
 * Falls back to a standalone hook if no provider is found (backward compat
 * for tests that don't wrap with AuthProvider).
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "useAuth must be used within an <AuthProvider>. " +
      "Wrap your app root with <AuthProvider> in layout.tsx.",
    );
  }
  return ctx;
}
