// Firebase wiring. The project config lives in firebase-config.js — Onitama
// runs on its own dedicated Firebase project (one collection, anonymous
// auth), fully independent of any other app.
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { firebaseConfig, isConfigured } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

/** Resolve with a signed-in anonymous uid (players don't need accounts). */
export function ensureAuth() {
  if (!isConfigured) {
    return Promise.reject(new Error("Firebase project not configured yet — see src/firebase-config.js."));
  }
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, u => {
      if (u) { stop(); resolve(u.uid); }
    });
    if (!auth.currentUser) signInAnonymously(auth).catch(reject);
  });
}
