import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Vite 환경변수 우선 + 하드코딩 fallback.
// 보안 노트: Firebase 웹 API 키는 본질적으로 "공개되어도 무방한 식별자"지만,
// 데이터 보호는 Firestore 보안 규칙에 의존한다. 키를 회전할 때는 콘솔에서
// 새 키 발급 후 환경변수만 갱신하면 되며 코드 fallback은 그대로 두어도 된다.
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
