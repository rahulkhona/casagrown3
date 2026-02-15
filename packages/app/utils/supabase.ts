import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Android emulator uses 10.0.2.2 to reach host, but iOS Simulator uses 127.0.0.1
const supabaseUrl = Platform.OS === "ios"
  ? rawSupabaseUrl.replace("10.0.2.2", "127.0.0.1")
  : rawSupabaseUrl;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});

// Dev-mode early warning for missing env vars
if (
  typeof __DEV__ !== "undefined" && __DEV__ &&
  (!supabaseUrl || !supabaseAnonKey)
) {
  console.warn(
    "⚠️ Missing Supabase env vars — check .env files\n" +
      `  SUPABASE_URL: ${supabaseUrl ? "✅" : "❌ empty"}\n` +
      `  SUPABASE_ANON_KEY: ${supabaseAnonKey ? "✅" : "❌ empty"}`,
  );
}
