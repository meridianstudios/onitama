// Firebase web-app config for Onitama's OWN Firebase project.
//
// To (re)generate: Firebase console → Project settings → Your apps → the
// web app → SDK setup and configuration, or:
//   npx firebase-tools apps:sdkconfig web --project <project-id>
//
// A web apiKey is an identifier, not a secret — access control lives
// entirely in firestore.rules.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
};

export const isConfigured = firebaseConfig.apiKey !== "REPLACE_ME";
