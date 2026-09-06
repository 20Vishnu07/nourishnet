import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDWeFqA4ncnwCnjnmT1b92i2Lboolu7o6U",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "nourishnet-c0f5c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "nourishnet-c0f5c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "nourishnet-c0f5c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "197488859314",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:197488859314:web:f659aae50adaa251ce51ab",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { auth, RecaptchaVerifier, signInWithPhoneNumber, firebaseConfig };
export type { ConfirmationResult };

