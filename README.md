# Onitama

Live online Onitama — create a room, share the 6-letter code (or link), duel in real time.

Fan-made online table for the Onitama board game by Shimpei Sato. Built with React + Vite; realtime sync over Firestore with anonymous auth (no accounts).

## Dev

```
npm install
npm run dev
```

## Deploy

Pushes to `main` deploy to Vercel (onitama.novalabsos.com). Firestore security rules for the `onitama_rooms` collection live in the nova-os-web repo (`firestore.rules`) and deploy from there.
