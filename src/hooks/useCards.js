import { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, query } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../utils/firebase';
import { builtinCards } from '../data/mnemonics';
import { isDuplicate } from '../utils/dedup';

export function useCards() {
  const [userCards, setUserCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);

  useEffect(() => {
    let unsubscribeSnapshot = null;

    // 1. Auth 인증 상태 변화를 먼저 감시 (새로고침 시 세션 복구 속도 최적화)
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // 로그인된 유저가 없다면 익명 로그인 수행
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("익명 로그인 실패:", err);
          setLoading(false);
        }
        return;
      }

      // 유저가 확실히 존재할 때 UID 바인딩
      const currentUid = user.uid;
      setUid(currentUid);

      // 혹시 기존에 연결된 스냅샷 리스너가 있다면 중복 방지를 위해 해제
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }

      // 2. 인증이 완료된 시점에만 확실하게 Firestore 리스너 연결
      const cardsRef = collection(db, 'users', currentUid, 'cards');
      const q = query(cardsRef);

      unsubscribeSnapshot = onSnapshot(q, async (snapshot) => {
        let fetched = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));

        // 로컬 데이터 자동 마이그레이션 이관 로직
        const localRaw = localStorage.getItem('mnemonic_user_cards');
        if (localRaw && fetched.length === 0) {
          try {
            const localCards = JSON.parse(localRaw);
            if (localCards.length > 0) {
              const batch = writeBatch(db);
              localCards.forEach(card => {
                const docId = card.id || doc(collection(db, 'dummy')).id; 
                const docRef = doc(db, 'users', currentUid, 'cards', docId);
                batch.set(docRef, { ...card, id: docId });
              });
              await batch.commit();
              localStorage.removeItem('mnemonic_user_cards');
              fetched = localCards;
            }
          } catch(e) { console.error("마이그레이션 실패:", e); }
        }

        setUserCards(fetched);
        setLoading(false); // 실제 서버 혹은 캐시 데이터가 들어온 직후 로딩 해제
      }, (error) => {
        console.error("Firestore 리스너 오류:", error);
        setLoading(false);
      });
    });

    // 컴포넌트 언마운트 시 리스너 누수 방지 (가장 중요)
    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const allCards = [...builtinCards, ...userCards];

  const addCard = useCallback(async (card) => {
    if (!uid) return;
    const docRef = doc(collection(db, 'users', uid, 'cards'));
    await setDoc(docRef, { ...card, id: docRef.id });
  }, [uid]);

  const addCards = useCallback(async (incoming) => {
    if (!uid) return 0;
    const existing = [...builtinCards, ...userCards];
    const newCards = incoming.filter((c) => !existing.some((e) => isDuplicate(e, c)));
    if (newCards.length === 0) return 0;

    const batch = writeBatch(db);
    newCards.forEach((card) => {
      const docRef = doc(collection(db, 'users', uid, 'cards'));
      batch.set(docRef, { ...card, id: docRef.id });
    });
    await batch.commit();
    return newCards.length;
  }, [uid, userCards]);

  const updateCard = useCallback(async (id, updated) => {
    if (!uid || !id) return;
    await setDoc(doc(db, 'users', uid, 'cards', id), updated, { merge: true });
  }, [uid]);

  const deleteCard = useCallback(async (id) => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'cards', id));
  }, [uid]);

  const reorderCard = useCallback(() => {}, []);

  const deleteBy = useCallback(async ({ subject, part }) => {
    if (!uid) return 0;
    const batch = writeBatch(db);
    let removed = 0;
    userCards.forEach((c) => {
      const ms = !subject || subject === '전체' || c.subject === subject;
      const mp = !part || part === '전체' || c.part === part;
      if (ms && mp) {
        batch.delete(doc(db, 'users', uid, 'cards', c.id));
        removed++;
      }
    });
    await batch.commit();
    return removed;
  }, [uid, userCards]);

  const countBy = useCallback(({ subject, part }) =>
    userCards.filter((c) => {
      const ms = !subject || subject === '전체' || c.subject === subject;
      const mp = !part || part === '전체' || c.part === part;
      return ms && mp;
    }).length
  , [userCards]);

  const deduplicateSelf = useCallback(async () => {
    if (!uid) return 0;
    const batch = writeBatch(db);
    let removed = 0;
    const kept = [];

    userCards.forEach((card) => {
      const isBuiltinDup = builtinCards.some((b) => isDuplicate(b, card));
      const isSelfDup = kept.some((k) => isDuplicate(k, card));
      
      if (isBuiltinDup || isSelfDup) {
        batch.delete(doc(db, 'users', uid, 'cards', card.id));
        removed++;
      } else {
        kept.push(card);
      }
    });
    
    if (removed > 0) await batch.commit();
    return removed;
  }, [uid, userCards]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(allCards, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `mnemonic_cards_${new Date().toISOString().slice(0,10)}.json`; a.click();
  }, [allCards]);

  const importJSON = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('올바른 JSON 형식이 아닙니다');
        const added = await addCards(data);
        resolve({ added, skipped: data.length - added });
      } catch (err) { reject(err); }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  }), [addCards]);

  const duplicateCount = (() => {
    const withoutBuiltin = userCards.filter((c) => !builtinCards.some((b) => isDuplicate(b, c)));
    const kept = [];
    withoutBuiltin.forEach(c => { if(!kept.some(k => isDuplicate(k, c))) kept.push(c); });
    return withoutBuiltin.length - kept.length;
  })();

  const subjects = [...new Set(allCards.map((c) => c.subject))];
  const parts = (subject) => [...new Set(allCards.filter((c) => c.subject === subject).map((c) => c.part))];

  return {
    allCards, userCards, builtinCards, loading,
    addCard, addCards, deleteCard, updateCard,
    moveCard: reorderCard, reorderCard, deleteBy, countBy,
    exportJSON, importJSON, deduplicateSelf, duplicateCount,
    subjects, parts,
  };
}
