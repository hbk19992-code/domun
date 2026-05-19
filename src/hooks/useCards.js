import { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, query } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, signInWithPopup, signOut, linkWithPopup } from 'firebase/auth';
import { db, auth, googleProvider } from '../utils/firebase';
import { builtinCards } from '../data/mnemonics';
import { isDuplicate } from '../utils/dedup';

export function useCards() {
  const [userCards, setUserCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);

  // 계정 상태 관리
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    let unsubscribeSnapshot = null;

    // 1. Auth 인증 상태 변화를 먼저 감시
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("익명 로그인 실패:", err);
          setLoading(false);
        }
        return;
      }

      // 유저 정보 업데이트
      setIsAnonymous(user.isAnonymous);
      setUserEmail(user.email || '');

      const currentUid = user.uid;
      setUid(currentUid);

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }

      // 2. 인증이 확실히 끝난 시점에만 Firestore 리스너 연결
      const cardsRef = collection(db, 'users', currentUid, 'cards');
      const q = query(cardsRef);

      unsubscribeSnapshot = onSnapshot(q, async (snapshot) => {
        let fetched = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));

        // [마이그레이션] 옛날 로컬스토리지에 데이터가 남아있다면 클라우드로 자동 이관
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
              localStorage.removeItem('mnemonic_user_cards'); // 이관 완료 후 삭제
              fetched = localCards;
            }
          } catch(e) { console.error("마이그레이션 실패:", e); }
        }

        setUserCards(fetched);
        setLoading(false); // 데이터 로드 완료 시 로딩 해제
      }, (error) => {
        console.error("Firestore 리스너 오류:", error);
        setLoading(false);
      });
    });

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

  // 구글 연동/로그인 함수 (linkWithPopup 적용)
  const loginWithGoogle = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (user && user.isAnonymous) {
        await linkWithPopup(user, googleProvider);
        console.log("구글 계정 연동 완료 (데이터 유지)");
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      console.error("구글 연동/로그인 실패:", err);
      if (err.code === 'auth/credential-already-in-use') {
        alert("이미 사용 중인 구글 계정입니다. 연동 대신 기존 계정으로 로그인합니다.");
        await signInWithPopup(auth, googleProvider);
      }
    }
  }, []);

  // 로그아웃 함수
  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("로그아웃 실패:", err);
    }
  }, []);

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
    isAnonymous, userEmail, loginWithGoogle, handleLogout
  };
}
