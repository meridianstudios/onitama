// Shares the Nova OS Firebase project (nova-58d75) — the onitama_rooms
// collection and its security rules live alongside Nova's. Web API keys are
// identifiers, not secrets; access control is entirely in Firestore rules.
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const app = initializeApp({
  apiKey: "AIzaSyD9xXEKlq-K3pyZJr-7hzY80sNcAmiclBA",
  authDomain: "nova-58d75.firebaseapp.com",
  projectId: "nova-58d75",
});

export const db = getFirestore(app);
export const auth = getAuth(app);

/** Resolve with a signed-in anonymous uid (players don't need accounts). */
export function ensureAuth() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, u => {
      if (u) { stop(); resolve(u.uid); }
    });
    if (!auth.currentUser) signInAnonymously(auth).catch(reject);
  });
}
