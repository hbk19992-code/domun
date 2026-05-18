import { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, query } from 'firebase/firestore';
import { signInAnonymously, linkWithPopup, signInWithPopup, signOut } from 'firebase/auth';
import { db, auth, googleProvider } from '../utils/firebase';
import { builtinCards } from '../data/mnemonics';
import { isDuplicate } from '../utils/dedup';

export function useCards() {
  const [userCards, setUserCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let unsubscribeCards;

    const unsubscribeAuth = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const cardsRef = collection(db, 'users', currentUser.uid, 'cards');
        const q = query(cardsRef);

        if (unsubscribeCards) unsubscribeCards();

        unsubscribeCards = onSnapshot(q, async (snapshot) => {
          let fetched = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));

          // 로컬 스토리지 데이터 자동 백업 마이그레이션
          const localRaw = localStorage.getItem('mnemonic_user_cards');
          if (localRaw && fetched.length === 0) {
            try {
              const localCards = JSON.parse(localRaw);
              if (localCards.length > 0) {
                const batch = writeBatch(db);
                localCards.forEach(card => {
                  const docId = card.id || doc(collection(db, 'dummy')).id; 
                  const docRef = doc(db, 'users', currentUser.uid, 'cards', docId);
                  batch.set(docRef, { ...card, id: docId });
                });
                await batch.commit();
                localStorage.removeItem('mnemonic_user_cards');
                fetched = localCards;
              }
            } catch(e) { console.error(e); }
          }
          setUserCards(fetched);
          setLoading(false);
        });
      } else {
        // 인증 상태가 없으면 백그라운드 익명 로그인 실행
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Anonymous Auth Error:", error);
          setLoading(false);
        }
      }
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeCards) unsubscribeCards();
    };
  }, []);

  const uid = user?.uid || null;
  const isAnonymous = user?.isAnonymous || false;
  const userEmail = user?.email || null;

  // 구글 계정 연동 및 로그인 처리
  const loginWithGoogle = useCallback(async () => {
    if (!auth.currentUser) return;

    if (auth.currentUser.isAnonymous) {
      try {
        // 익명 계정에 구글 계정 링크 (기존 데이터 보존)
        await linkWithPopup(auth.currentUser, googleProvider);
        alert('구글 계정 연동에 성공했습니다! 이제 다른 기기에서도 데이터가 동기화됩니다.');
      } catch (error) {
        // 이미 해당 구글 계정으로 가입된 이력이 있는 경우 전환 로그인 처리
        if (error.code === 'auth/credential-already-in-use') {
          if (window.confirm('이미 가입된 구글 계정입니다. 해당 계정으로 전환하시겠습니까?\n(주의: 현재 기기에 저장된 임시 데이터는 유실될 수 있습니다)')) {
            await signInWithPopup(auth, googleProvider);
          }
        } else {
          console.error("Google Link Error:", error);
          alert("연동 실패: " + error.message);
        }
      }
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (window.confirm('로그아웃 하시겠습니까?\n익명 상태일 경우 로그아웃 시 데이터가 모두 유실될 수 있습니다.')) {
      await signOut(auth);
      setUser(null);
      setLoading(true);
    }
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
    isAnonymous, userEmail, loginWithGoogle, handleLogout, // 내보내기 항목 추가
    addCard, addCards, deleteCard, updateCard,
    moveCard: reorderCard, reorderCard, deleteBy, countBy,
    exportJSON, importJSON, deduplicateSelf, duplicateCount,
    subjects, parts,
  };
}
