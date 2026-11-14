---
stack: supabase
kind: backend
glyph: SB
color: '#249361'
packages:
- '@supabase/supabase-js'
env:
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY
conflicts:
- firebase
good_for: Sign-in, a real Postgres database and file storage on a free tier. Realtime updates built in.
watch_out: Needs internet; keys live in .env.
---
# Supabase

Postgres + auth + storage + realtime. Use the anon key in apps; never ship the service key.
