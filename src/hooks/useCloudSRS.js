import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../utils/firebase';
import { loadSRS, reviewEntry } from '../utils/srs';

const SRS_LOAD_TIMEOUT_MS = 1500;

// 직전 사용자 uid를 기억해서 익명→Google 연동(signInWithPopup으로 uid가 바뀐 경우)
// 시 SRS 진도를 새 계정으로 이전한다. linkWithPopup으로 uid가 유지되는 경우는
// 자동으로 그대로 보존된다.
const PREV_UID_KEY = 'srs_prev_uid';

function isObjectEmpty(value) {
  return !value || typeof value !== 'object' || Object.keys(value).length === 0;
}

async function migrateAnonymousSrsIfNeeded(prevUid, nextUid) {
  if (!prevUid || !nextUid || prevUid === nextUid) return null;

  const prevRef = doc(db, 'users', prevUid, 'settings', 'srs_data');
  const nextRef = doc(db, 'users', nextUid, 'settings', 'srs_data');
  try {
    const [prevSnap, nextSnap] = await Promise.all([getDoc(prevRef), getDoc(nextRef)]);
    if (!prevSnap.exists()) return null;
    const prevData = prevSnap.data();
    if (isObjectEmpty(prevData)) return null;

    // 새 계정에 이미 SRS가 있으면 (Google 계정으로 이전에 사용한 적이 있다는 뜻)
    // 양쪽을 병합한다. 같은 카드 key가 있으면 count가 더 큰 쪽 우선.
    const nextData = nextSnap.exists() ? nextSnap.data() : {};
    const merged = { ...nextData };
    for (const [key, entry] of Object.entries(prevData)) {
      const existing = merged[key];
      if (!existing || (Number(entry?.count || 0) > Number(existing?.count || 0))) {
        merged[key] = entry;
      }
    }
    await setDoc(nextRef, merged, { merge: true });
    return merged;
  } catch (err) {
    console.warn('SRS 진도 마이그레이션 실패:', err);
    return null;
  }
}

export function useCloudSRS() {
  const [srs, setSrs] = useState(() => loadSRS());
  const [srsLoading, setSrsLoading] = useState(false);
  const prevUidRef = useRef(typeof localStorage !== 'undefined' ? localStorage.getItem(PREV_UID_KEY) : null);

  useEffect(() => {
    let unsubscribeSnapshot = null;
    setSrsLoading(true);
    const openStudyTimer = setTimeout(() => {
      setSrsLoading(false);
    }, SRS_LOAD_TIMEOUT_MS);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (!user) {
        setSrs({});
        setSrsLoading(false);
        return;
      }

      // uid가 바뀌었으면 이전 uid의 SRS를 새 uid로 마이그레이션 시도.
      // (linkWithPopup은 uid를 유지하므로 이 경로를 타지 않음.
      //  signInWithPopup fallback으로 uid가 바뀐 경우만 동작.)
      const prevUid = prevUidRef.current;
      if (prevUid && prevUid !== user.uid) {
        await migrateAnonymousSrsIfNeeded(prevUid, user.uid);
      }
      prevUidRef.current = user.uid;
      try { localStorage.setItem(PREV_UID_KEY, user.uid); } catch {}

      const srsRef = doc(db, 'users', user.uid, 'settings', 'srs_data');
      unsubscribeSnapshot = onSnapshot(
        srsRef,
        async (docSnap) => {
          if (docSnap.exists()) {
            setSrs(docSnap.data());
          } else {
            // 로컬 → 클라우드 SRS 마이그레이션. 쓰기 성공을 기다린 뒤에만
            // 로컬 데이터를 지운다.
            try {
              const localRaw = localStorage.getItem('card_srs');
              if (localRaw) {
                const localData = JSON.parse(localRaw);
                if (localData && Object.keys(localData).length > 0) {
                  await setDoc(srsRef, localData, { merge: true });
                  localStorage.removeItem('card_srs');
                  setSrs(localData);
                }
              }
            } catch (e) {
              console.warn('로컬 SRS → 클라우드 마이그레이션 실패:', e);
            }
          }
          setSrsLoading(false);
        },
        (error) => {
          console.error('SRS 리스너 오류:', error);
          setSrsLoading(false);
        }
      );
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
      setDoc(srsRef, { [key]: nextEntry }, { merge: true }).catch((err) => {
        console.warn('SRS 동기화 실패 (로컬에는 반영됨):', err);
      });
      return nextState;
    });
  }, []);

  return { srs, srsLoading, review };
}
