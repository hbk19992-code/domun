import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
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

function isMacSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg/i.test(ua);
  return isSafari && /mac/i.test(platform);
}

function createFirestore(appInstance) {
  const baseSettings = { experimentalAutoDetectLongPolling: true };

  try {
    if (isMacSafari()) {
      // Mac Safari에서 IndexedDB 영구 캐시가 멈추는 사례가 있어 메모리 캐시로 우회한다.
      return initializeFirestore(appInstance, baseSettings);
    }

    return initializeFirestore(appInstance, {
      ...baseSettings,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (error) {
    console.warn('Firestore cache setup failed; falling back to default Firestore.', error);
    return getFirestore(appInstance);
  }
}

export const db = createFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
