// Firebase web-app config for Onitama's OWN Firebase project.
//
// To (re)generate: Firebase console → Project settings → Your apps → the
// web app → SDK setup and configuration, or:
//   npx firebase-tools apps:sdkconfig web --project <project-id>
//
// A web apiKey is an identifier, not a secret — access control lives
// entirely in firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDMirkB6R0vUtf0t1kGbwRuQZ07PsTw2Vo",
  authDomain: "onitama-duel.firebaseapp.com",
  projectId: "onitama-duel",
};

export const isConfigured = firebaseConfig.apiKey !== "REPLACE_ME";
