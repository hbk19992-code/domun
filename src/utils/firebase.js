import { initializeApp } from 'firebase/app';
import {
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

// 오프라인 영구 캐시(IndexedDB)
// 재방문/새로고침 시 캐시에서 먼저 읽고, 서버와는 변경분(델타)만 동기화한다.
// 같은 카드를 반복해서 전부 다시 읽는 과금을 크게 줄인다.
//   - getFirestore() 대신 initializeFirestore() 를 써야 캐시 설정이 적용됨
//   - persistentMultipleTabManager: 여러 탭을 동시에 열어도 안전
//   - Firestore 초기화는 이 파일 한 곳뿐이므로 항상 다른 호출보다 먼저 실행됨
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
