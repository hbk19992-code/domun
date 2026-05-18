import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA3ewD2x7zZnDxG2JSr2PIfff9OXaw9vRo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dumun-49c44.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dumun-49c44",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dumun-49c44.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "282344844786",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:282344844786:web:4b063c979a208c980fcf6b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider(); // 구글 로그인 프로바이더 추가
