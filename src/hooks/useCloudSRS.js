import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../utils/firebase';
import { loadSRS, reviewEntry } from '../utils/srs';

const SRS_LOAD_TIMEOUT_MS = 1500;

export function useCloudSRS() {
  const [srs, setSrs] = useState(() => loadSRS());
  const [srsLoading, setSrsLoading] = useState(false);

  useEffect(() => {
    let unsubscribeSnapshot = null;
    setSrsLoading(true);
    const openStudyTimer = setTimeout(() => {
      setSrsLoading(false);
    }, SRS_LOAD_TIMEOUT_MS);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // 새로운 인증 흐름이 트리거되면 기존 내부 스냅샷 연결 해제
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (user) {
        const srsRef = doc(db, 'users', user.uid, 'settings', 'srs_data');
        unsubscribeSnapshot = onSnapshot(srsRef, (docSnap) => {
          if (docSnap.exists()) {
            setSrs(docSnap.data());
          } else {
            // 로컬 -> 클라우드 SRS 마이그레이션
            const localRaw = localStorage.getItem('card_srs');
            if (localRaw) {
              const localData = JSON.parse(localRaw);
              setDoc(srsRef, localData);
              localStorage.removeItem('card_srs');
              setSrs(localData);
            }
          }
          setSrsLoading(false);
        }, (error) => {
          console.error("SRS 리스너 오류:", error);
          setSrsLoading(false);
        });
      } else {
        setSrs({});
        setSrsLoading(false);
      }
    });

    return () => {
      clearTimeout(openStudyTimer);
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const review = useCallback(async (card, result, getCardKey) => {
    const user = auth.currentUser;
    if (!user) return;
    const key = getCardKey(card);
    const srsRef = doc(db, 'users', user.uid, 'settings', 'srs_data');
    
    setSrs((prev) => {
      const nextEntry = reviewEntry(prev[key], result);
      const nextState = { ...prev, [key]: nextEntry };
      setDoc(srsRef, { [key]: nextEntry }, { merge: true });
      return nextState;
    });
  }, []);

  return { srs, srsLoading, review };
}
