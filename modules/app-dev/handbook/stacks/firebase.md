---
stack: firebase
kind: backend
glyph: FB
color: '#F57C00'
packages:
- firebase
env:
- EXPO_PUBLIC_FIREBASE_API_KEY
- EXPO_PUBLIC_FIREBASE_PROJECT_ID
conflicts:
- supabase
good_for: Quick auth, realtime sync between phones and push notifications.
watch_out: NoSQL data is harder to query; Google lock-in.
docs:
- title: "Firebase · Add Firebase to a JavaScript project"
  url: https://firebase.google.com/docs/web/setup
---
# Firebase

Google's app backend: Firestore, auth, cloud messaging.
