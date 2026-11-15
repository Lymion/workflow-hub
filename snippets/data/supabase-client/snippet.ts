// One Supabase client for the whole Expo app, with the session kept in secure storage.
import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const storage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,      // CHANGE: set in .env
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, // CHANGE: set in .env (anon key only, never the service key)
  { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } },
);
