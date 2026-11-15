# Supabase client (Expo)

What it does: one shared Supabase client; sessions persist in the device's secure store.

Dependencies: `@supabase/supabase-js`, `expo-secure-store`, `react-native-url-polyfill`.

Change points: the two env vars (marked `CHANGE:`). Put them in `.env`; never commit real keys.
